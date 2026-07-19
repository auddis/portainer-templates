<script lang="ts">
  import Highlight from 'svelte-highlight';
  import caddyLang from 'svelte-highlight/languages/caddy';
  import nginxLang from 'svelte-highlight/languages/nginx';
  import yamlLang from 'svelte-highlight/languages/yaml';
  import type { Template, Service } from '$src/Types';
  import Collapsible from '$lib/Collapsible.svelte';

  let { template, services = [] }: { template: Template; services?: Service[] } = $props();

  type Port = { host: string; container: string; svc?: string };
  type Flavour = 'caddy' | 'nginx' | 'traefik';

  const WEB = ['443', '80', '8080', '3000', '8000', '8443', '8096', '9000'];
  const DOMAIN_RE = '([a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,}';
  const PORT_RE = '[0-9]{1,5}';
  const PATH_RE = '/\\S*';
  const NAME_RE = '[a-zA-Z0-9][a-zA-Z0-9_.-]*';
  const HOST_RE = '[a-zA-Z0-9._-]+';
  const IDENT_RE = '[a-zA-Z0-9_-]+';
  const SIZE_RE = '[0-9]+[kKmMgG]?';

  const slugify = (s: string) =>
    (s || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app';

  // keep only numeric tcp ports; tolerate ${VAR}, ranges and junk from stackfiles
  const parsePorts = (ports: unknown): Port[] =>
    (Array.isArray(ports) ? ports : []).flatMap((p) => {
      if (typeof p !== 'string') return [];
      const [mapping, proto = 'tcp'] = p.split('/');
      if (proto !== 'tcp') return [];
      const parts = mapping.split(':');
      const container = parts[parts.length - 1].split('-')[0];
      const host = (parts.length > 1 ? parts[parts.length - 2] : container).split('-')[0];
      return /^\d+$/.test(container) && /^\d+$/.test(host) ? [{ host, container }] : [];
    });

  const keyOf = (p: Port) => `${p.svc ?? ''}|${p.host}|${p.container}`;

  const slug = $derived(slugify(template?.title ?? 'app'));
  const appName = $derived(template?.name ?? services.find((s) => s.name)?.name ?? slug);
  const fromServices = $derived(services.length > 0);
  const sources = $derived(fromServices ? services : [template]);
  const candidates = $derived(
    sources
      .flatMap((s) => parsePorts(s?.ports).map((p) => ({ ...p, svc: fromServices ? s?.name : undefined })))
      .filter((p, i, a) => a.findIndex((x) => keyOf(x) === keyOf(p)) === i),
  );
  const multiSvc = $derived(sources.length > 1);
  const best = $derived(candidates.find((p) => WEB.includes(p.container)) ?? candidates[0] ?? null);
  const portOptions = $derived([
    ...new Map(
      candidates.flatMap((p): [string, string][] => {
        const svc = multiSvc && p.svc ? `${p.svc} ` : '';
        return [[p.container, `${svc}container port`], [p.host, `${svc}host port`]];
      }),
    ),
  ]);

  // empty inputs fall back to a sensible default, so output is always valid
  let flavour = $state<Flavour>('caddy');
  let portInput = $state('');
  let topoOverride = $state<'network' | 'host' | null>(null);
  let schemeOverride = $state<'http' | 'https' | null>(null);
  let domainInput = $state('');
  let nameInput = $state('');
  let hostInput = $state('');
  let tls = $state(true);
  let websockets = $state(true);
  let email = $state('');
  let uploadSize = $state('');
  let entrypoint = $state('');
  let certResolver = $state('');
  let certPath = $state('');
  let keyPath = $state('');
  let advanced = $state(false);
  let copied = $state(false);

  const defaultTopo = $derived<'network' | 'host'>(template?.network === 'host' ? 'host' : 'network');
  const topology = $derived(topoOverride ?? defaultTopo);
  // host networking ignores mappings, so the app is reachable on its container port
  const suggestedPort = $derived(
    !best
      ? ''
      : flavour === 'traefik' || topology === 'network' || template?.network === 'host'
        ? best.container
        : best.host,
  );
  const upstreamPort = $derived(portInput.trim() || suggestedPort);
  const autoScheme = $derived<'http' | 'https'>(['443', '8443'].includes(upstreamPort) ? 'https' : 'http');
  const scheme = $derived(schemeOverride ?? autoScheme);
  const domain = $derived(domainInput.trim() || `${slug}.example.com`);
  const upstreamName = $derived(nameInput.trim() || best?.svc || appName);
  const upstreamHost = $derived(hostInput.trim() || 'localhost');
  const target = $derived(topology === 'network' ? `${upstreamName}:${upstreamPort}` : `${upstreamHost}:${upstreamPort}`);

  const caddy = () => {
    const site = tls ? domain : `http://${domain}`;
    const head = tls && email.trim() ? `{\n\temail ${email.trim()}\n}\n\n` : '';
    const body = scheme === 'https'
      ? `\treverse_proxy https://${target} {\n\t\ttransport http {\n\t\t\ttls_insecure_skip_verify\n\t\t}\n\t}`
      : `\treverse_proxy ${scheme}://${target}`;
    return `${head}${site} {\n${body}\n}`;
  };

  const nginx = () => {
    const ws = websockets
      ? '\n        proxy_http_version 1.1;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection "upgrade";'
      : '';
    const loc = `    location / {
        client_max_body_size ${uploadSize.trim() || '100M'};
        proxy_pass ${scheme}://${target};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;${ws}
    }`;
    if (!tls) return `server {\n    listen 80;\n    server_name ${domain};\n\n${loc}\n}`;
    return `server {
    listen 80;
    server_name ${domain};
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name ${domain};

    ssl_certificate     ${certPath.trim() || '/etc/ssl/certs/fullchain.pem'};
    ssl_certificate_key ${keyPath.trim() || '/etc/ssl/private/privkey.pem'};

${loc}
}`;
  };

  const traefik = () => {
    const ep = entrypoint.trim() || (tls ? 'websecure' : 'web');
    const cr = certResolver.trim() || 'letsencrypt';
    const lines = [
      'labels:',
      '  - "traefik.enable=true"',
      `  - "traefik.http.routers.${slug}.rule=Host(\`${domain}\`)"`,
      `  - "traefik.http.routers.${slug}.entrypoints=${ep}"`,
    ];
    if (tls) lines.push(`  - "traefik.http.routers.${slug}.tls.certresolver=${cr}"`);
    lines.push(`  - "traefik.http.services.${slug}.loadbalancer.server.port=${upstreamPort}"`);
    if (scheme === 'https') {
      lines.push(
        `  - "traefik.http.services.${slug}.loadbalancer.server.scheme=https"`,
        `  - "traefik.http.serversTransports.${slug}-insecure.insecureSkipVerify=true"`,
        `  - "traefik.http.services.${slug}.loadbalancer.serversTransport=${slug}-insecure@docker"`,
      );
    }
    return lines.join('\n');
  };

  const language = $derived(flavour === 'nginx' ? nginxLang : flavour === 'traefik' ? yamlLang : caddyLang);
  const caption = $derived(
    flavour === 'nginx'
      ? `Save as /etc/nginx/conf.d/${slug}.conf, then reload nginx`
      : flavour === 'traefik'
        ? 'Add these labels to the service in your compose file'
        : 'Add this to your Caddyfile',
  );

  const output = $derived.by(() => {
    if (!upstreamPort) return '';
    try {
      return flavour === 'nginx' ? nginx() : flavour === 'traefik' ? traefik() : caddy();
    } catch {
      return '';
    }
  });

  const copy = async () => {
    try {
      await navigator?.clipboard?.writeText(output);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {}
  };
</script>

{#if candidates.length}
  <Collapsible title="Proxy configurator">
    <div class="reverse-proxy">
        <p class="intro">
          Serve {template.title} on your own domain behind Caddy, Nginx or Traefik. Fill in your domain and copy the
          result. It's a starting point, some apps need their own base URL or extra headers set too.
        </p>

        <div class="form">
          <label>
            <span>Proxy</span>
            <select bind:value={flavour}>
              <option value="caddy">Caddy</option>
              <option value="nginx">Nginx</option>
              <option value="traefik">Traefik</option>
            </select>
          </label>

          <label>
            <span>Domain</span>
            <input
              type="text"
              bind:value={domainInput}
              placeholder="{slug}.example.com"
              pattern={DOMAIN_RE}
              title="A domain like app.example.com"
              spellcheck="false"
              autocapitalize="off"
              autocomplete="off"
            />
          </label>

          <label>
            <span>App port</span>
            <input
              type="text"
              inputmode="numeric"
              list="rp-ports"
              bind:value={portInput}
              placeholder={suggestedPort}
              pattern={PORT_RE}
              title="Port the proxy forwards to (1-5 digits)"
              spellcheck="false"
              autocomplete="off"
            />
          </label>
          <datalist id="rp-ports">
            {#each portOptions as [num, label] (num)}
              <option value={num}>{label}</option>
            {/each}
          </datalist>

          {#if flavour !== 'traefik'}
            <label>
              <span>Upstream</span>
              <select bind:value={topoOverride}>
                <option value={null}>Auto ({defaultTopo === 'host' ? 'host' : 'same network'})</option>
                <option value="network">Same Docker network</option>
                <option value="host">Published to host</option>
              </select>
            </label>
          {/if}
        </div>

        <button type="button" class="advanced-toggle" aria-expanded={advanced} onclick={() => (advanced = !advanced)}>
          {advanced ? 'Hide' : 'Show'} advanced options
        </button>

        {#if advanced}
          <div class="form advanced">
            <label>
              <span>Upstream scheme</span>
              <select bind:value={schemeOverride}>
                <option value={null}>Auto ({autoScheme})</option>
                <option value="http">http</option>
                <option value="https">https</option>
              </select>
            </label>
            {#if flavour !== 'traefik' && topology === 'network'}
              <label>
                <span>Upstream name</span>
                <input type="text" bind:value={nameInput} placeholder={best?.svc || appName} pattern={NAME_RE} title="Container or service name" spellcheck="false" autocomplete="off" />
              </label>
            {/if}
            {#if flavour !== 'traefik' && topology === 'host'}
              <label>
                <span>Upstream host</span>
                <input type="text" bind:value={hostInput} placeholder="localhost" pattern={HOST_RE} title="Hostname or IP" spellcheck="false" autocomplete="off" />
              </label>
            {/if}
            {#if flavour === 'nginx'}
              <label class="check">
                <span>WebSockets</span>
                <span class="check-control">
                  <input type="checkbox" bind:checked={websockets} />
                  {websockets ? 'WebSockets enabled' : 'WebSockets not enabled'}
                </span>
              </label>
              <label>
                <span>Max upload size</span>
                <input type="text" bind:value={uploadSize} placeholder="100M" pattern={SIZE_RE} title="client_max_body_size, e.g. 100M (0 = unlimited)" spellcheck="false" autocomplete="off" />
              </label>
            {/if}
            {#if flavour === 'traefik'}
              <label>
                <span>Entrypoint</span>
                <input type="text" bind:value={entrypoint} placeholder={tls ? 'websecure' : 'web'} pattern={IDENT_RE} title="Traefik entrypoint name" spellcheck="false" autocomplete="off" />
              </label>
            {/if}

            <label class="check">
              <span>Enable TLS</span>
              <span class="check-control">
                <input type="checkbox" bind:checked={tls} />
                {tls ? 'TLS enabled' : 'TLS not enabled'}
              </span>
            </label>
            {#if flavour === 'caddy' && tls}
              <label>
                <span>ACME email</span>
                <input type="email" bind:value={email} placeholder="optional" title="Email for Let's Encrypt" spellcheck="false" autocomplete="off" />
              </label>
            {/if}
            {#if flavour === 'nginx' && tls}
              <label>
                <span>Certificate path</span>
                <input type="text" bind:value={certPath} placeholder="/etc/ssl/certs/fullchain.pem" pattern={PATH_RE} title="Absolute path to the certificate" spellcheck="false" autocomplete="off" />
              </label>
              <label>
                <span>Key path</span>
                <input type="text" bind:value={keyPath} placeholder="/etc/ssl/private/privkey.pem" pattern={PATH_RE} title="Absolute path to the private key" spellcheck="false" autocomplete="off" />
              </label>
            {/if}
            {#if flavour === 'traefik' && tls}
              <label>
                <span>Cert resolver</span>
                <input type="text" bind:value={certResolver} placeholder="letsencrypt" pattern={IDENT_RE} title="Traefik certificate resolver name" spellcheck="false" autocomplete="off" />
              </label>
            {/if}
          </div>
        {/if}

        {#if upstreamPort}
          <p class="target">Proxying <code>{domain}</code> to <code>{scheme}://{target}</code></p>
        {/if}

        {#if output}
          <p class="caption">{caption}</p>
          <div class="code-block">
            <button type="button" class="copy" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
            <Highlight {language} code={output} />
          </div>
        {/if}
    </div>
  </Collapsible>
{/if}

<style lang="scss">
  .reverse-proxy {
    --invalid: #e5534b;
    .intro {
      margin: 0 0 1rem;
      opacity: 0.8;
      font-size: 0.9rem;
    }
    .form {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
      gap: 0.75rem;
      &.advanced {
        margin-top: 0.75rem;
      }
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      font-size: 0.85rem;
      > span:first-child {
        opacity: 0.8;
      }
    }
    input:not([type='checkbox']),
    select {
      padding: 0.4rem 0.5rem;
      border-radius: 6px;
      border: 1px solid var(--card-2);
      background: var(--background);
      color: var(--foreground);
      font: inherit;
      font-size: 0.95rem;
      &:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -1px;
      }
    }
    input:user-invalid {
      border-color: var(--invalid);
      &:focus-visible {
        outline-color: var(--invalid);
      }
    }
    .check-control {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.5rem;
      border: 1px solid var(--card-2);
      border-radius: 6px;
      background: var(--background);
      font-size: 0.95rem;
      cursor: pointer;
      input {
        width: 1rem;
        height: 1rem;
        margin: 0;
        accent-color: var(--accent);
        flex-shrink: 0;
      }
    }
    .advanced-toggle {
      margin-top: 0.75rem;
      padding: 0;
      background: none;
      border: none;
      color: var(--accent);
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
      text-decoration: underline;
    }
    .target {
      margin: 1rem 0 0.25rem;
      font-size: 0.85rem;
      opacity: 0.8;
      code {
        background: var(--background);
        padding: 0.1em 0.4em;
        border-radius: 4px;
      }
    }
    .caption {
      margin: 0.75rem 0 0.4rem;
      font-size: 0.9rem;
    }
    .code-block {
      position: relative;
      background: var(--card-2);
      border-radius: 6px;
      padding: 0.5rem;
      .copy {
        position: absolute;
        right: 0.5rem;
        top: 0.5rem;
        z-index: 1;
        background: var(--background);
        padding: 0.25rem 0.6rem;
        border-radius: 6px;
        border: none;
        color: var(--foreground);
        font: inherit;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s ease-in-out;
        &:hover {
          background: var(--gradient);
        }
      }
      :global(pre) {
        margin: 0;
        overflow-x: auto;
      }
      :global(.hljs) {
        background: var(--card-2);
        padding: 0;
        font-size: 0.9rem;
        line-height: 1.5;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .copy {
        transition: none;
      }
    }
  }
</style>

<script lang="ts">
  import codeHighlighting from 'svelte-highlight/styles/dracula';
  import yamlHighlight from 'svelte-highlight/languages/yaml';
  import iniHighlight from 'svelte-highlight/languages/ini';
  import { dockerRunHighlight } from '$lib/docker-run-lang';
  import CodeBlock from '$lib/CodeBlock.svelte';
  import ConfigForm from './ConfigForm.svelte';
  import { fromTemplate, toService, validate, patterns, traefikLabels, traefikHost, METHODS, availableMethods, methodFields, maskConfig, ALL_FIELDS } from './config';
  import type { ConfigData, MethodId, ServiceConfig } from './config';
  import {
    appSlug,
    isNetworkMode,
    envFileContent,
    orderByDependencies,
    generateDockerRunCommand,
    convertToDockerCompose,
    convertPortainerStackToDockerCompose,
    convertToSwarmStack,
    convertToKubernetes,
    convertToQuadlet,
  } from '$src/utils/template-to-docker-parser';
  import type { LanguageFn } from 'highlight.js';
  import type { Service, Template } from '$src/Types';

  type Block = { file?: string; code: string; language: { name: string; register: LanguageFn } };

  let { data, version = $bindable('latest'), hint = true }: { data: ConfigData; version?: string; hint?: boolean } = $props();

  const id = $props.id();
  // form state forks from the data prop, parents remount this per app via {#key}
  // svelte-ignore state_referenced_locally
  const named = { ...data.template, name: data.template.name || appSlug(data.template) };

  // svelte-ignore state_referenced_locally
  let configs = $state<ServiceConfig[]>((data.services.length > 1 ? data.services : [named]).map(fromTemplate));
  let method = $state<MethodId | null>(null);
  let replicas = $state(1);
  let namespace = $state('');
  let serviceType = $state<'LoadBalancer' | 'NodePort' | 'ClusterIP'>('LoadBalancer');
  let pvcSize = $state('');
  let storageClass = $state('');
  let swarmMode = $state<'replicated' | 'global'>('replicated');
  let placement = $state('');
  let portMode = $state<'ingress' | 'host'>('ingress');
  let quadletScope = $state<'user' | 'system'>('user');
  let autoUpdate = $state(false);

  const available = $derived(availableMethods(data));
  const single = $derived(configs.length === 1);
  const slug = $derived(appSlug(data.template));
  const withVersion = $derived(single && !!data.meta?.versions.length);

  const fields = $derived(method ? methodFields(method) : ALL_FIELDS);
  // form binds raw configs; generation reads the masked copy so hidden fields can't dead-end it
  const active = $derived(configs.map((cfg) => maskConfig(cfg, fields)));

  const pinnedTag = $derived.by(() => {
    const tag = /:([^/:]+)$/.exec((data.template.image ?? '').split('@')[0])?.[1];
    return tag && tag !== 'latest' ? tag : null;
  });
  const versionOptions = $derived.by(() => {
    const names = (data.meta?.versions ?? []).map((v) => v.name);
    return pinnedTag && !names.includes(pinnedTag) ? [pinnedTag, ...names] : names;
  });

  const formProblems = $derived(
    active.flatMap((cfg, i) => validate(cfg, single ? '' : `${cfg.name || `service ${i + 1}`}: `, !single)),
  );
  const extraProblems = $derived.by(() => {
    const errors: string[] = [];
    active.forEach((cfg, i) => {
      const original = single ? data.template.image : data.services[i]?.image;
      if (original && !cfg.image.trim()) errors.push(single ? 'an image is required' : `${cfg.name || `service ${i + 1}`}: an image is required`);
    });
    if (method === 'kubernetes') {
      if (namespace && !new RegExp(`^(${patterns.namespace})$`).test(namespace)) errors.push('namespace should be a lowercase name, like "media"');
      if (pvcSize && !new RegExp(`^(${patterns.quantity})$`).test(pvcSize)) errors.push('volume size should look like 1Gi or 500Mi');
      if (storageClass && !new RegExp(`^(${patterns.k8sName})$`).test(storageClass)) errors.push('storage class should be a lowercase name, like "local-path"');
      if (active[0]?.traefik.enabled && !active[0].ports.some((p) => p.container)) errors.push('an ingress needs at least one port mapping');
      if (active[0]?.ports.some((p) => p.host.includes('-') || p.container.includes('-'))) errors.push("kubernetes services can't use port ranges, list each port on its own row");
      const net = active[0]?.network.trim();
      if (net && net !== 'host' && net !== 'bridge') errors.push("kubernetes pods can't join docker networks, clear the network field or use host");
      const usr = active[0]?.user.trim();
      if (usr && !/^\d+(:\d+)?$/.test(usr)) errors.push('kubernetes needs a numeric user, like 1000 or 1000:1000');
    }
    if (!single) {
      const names = active.map((cfg) => cfg.name.trim()).filter(Boolean);
      const dupName = names.find((name, i) => names.indexOf(name) !== i);
      if (dupName) errors.push(`service names must be unique, "${dupName}" is used twice`);
    }
    const hostPorts = active.flatMap((cfg) => cfg.ports.filter((p) => p.host).map((p) => `${p.host}/${p.protocol}`));
    const dupPort = hostPorts.find((port, i) => hostPorts.indexOf(port) !== i);
    if (dupPort) errors.push(`host port ${dupPort.split('/')[0]} is mapped more than once`);
    // replicas can't share per-node storage, so block the footgun early
    if ((method === 'kubernetes' || (method === 'docker-swarm' && swarmMode === 'replicated')) && Number(replicas) > 1) {
      const cfg = active[0];
      if (cfg?.volumes.some((v) => v.container.trim()) || cfg?.devices.some((d) => d.host.trim()))
        errors.push("multiple replicas can't safely share this app's volumes, set replicas to 1 or remove the volumes");
    }
    return errors;
  });
  const problems = $derived([...extraProblems, ...formProblems]);
  // labels reach traefik directly for run/compose/quadlet; swarm and k8s have their own routes below
  const builtServices = $derived(active.map((cfg) => {
    const svc = toService(cfg, withVersion ? version : null);
    // swarm can't read env files, everywhere else values move out of the main config
    if (cfg.envFile && svc.env?.length && method !== 'docker-swarm') {
      svc.env_file = method === 'podman-quadlet' ? `${slug}.env` : single ? '.env' : `${cfg.name || 'service'}.env`;
    }
    if (cfg.traefik.enabled && method !== 'kubernetes' && method !== 'docker-swarm') {
      svc.labels = [...(svc.labels ?? []), ...traefikLabels(cfg, slug)];
    }
    return svc;
  }) as Service[]);
  const builtTemplate = $derived(
    single ? ({ title: data.template.title, description: '', type: 1, ...builtServices[0] } as Template) : null,
  );

  const blocks = $derived.by((): Block[] => {
    if (!method || problems.length || !available.includes(method)) return [];
    // env values split into their own file, shown as an extra block
    const envBlocks: Block[] = builtServices
      .filter((svc) => svc.env_file && method !== 'kubernetes')
      .map((svc) => ({ file: svc.env_file, code: envFileContent(svc.env ?? []), language: iniHighlight }));
    if (method === 'docker-run') {
      const services = orderByDependencies(builtServices.filter((svc) => svc.image));
      if (single) return [...services.map((svc) => ({ code: generateDockerRunCommand(svc), language: dockerRunHighlight })), ...envBlocks];
      // a shared network fills in for compose networking, so services find each other by name
      return [
        { file: 'shared network', code: `docker network create ${slug}`, language: dockerRunHighlight },
        ...services.map((svc) => ({
          file: svc.name,
          code: generateDockerRunCommand(svc.network ? svc : { ...svc, network: slug }),
          language: dockerRunHighlight,
        })),
        ...envBlocks,
      ];
    }
    if (method === 'docker-compose') {
      const code = builtTemplate ? convertToDockerCompose(builtTemplate) : convertPortainerStackToDockerCompose(builtServices);
      return [{ code, language: yamlHighlight }, ...envBlocks];
    }
    if (!builtTemplate) return [];
    if (method === 'docker-swarm') {
      const code = convertToSwarmStack(builtTemplate, {
        replicas: Number(replicas) || 1,
        mode: swarmMode,
        placement: placement.trim(),
        portMode,
        deployLabels: active[0]?.traefik.enabled ? traefikLabels(active[0], slug) : [],
      });
      return code ? [{ code, language: yamlHighlight }] : [];
    }
    if (method === 'kubernetes') {
      const opts = {
        replicas: Number(replicas) || 1,
        namespace: namespace.trim(),
        serviceType,
        pvcSize: pvcSize.trim(),
        storageClass: storageClass.trim(),
        ...(active[0]?.traefik.enabled && {
          ingress: {
            host: traefikHost(active[0], slug),
            port: Number(active[0].traefik.port) || undefined,
            tls: active[0].traefik.tls,
            issuer: active[0].traefik.certResolver.trim(),
          },
        }),
      };
      return (convertToKubernetes(builtTemplate, opts) ?? []).map((m) => ({ file: m.file, code: m.content, language: yamlHighlight }));
    }
    const code = convertToQuadlet(builtTemplate, { scope: quadletScope, autoUpdate });
    return code ? [{ code, language: iniHighlight }, ...envBlocks] : [];
  });

  // named networks are treated as existing infra, so nudge the user to create them
  const networkNote = $derived.by(() => {
    if (!method || method === 'kubernetes') return '';
    const nets = [...new Set(builtServices.map((svc) => svc.network).filter((net): net is string => !!net && !isNetworkMode(net)))];
    if (!nets.length) return '';
    const create = method === 'podman-quadlet' ? 'podman network create' : method === 'docker-swarm' ? 'docker network create -d overlay --attachable' : 'docker network create';
    const plural = nets.length > 1;
    return ` If the ${nets.join(' and ')} network${plural ? "s don't" : " doesn't"} exist yet, create ${plural ? 'them' : 'it'} first with ${nets.map((net) => `${create} ${net}`).join(' and ')}.`;
  });

  const caption = $derived.by(() => {
    switch (method) {
      case 'docker-run': return (single
        ? 'Run this on any host with Docker installed'
        : 'Create the shared network, then start each service in order') + networkNote;
      case 'docker-compose': return 'Save as compose.yaml, then run docker compose up -d' + networkNote;
      case 'docker-swarm': return `Save as ${slug}-stack.yml, then from a manager node run docker stack deploy -c ${slug}-stack.yml ${slug}.` + networkNote;
      case 'kubernetes': return 'Save each file into a folder, then run kubectl apply -f .';
      case 'podman-quadlet': return (quadletScope === 'system'
        ? `Save as /etc/containers/systemd/${slug}.container, then run systemctl daemon-reload and systemctl start ${slug}. It'll start again at boot on its own.`
        : `Save as ~/.config/containers/systemd/${slug}.container, then run systemctl --user daemon-reload and systemctl --user start ${slug}. It starts when you log in, or run loginctl enable-linger to start at boot.`) + networkNote;
    }
    return '';
  });
</script>

<svelte:head>
  {@html codeHighlighting}
</svelte:head>

{#if available.length}
  <fieldset class="methods">
    <legend>Installation method</legend>
    {#if method}
      <button type="button" class="reset" onclick={() => (method = null)}>Reset</button>
    {/if}
    <div class="pills">
      {#each METHODS.filter((m) => available.includes(m.id)) as m (m.id)}
        <label class="pill" class:checked={method === m.id}>
          <input type="radio" name="{id}-method" value={m.id} bind:group={method} />
          <img src="https://cdn.as93.net/icons/{m.icon}/w128" alt="" width="20" height="20" loading="lazy" />
          {m.label}
        </label>
      {/each}
    </div>
  </fieldset>

  {#if !method}
    {#if hint}
      <p class="status" aria-live="polite">Now pick an installation method to build your config</p>
    {/if}
  {:else}
    {#snippet formExtras()}
      {#if withVersion}
        <label class="field">
          <span>Version</span>
          <select bind:value={version} title="Image version to install">
            <option value="latest">latest</option>
            {#each versionOptions as v (v)}
              <option value={v}>{v}{v === pinnedTag ? ' (template default)' : ''}</option>
            {/each}
          </select>
        </label>
      {/if}
      {#if method === 'docker-swarm'}
        <label class="field">
          <span>Mode</span>
          <select bind:value={swarmMode} title="Replicated runs N copies, global runs one on every node">
            <option value="replicated">Replicated</option>
            <option value="global">Global (one per node)</option>
          </select>
        </label>
      {/if}
      {#if method === 'kubernetes' || (method === 'docker-swarm' && swarmMode === 'replicated')}
        <label class="field">
          <span>Replicas</span>
          <input type="number" min="1" max="999" step="1" bind:value={replicas} title="How many copies to run" />
        </label>
      {/if}
      {#if method === 'docker-swarm'}
        <label class="field">
          <span>Placement</span>
          <input type="text" bind:value={placement} placeholder="node.role == worker"
            title="Optional constraint for which nodes can run this service" spellcheck="false" autocomplete="off" />
        </label>
        <label class="field">
          <span>Port publishing</span>
          <select bind:value={portMode} title="Ingress balances through the routing mesh, host binds directly and keeps client IPs">
            <option value="ingress">Ingress (routing mesh)</option>
            <option value="host">Host (direct)</option>
          </select>
        </label>
      {/if}
      {#if method === 'kubernetes'}
        <label class="field">
          <span>Namespace</span>
          <input type="text" bind:value={namespace} pattern={patterns.namespace} placeholder="default"
            title="Kubernetes namespace to deploy into" spellcheck="false" autocomplete="off" />
        </label>
        <label class="field">
          <span>Service type</span>
          <select bind:value={serviceType} title="How the cluster exposes the app's ports">
            <option value="LoadBalancer">LoadBalancer</option>
            <option value="NodePort">NodePort</option>
            <option value="ClusterIP">ClusterIP</option>
          </select>
        </label>
        <label class="field">
          <span>Volume size</span>
          <input type="text" bind:value={pvcSize} pattern={patterns.quantity} placeholder="1Gi"
            title="Storage requested for each volume claim" spellcheck="false" autocomplete="off" />
        </label>
        <label class="field">
          <span>Storage class</span>
          <input type="text" bind:value={storageClass} pattern={patterns.k8sName} placeholder="cluster default"
            title="StorageClass for the volume claims, like local-path or longhorn" spellcheck="false" autocomplete="off" />
        </label>
      {/if}
      {#if method === 'podman-quadlet'}
        <label class="field">
          <span>Scope</span>
          <select bind:value={quadletScope} title="Run under your user account or system-wide">
            <option value="user">User (rootless)</option>
            <option value="system">System-wide</option>
          </select>
        </label>
        <label class="field-check" title="Let podman-auto-update pull new image versions">
          <input type="checkbox" bind:checked={autoUpdate} /> Auto-update
        </label>
      {/if}
    {/snippet}

    <form onsubmit={(e) => e.preventDefault()}>
      {#each configs as config, i (i)}
        {#if !single}<h3>{config.name || `Service ${i + 1}`}</h3>{/if}
        <ConfigForm bind:config={configs[i]} nameRequired={!single}
          imageRequired={single ? !!data.template.image : !!data.services[i]?.image}
          {fields}
          traefikKind={method === 'kubernetes' ? 'ingress' : 'labels'}
          envFileKind={method === 'docker-swarm' ? null : method === 'kubernetes' ? 'secret' : 'env'}
          extras={formExtras} />
      {/each}
    </form>

    <hr />
    <h3 class="results-title">Result</h3>

    {#if problems.length}
      <ul class="problems" role="alert">
        {#each problems as problem (problem)}
          <li>{problem}</li>
        {/each}
      </ul>
    {:else if blocks.length}
      <p class="caption">{caption}</p>
      {#each blocks as block, i (block.file ?? i)}
        {#if block.file}<h4><code>{block.file}</code></h4>{/if}
        <CodeBlock code={block.code} language={block.language} />
      {/each}
      <p class="disclaimer">
        This is just a guide.
        Should work as a starting point, but give it a read and adjust to taste, before deploying.
      </p>
    {:else}
      <p class="status">
        {METHODS.find((m) => m.id === method)?.label} can't be built with these options - usually a host or custom
        network mode. Try a different network, or another install method.
      </p>
    {/if}
  {/if}
{/if}

<style lang="scss">
  .status {
    margin: 1rem 0 0;
    opacity: 0.8;
  }
  .methods {
    position: relative;
    display: block;
    margin: 1rem 0 0;
    padding: 0.75rem;
    border: none;
    border-radius: 6px;
    background: var(--card-2);
    .reset {
      position: absolute;
      top: 0.6rem;
      right: 0.75rem;
      padding: 0;
      background: none;
      border: none;
      color: var(--accent);
      font: inherit;
      font-size: 0.75rem;
      cursor: pointer;
      &:hover {
        text-decoration: underline;
      }
      &:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
    }
    legend {
      float: left;
      width: 100%;
      padding: 0;
      margin: 0 0 0.6rem;
      font-size: 0.7rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      opacity: 0.6;
    }
    .pills {
      clear: both;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .pill {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.4rem 0.75rem;
      border-radius: 6px;
      background: var(--background);
      border: 1px solid transparent;
      cursor: pointer;
      font-size: 0.95rem;
      transition: all 0.2s ease-in-out;
      input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }
      &:hover {
        box-shadow: var(--shadow);
      }
      &.checked {
        border-color: var(--accent);
        color: var(--accent);
      }
      &:has(input:focus-visible) {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
    }
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.85rem;
    > span:first-child {
      opacity: 0.8;
    }
    input,
    select {
      min-width: 0;
      padding: 0.4rem 0.5rem;
      border-radius: 6px;
      border: 1px solid transparent;
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
      border-color: #e5534b;
      &:focus-visible {
        outline-color: #e5534b;
      }
    }
  }
  .field-check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    border-radius: 6px;
    background: var(--background);
    font-size: 0.9rem;
    cursor: pointer;
    input {
      width: 1rem;
      height: 1rem;
      margin: 0;
      accent-color: var(--accent);
      flex-shrink: 0;
    }
  }
  form {
    margin: 1rem 0 0;
    h3 {
      margin: 1.25rem 0 0.5rem;
      font-size: 1.3rem;
      font-weight: 500;
    }
  }
  hr {
    margin: 1.25rem 0 0;
    border: none;
    border-top: 2px solid var(--card-2);
  }
  .results-title {
    margin: 0.75rem 0 0;
    font-size: 1.5rem;
    font-weight: 500;
  }
  .problems {
    margin: 1rem 0 0;
    padding: 0.75rem 1rem 0.75rem 2rem;
    background: #e5534b1f;
    border-radius: 1px 6px 6px 1px;
    border-left: 3px solid #e5534b;
    border-radius: 6px;
    font-size: 0.9rem;
    li {
      margin: 0.15rem 0;
    }
  }
  .caption {
    margin: 0.25rem 0 0.25rem;
  }
  .disclaimer {
    margin: 0.75rem 0 0;
    font-size: 0.85rem;
    opacity: 0.5;
    font-style: italic;
    color: #e5534b;
  }
  h4 {
    margin: 0.75rem 0 0;
    code {
      background: var(--card-2);
      border-radius: 6px;
      padding: 0 0.25rem;
      font-weight: 400;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .methods .pill {
      transition: none;
    }
  }
</style>

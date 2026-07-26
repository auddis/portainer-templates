<script lang="ts">
  import { envValue } from '$src/utils/template-to-docker-parser';
  import { formatBytes } from '$lib/format';
  import type { Template, Service, DockerMeta, TemplateOrService, Environment, ProjectStats } from '$src/Types';
  import Collapsible from '$lib/Collapsible.svelte';

  let { template, dockerMeta = null, project = null, services = [] }: {
    template: Template;
    dockerMeta?: DockerMeta | null;
    project?: ProjectStats | null;
    services?: Service[];
  } = $props();

  type Node = string | { code: string };
  type Explainer = { title: string; body: Node[]; items?: Node[][] };

  // compose lets command/entrypoint be a string or a list, so flatten either into one readable line
  const asText = (value: unknown): string =>
    Array.isArray(value) ? value.map(String).join(' ') : typeof value === 'string' ? value : '';

  // swap ${VAR:-default} for its fallback and ${VAR} for the plain name, so image/value specs read cleanly
  const resolveVars = (text: string): string =>
    text.replace(/\$\{([^}]+)\}/g, (_, inner) => {
      const fallback = inner.match(/^[A-Za-z0-9_]+:?-(.*)$/);
      if (fallback) return fallback[1];
      if (/^[A-Za-z0-9_]+:?\?/.test(inner)) return '';
      return inner.split(/[:?}-]/)[0];
    });

  const appName = $derived(template.title || 'this app');
  const isMulti = $derived(services.length > 1);
  const sources = $derived<TemplateOrService[]>(isMulti ? services : [template]);

  const rawImage = $derived(template.image ?? sources.find((s) => s.image)?.image ?? null);
  const image = $derived(rawImage ? resolveVars(rawImage) : null);
  const imageTag = $derived(image ? (image.match(/:([^/:]+)$/)?.[1] ?? 'latest') : null);
  const usesLatest = $derived(imageTag === 'latest');
  const latestVersion = $derived(
    dockerMeta?.latestVersion && dockerMeta.latestVersion.toLowerCase() !== 'latest' ? dockerMeta.latestVersion : null,
  );

  // drop numbers-only checks on interpolated specs, they can't be read cleanly
  const isInterpolated = (value: string): boolean => value.includes('${');
  const isHostPath = (bind: string): boolean => /^[/~.]/.test(bind);

  // compose values can be ${VAR}, ${VAR:-default} or ${VAR:?required}, so tease out what the user actually gets
  type EnvHint = { value?: string; required?: boolean; fromHost?: boolean };
  const readEnvValue = (raw: string): EnvHint => {
    const inner = String(raw).match(/^\$\{(.+)\}$/)?.[1];
    if (inner === undefined) return { value: resolveVars(String(raw)) };
    if (/^[A-Za-z0-9_]+:?\?/.test(inner)) return { required: true };
    const fallback = inner.match(/^[A-Za-z0-9_]+:?-(.*)$/);
    if (fallback) return fallback[1] ? { value: fallback[1] } : { fromHost: true };
    return { fromHost: true };
  };
  const envNeedsValue = (e: Environment): boolean => {
    if (e.select?.length) return false;
    const hint = readEnvValue(envValue(e));
    return !!hint.required || (!hint.value && !hint.fromHost);
  };

  type PortRow = { host: string | null; container: string; proto: string };
  const webPorts = ['80', '443', '3000', '8000', '8080', '8096', '8123', '9000'];
  const parsePorts = (ports: unknown): PortRow[] =>
    (Array.isArray(ports) ? ports : []).filter((p): p is string => typeof p === 'string' && !isInterpolated(p)).flatMap((port) => {
      const [mapping, proto = 'tcp'] = port.split('/');
      const parts = mapping.split(':');
      const container = parts.at(-1) ?? '';
      const host = parts.length > 1 ? (parts.at(-2) ?? null) : null;
      if (!/^\d+(-\d+)?$/.test(container)) return [];
      if (host !== null && !/^\d+(-\d+)?$/.test(host)) return [];
      return [{ host, container, proto }];
    });
  const portRows = $derived(sources.flatMap((s) => parsePorts(s.ports)));
  const samplePort = $derived(portRows.find((p) => p.host) ?? portRows[0] ?? null);

  const volumes = $derived([
    ...new Map(sources.flatMap((s) => s.volumes ?? []).map((v) => [`${v.container}|${v.bind ?? ''}`, v])).values(),
  ]);

  const uniqueEnv = $derived([...new Map(sources.flatMap((s) => s.env ?? []).map((e) => [e.name, e])).values()]);
  const requiredCount = $derived(uniqueEnv.filter((e) => !e.preset && envNeedsValue(e)).length);
  const hasPuid = $derived(uniqueEnv.some((e) => e.name === 'PUID' || e.name === 'PGID'));

  const restartPolicy = $derived(template.restart_policy ?? sources.find((s) => s.restart_policy)?.restart_policy ?? null);
  const hostNetwork = $derived(template.network === 'host');
  const customNetwork = $derived(
    template.network && !['bridge', 'host', 'none'].includes(template.network) ? template.network : null,
  );
  const labels = $derived(template.labels ?? []);
  const commandVal = $derived(isMulti ? '' : asText(sources.find((s) => s.command)?.command).trim());
  const entrypointVal = $derived(isMulti ? '' : asText(sources.find((s) => s.entrypoint)?.entrypoint).trim());
  const interactive = $derived(!!template.interactive || sources.some((s) => s.interactive));
  // per-service, so only trustworthy to surface app-wide on a single container; root isn't worth a "runs as non-root" note
  const rawUser = $derived(!isMulti ? (sources.map((s) => s.user).find(Boolean) ?? null) : null);
  const runUser = $derived(rawUser && !['root', '0', '0:0'].includes(rawUser) ? rawUser : null);
  const devices = $derived(isMulti ? [] : [...new Set(sources.flatMap((s) => s.devices ?? []))]);
  const buildRaw = $derived(isMulti ? null : sources.map((s) => s.build).find(Boolean));
  const buildFrom = $derived(typeof buildRaw === 'string' && buildRaw ? buildRaw : null);
  const platform = $derived(template.platform ?? null);

  const REGISTRIES: Record<string, string> = {
    'docker.io': 'Docker Hub',
    'ghcr.io': 'the GitHub Container Registry',
    'lscr.io': "LinuxServer's registry",
    'quay.io': 'Quay',
    'gcr.io': "Google's container registry",
    'mcr.microsoft.com': "Microsoft's container registry",
    'registry.gitlab.com': 'GitLab',
    'public.ecr.aws': "Amazon's public registry",
  };
  // an image name is [registry/]namespace/repo, but the registry is only there when the first part looks like a host
  const imageInfo = $derived.by(() => {
    if (!image) return null;
    const [head, ...rest] = image.replace(/:[^/:]+$/, '').split('/');
    const hasHost = rest.length > 0 && (head.includes('.') || head.includes(':') || head === 'localhost');
    const host = hasHost ? head : 'docker.io';
    const path = hasHost ? rest.join('/') : image.replace(/:[^/:]+$/, '');
    const publisher = path.includes('/') ? path.split('/')[0] : null;
    return { registry: REGISTRIES[host] ?? host, publisher, official: host === 'docker.io' && !publisher };
  });

  const archs = $derived(dockerMeta?.architectures ?? []);
  const archText = $derived.by(() => {
    const amd = archs.some((a) => a.includes('amd64') || a.includes('386'));
    const arm = archs.some((a) => a.includes('arm'));
    if (amd && arm) return 'both regular x86 servers and ARM boards like a Raspberry Pi';
    if (arm && !amd) return 'ARM boards like a Raspberry Pi, but not regular x86 servers';
    if (amd && !arm) return 'regular x86 PCs and servers, though not ARM boards like a Raspberry Pi';
    return 'the platforms it lists';
  });
  const imageSize = $derived(formatBytes(dockerMeta?.size ?? null));

  const webPort = $derived(portRows.find((p) => p.host && webPorts.includes(p.container)) ?? null);
  const webUrl = $derived(webPort ? `${webPort.container === '443' ? 'https' : 'http'}://your-server-ip:${webPort.host}` : null);
  const noStorage = $derived(!isMulti && !!image && volumes.length === 0);

  const depNames = (deps: Service['depends_on']): string[] => (Array.isArray(deps) ? deps : Object.keys(deps ?? {}));

  // env descriptions carry markdown, so flatten links to their label and drop the rest, then sentence-case it
  const plainText = (md: string): string => {
    const text = String(md).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_~`]+/g, '').replace(/\s+/g, ' ').trim();
    return text ? text[0].toUpperCase() + text.slice(1) : '';
  };

  const healthcheck = $derived(
    isMulti ? null : (sources.map((s) => s.healthcheck).find((h): h is Record<string, unknown> => !!h) ?? null),
  );
  const healthCmd = $derived.by(() => {
    const test = healthcheck?.test;
    if (typeof test === 'string') return test;
    if (Array.isArray(test) && test.length) {
      const [kind, ...rest] = test.map(String);
      return kind === 'NONE' ? null : kind === 'CMD' || kind === 'CMD-SHELL' ? rest.join(' ') : [kind, ...rest].join(' ');
    }
    return null;
  });
  const healthEvery = $derived(healthcheck?.interval ? String(healthcheck.interval) : null);

  const restartNote =
    'You can change this on the deploy screen. The choices are no (never restart), on-failure (only after a crash), unless-stopped (restart unless you stop it), and always (bring it back no matter what).';
  const restartBody = $derived<Node[]>([
    'The restart policy here is ',
    { code: restartPolicy ?? '' },
    restartPolicy === 'always'
      ? `, so Docker brings ${appName} back up after a crash and again when the server reboots. Good for anything you want running around the clock. `
      : restartPolicy === 'unless-stopped'
        ? `, so Docker restarts ${appName} after a crash or reboot, but leaves it off when you stop it on purpose. `
        : restartPolicy === 'on-failure'
          ? `, so ${appName} only gets restarted when it exits with an error, not when it finishes cleanly or you stop it yourself. `
          : `, so ${appName} won't come back on its own after a crash or reboot. You bring it up again whenever you're ready. `,
    restartNote,
  ]);

  const explainers = $derived.by(() => {
    const items: Explainer[] = [];
    const add = (title: string, body: Node[], list?: Node[][]) => items.push({ title, body, items: list });

    add(
      template.type === 1 ? 'A single container' : template.type === 2 ? 'A Swarm stack' : 'A Compose stack',
      template.type === 1
        ? [`${appName} runs as one container, the simplest kind of app here. Just the one image to pull and nothing else wired up alongside it.`]
        : template.type === 2
          ? [`${appName} is a Swarm stack. Swarm is Docker's own way of running apps across more than one machine, so Portainer can spread it over a cluster and move it elsewhere if a server drops out.`]
          : [`${appName} is a Compose stack, a set of containers${isMulti ? ` (${services.length} of them)` : ''} defined in one file and brought up together by Portainer, then started and stopped as a single app.`],
    );

    if (isMulti) {
      add(
        'The services',
        [`This stack is built from ${services.length} containers that run side by side. Here's each one, with the image it runs and anything it waits for first:`],
        services.map((s) => {
          const li: Node[] = [{ code: s.name }];
          if (s.image) li.push(' runs ', { code: resolveVars(s.image) });
          const deps = depNames(s.depends_on).filter((n) => services.some((o) => o.name === n));
          if (deps.length) li.push(`, starts after ${deps.join(', ')}`);
          return li;
        }),
      );
    } else if (image) {
      add('The app image', [
        `An image is the app packed up ready to go, everything ${appName} needs bundled into one download. This template pulls `,
        { code: image },
        `, which Docker fetches once${imageSize ? ` (about ${imageSize})` : ''} and then starts your own copy from.`,
      ]);
      if (imageInfo) {
        const body: Node[] = [`Docker pulls its images from registries, public libraries of ready-built apps. ${appName}'s comes from ${imageInfo.registry}`];
        if (imageInfo.official) body.push(' as one of its official, curated images.');
        else if (imageInfo.publisher) body.push(', published by ', { code: imageInfo.publisher }, '.');
        else body.push('.');
        add('Where the image comes from', body);
      }
      add(
        'Version tags',
        usesLatest
          ? [
              `The bit after the colon in the image name is the version tag. Here it's `,
              { code: 'latest' },
              `, which always points at the newest build, so a redeploy can bump you to a newer release without you asking.`,
              ...(latestVersion ? [' Newest right now is ', { code: latestVersion }, '.'] : []),
              ' Pin a specific tag if you would rather stay on one version.',
            ]
          : [
              `The bit after the colon in the image name is the version tag. This one pins `,
              { code: imageTag ?? '' },
              `, so every redeploy gives you that exact build until you bump it yourself.`,
            ],
      );
      if (archs.length) {
        add('Which machines it runs on', [
          `Every image is built for particular CPU types. This one ships for `,
          { code: archs.join(', ') },
          `, so it runs on ${archText}.`,
        ]);
      }
    }

    if (portRows.length && samplePort) {
      const intro: Node[] = ['A port is the door the app answers on. '];
      if (samplePort.host)
        intro.push(
          'A mapping like ',
          { code: `${samplePort.host}:${samplePort.container}` },
          ` means it's reachable on port `,
          { code: samplePort.host },
          ` of your server, where the left number is yours to change and the right one belongs to the app.`,
        );
      else intro.push('Here the app exposes a port but leaves the host side blank, so Docker picks a free one for you.');
      if (webUrl) intro.push(` Once it's running, open `, { code: webUrl }, ` in a browser.`);
      intro.push(' It opens:');
      add(
        'Ports',
        intro,
        portRows.map((p) => {
          const li: Node[] = [{ code: p.host ? `${p.host}:${p.container}` : p.container }];
          if (p.proto !== 'tcp') li.push(` over ${p.proto.toUpperCase()}`);
          if (!p.host) li.push(', published on a random host port');
          else if (webPorts.includes(p.container)) li.push(', likely the web interface');
          return li;
        }),
      );
    }

    if (volumes.length) {
      add(
        'Volumes',
        [
          `A volume is where ${appName} keeps its files so they survive an update or a restart. Without one, anything it saves would sit inside the container and vanish the moment it's recreated. This template mounts:`,
        ],
        volumes.map((v) => {
          const li: Node[] = [{ code: v.container }];
          if (v.bind && isHostPath(v.bind)) li.push(' from ', { code: v.bind }, ' on the host');
          else if (v.bind) li.push(' kept in the ', { code: v.bind }, ' volume Docker manages');
          else li.push(' as a volume Docker manages for you');
          if (v.readonly) li.push(', read-only');
          if (typeof v.bind === 'string' && v.bind.endsWith('.sock')) li.push(' (a socket it talks to, not storage)');
          return li;
        }),
      );
    } else if (noStorage) {
      add('No stored data', [
        `This template doesn't mount any storage, so whatever ${appName} writes stays inside the container and is wiped if it's recreated or updated. That's fine for something stateless, but add a volume before trusting it with anything you want to keep.`,
      ]);
    }

    if (uniqueEnv.length) {
      add(
        'Environment variables',
        [
          `Environment variables are the settings you hand over when you deploy, things like a password or a timezone. ${appName} takes ${uniqueEnv.length} of them${
            requiredCount ? `, and ${requiredCount === 1 ? 'one needs' : `${requiredCount} need`} a value before it'll start properly` : ', all with defaults you can leave alone or tweak'
          }:`,
        ],
        uniqueEnv.map((e) => {
          const li: Node[] = [{ code: e.name }];
          if (e.select?.length) {
            li.push(', pick one of ', { code: e.select.map((o) => o.value).join(', ') });
          } else {
            const hint = readEnvValue(envValue(e));
            if (hint.required) li.push(', needs a value');
            else if (hint.fromHost) li.push(', pulled from your own environment');
            else if (hint.value) li.push(', defaults to ', { code: hint.value });
            else li.push(', needs a value');
          }
          const desc = plainText(e.description || (e.label && e.label !== e.name ? e.label : ''));
          if (desc) li.push(`. ${desc}`);
          return li;
        }),
      );
    }

    if (restartPolicy) add('Restart policy', restartBody);

    if (healthcheck) {
      add('Health check', [
        `A health check is how Docker tells whether ${appName} is really working, not just switched on. `,
        ...(healthCmd
          ? ['It runs ', { code: healthCmd }, ...(healthEvery ? [' every ', { code: healthEvery }] : []), ' and flags the container as unhealthy if that keeps failing.']
          : ['It uses the check built into the image and flags the container as unhealthy if that keeps failing.']),
      ]);
    }

    if (runUser || hasPuid) {
      const body: Node[] = [];
      if (runUser) body.push(`Inside the container the app runs as user `, { code: runUser }, ` rather than root, which keeps it away from parts of the host it has no business touching. `);
      if (hasPuid)
        body.push(
          `The `,
          { code: 'PUID' },
          ` and `,
          { code: 'PGID' },
          ` settings tell it which user and group to act as on your host. Point them at your own account (find yours with `,
          { code: 'id $USER' },
          `) so the files it writes into your mounted folders come out owned by you rather than root.`,
        );
      add('Users and permissions', body);
    }

    if (devices.length) {
      add(
        'Devices',
        [`Devices pass a piece of the host's hardware straight through to the container, like a graphics chip for transcoding or a USB adapter. This one gets:`],
        devices.map((d) => [{ code: d }]),
      );
    }

    if (hostNetwork) {
      add('Networking', [
        `${appName} runs on the host network, so it shares your server's networking directly instead of getting a private one of its own. Its ports open straight on the server with no mapping in between.`,
      ]);
    } else if (customNetwork) {
      add('Networking', [
        `${appName} joins a named network called `,
        { code: customNetwork },
        `, which needs to already exist on your host (create it with `,
        { code: `docker network create ${customNetwork}` },
        `). Other containers on the same network can then find and talk to it by name.`,
      ]);
    } else if (isMulti) {
      add('Networking', [
        `Portainer puts these services on one shared private network, so they can find each other by name (like `,
        { code: services[0].name },
        `) while only the ports above are open to you.`,
      ]);
    } else {
      add('Networking', [
        `Nothing custom is set, so ${appName} sits on Docker's default bridge network: its own private space that reaches the outside world only through the ports it publishes.`,
      ]);
    }

    if (!isMulti && template.name) {
      add('Container name', [
        `Once it's deployed, Portainer names the container `,
        { code: template.name },
        `. That's what you'll spot in the containers list and use in commands like `,
        { code: `docker logs ${template.name}` },
        `.`,
      ]);
    }

    if (template.hostname) {
      add('Hostname', [
        `The container's hostname is set to `,
        { code: template.hostname },
        `, the name it answers to on the Docker network. Other containers sharing that network can reach it using that name.`,
      ]);
    }

    if (labels.length) {
      add(
        'Labels',
        [
          `Labels are small notes pinned to the container. They don't change how ${appName} behaves, but other tools read them, most often a reverse proxy like Traefik working out which apps to route where. This template sets:`,
        ],
        labels.map((l) => [{ code: l.value ? `${l.name}=${l.value}` : l.name }]),
      );
    }

    if (commandVal || entrypointVal) {
      const body: Node[] =
        entrypointVal && commandVal
          ? [`This template starts the container with the entrypoint `, { code: entrypointVal }, ` and the command `, { code: commandVal }, `, overriding whatever the image would run on its own.`]
          : commandVal
            ? [`The command is what runs the moment the container starts. This template sets its own, `, { code: commandVal }, `, in place of the image's default.`]
            : [`The entrypoint is the very first thing the container runs. This template sets it to `, { code: entrypointVal }, `, replacing the image's built-in one.`];
      add('Startup command', body);
    }

    if (buildFrom) {
      add('Built from source', [
        `Instead of pulling a ready-made image, this one is built on the spot from `,
        { code: String(buildFrom) },
        `. The first deploy takes a bit longer while it compiles, and the build files need to be there for it to work.`,
      ]);
    }

    if (template.privileged) {
      add('Privileged mode', [
        `This template runs ${appName} in privileged mode, which gives it nearly as much access to your server as the system itself. Some apps genuinely need it to reach hardware or manage the host, so it's one to run only if you trust the source.`,
      ]);
    }

    if (interactive) {
      add('Interactive mode', [
        `This one's built to be used interactively, so it keeps a terminal open for you to type into instead of quietly ticking along in the background.`,
      ]);
    }

    if (platform) {
      add('Platform', [`The platform is `, { code: platform }, `, the kind of system the container is built to run on. Docker and Portainer handle this on a normal Linux server.`]);
    }

    if (project?.license) {
      add('Open source license', [
        `${appName} is open source, released under the `,
        { code: project.license },
        ` license. In plain terms the code is out in the open, so you're free to run it and change it to fit what you need.`,
      ]);
    }

    add('Portainer app templates', [
      `Zooming out, this whole page comes from a Portainer app template: a short recipe telling Portainer how to set ${appName} up. Add the template list to Portainer once, then deploying ${appName} is a click rather than a wall of config.`,
    ]);

    return items.filter((e) => e.body.some((n) => (typeof n === 'string' ? n.trim() : true)) || e.items?.length);
  });
</script>

<Collapsible title="Config glossary">
  <div class="explainer">
    {#each explainers as item (item.title)}
      <div class="explainer-item">
        <h3>{item.title}</h3>
        <p>{#each item.body as node, i (i)}{#if typeof node === 'string'}{node}{:else}<code>{node.code}</code>{/if}{/each}</p>
        {#if item.items?.length}
          <ul>
            {#each item.items as entry, i (i)}
              <li>{#each entry as node, j (j)}{#if typeof node === 'string'}{node}{:else}<code>{node.code}</code>{/if}{/each}</li>
            {/each}
          </ul>
        {/if}
      </div>
    {/each}
  </div>
</Collapsible>

<style lang="scss">
  .explainer {
    .explainer-item {
      &:not(:last-child) {
        padding-bottom: 1rem;
        border-bottom: 2px solid var(--background);
        margin-bottom: 1rem;
      }
      h3 {
        margin: 0 0 0.25rem;
        font-size: 1.4rem;
        font-weight: 500;
      }
      p {
        margin: 0;
      }
      ul {
        margin: 0.5rem 0 0;
        padding-left: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      code {
        background: var(--background);
        padding: 0.1em 0.4em;
        border-radius: 4px;
        font-size: 0.95em;
        overflow-wrap: anywhere;
      }
    }
  }
</style>

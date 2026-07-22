import yaml from 'js-yaml';
import type { Template, Service, Volume, Environment, Label, DependsOn, DockerCompose, DockerComposeService, TemplateOrService } from '$src/Types';

// a template merged with its stackfile service, so it may carry service-only fields
type MergedTemplate = Template & Partial<Service>;

export const envValue = (env: Environment): string =>
  env.value ?? env.default ?? env.select?.find((option) => option.default)?.value ?? '';

export const appSlug = (template: Template): string =>
  template.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app';

// the user's chosen name wins, falling back to a slug of the title
const serviceName = (template: MergedTemplate): string => template.name?.trim() || appSlug(template);

// kubernetes names must be dns-safe
const dnsName = (value: string): string => value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

const volumeBinding = (volume: Volume): string => {
  const binding = volume.bind ? `${volume.bind}:${volume.container}` : volume.container;
  return volume.bind && volume.readonly ? `${binding}:ro` : binding;
};

// single-quote a value, but only when it could break the shell
const shellQuote = (value: string): string =>
  /^[a-zA-Z0-9_@%+=:,.\/-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;

// split a command line into args, keeping quoted chunks together
const splitArgs = (line: string): string[] =>
  (line.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((arg) => (/^(['"]).*\1$/.test(arg) ? arg.slice(1, -1) : arg));

// compose healthcheck test (string or CMD array) as a plain shell command
const healthCmd = (test: unknown): string | null => {
  if (typeof test === 'string') return test;
  if (!Array.isArray(test) || !test.length || test[0] === 'NONE') return null;
  const [kind, ...rest] = test.map(String);
  return (kind === 'CMD' || kind === 'CMD-SHELL' ? rest.join(' ') : [kind, ...rest].join(' ')) || null;
};

// "1m30s" style compose durations to whole seconds
const toSeconds = (value: unknown): number | null => {
  if (typeof value === 'number') return Math.round(value) || null;
  if (typeof value !== 'string') return null;
  const units: Record<string, number> = { ms: 0.001, s: 1, m: 60, h: 3600 };
  const parts = [...value.matchAll(/(\d+(?:\.\d+)?)\s*(ms|s|m|h)/g)];
  if (!parts.length) return /^\d+$/.test(value.trim()) ? Number(value.trim()) || null : null;
  return Math.round(parts.reduce((sum, part) => sum + Number(part[1]) * units[part[2]], 0)) || null;
};

export const envFileContent = (env: Environment[]): string =>
  env.map((entry) => `${entry.name}=${envValue(entry)}`).join('\n') + '\n';

const envMap = (env: Environment[]): Record<string, string> =>
  Object.fromEntries(env.map((entry) => [entry.name, envValue(entry)]));

const labelMap = (labels: Label[]): Record<string, string> =>
  Object.fromEntries(labels.map((label) => [label.name, label.value]));

// host/bridge/none are network modes, anything else is a named user network
export const isNetworkMode = (network: string): boolean =>
  ['bridge', 'host', 'none'].includes(network) || network.startsWith('container:');

// "data:/path" style sources are named docker volumes, not host paths
const isNamedVolume = (source: string): boolean => /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(source);

const dockerRun = (svc: TemplateOrService): string => {
  if (!svc.image) return '';
  const parts = [svc.name ? `docker run -d --name ${shellQuote(svc.name)}` : 'docker run -d'];
  if (svc.interactive) parts.push('-it');
  if (svc.privileged) parts.push('--privileged');
  if (svc.gpu) parts.push('--gpus all');
  if (svc.network) parts.push(`--network ${shellQuote(svc.network)}`);
  if (svc.hostname) parts.push(`--hostname ${shellQuote(svc.hostname)}`);
  svc.ports?.forEach((port) => parts.push(`-p ${shellQuote(port)}`));
  if (svc.env_file) parts.push(`--env-file ${shellQuote(svc.env_file)}`);
  else svc.env?.forEach((env) => parts.push(`-e ${shellQuote(`${env.name}=${envValue(env)}`)}`));
  svc.volumes?.forEach((volume) => parts.push(`-v ${shellQuote(volumeBinding(volume))}`));
  svc.devices?.forEach((device) => parts.push(`--device ${shellQuote(device)}`));
  svc.labels?.forEach((label) => parts.push(`--label ${shellQuote(`${label.name}=${label.value}`)}`));
  if (svc.user) parts.push(`--user ${shellQuote(svc.user)}`);
  if (svc.cpus) parts.push(`--cpus ${svc.cpus}`);
  if (svc.memory) parts.push(`--memory ${svc.memory}`);
  const hc = svc.healthcheck ?? {};
  const check = healthCmd(hc.test);
  if (check) {
    parts.push(`--health-cmd ${shellQuote(check)}`);
    if (hc.interval) parts.push(`--health-interval ${hc.interval}`);
    if (hc.timeout) parts.push(`--health-timeout ${hc.timeout}`);
    if (hc.retries) parts.push(`--health-retries ${hc.retries}`);
    if (hc.start_period) parts.push(`--health-start-period ${hc.start_period}`);
  }
  // --entrypoint only takes the binary, any extra words become args after the image
  const [entryBin, ...entryArgs] = svc.entrypoint ? splitArgs(svc.entrypoint) : [];
  if (entryBin) parts.push(`--entrypoint ${shellQuote(entryBin)}`);
  if (svc.restart_policy) parts.push(`--restart=${svc.restart_policy}`);
  parts.push(shellQuote(svc.image));
  const trailing = [...entryArgs.map(shellQuote), svc.command ?? ''].join(' ').trim();
  if (trailing) parts.push(trailing);
  return parts.join(' \\\n  ');
};

// keep only depends_on entries that point at services actually in the stack
const filterDeps = (deps: DependsOn, siblings: Set<string>): DependsOn =>
  Array.isArray(deps)
    ? deps.filter((name) => siblings.has(name))
    : Object.fromEntries(Object.entries(deps).filter(([name]) => siblings.has(name)));

const composeService = (svc: TemplateOrService, siblings?: Set<string>): DockerComposeService => {
  const service: DockerComposeService = {};
  if (svc.image) service.image = svc.image;
  if (svc.build) service.build = svc.build;
  if (svc.command) service.command = svc.command;
  if (svc.entrypoint) service.entrypoint = svc.entrypoint;
  if (svc.ports?.length) service.ports = svc.ports;
  if (svc.volumes?.length) service.volumes = svc.volumes.map(volumeBinding);
  if (svc.env_file) service.env_file = [svc.env_file];
  else if (svc.env?.length) service.environment = envMap(svc.env);
  if (svc.labels?.length) service.labels = labelMap(svc.labels);
  if (svc.network && svc.network !== 'default') {
    if (isNetworkMode(svc.network)) service.network_mode = svc.network;
    else service.networks = [svc.network];
  }
  if (svc.hostname) service.hostname = svc.hostname;
  if (svc.user) service.user = svc.user;
  if (svc.cpus) service.cpus = svc.cpus;
  if (svc.memory) service.mem_limit = svc.memory;
  if (svc.devices?.length) service.devices = svc.devices;
  if (svc.privileged) service.privileged = true;
  // nvidia via device reservations, the compose-spec way
  if (svc.gpu) service.deploy = { resources: { reservations: { devices: [{ driver: 'nvidia', count: 'all', capabilities: ['gpu'] }] } } };
  if (svc.interactive) {
    service.stdin_open = true;
    service.tty = true;
  }
  if (svc.healthcheck) service.healthcheck = svc.healthcheck;
  const deps = svc.depends_on && siblings ? filterDeps(svc.depends_on, siblings) : null;
  if (deps && Object.keys(deps).length) service.depends_on = deps;
  if (svc.restart_policy) service.restart = svc.restart_policy;
  return service;
};

// named networks are declared as external, since they already exist on the host;
// named volumes get a top-level declaration so compose creates them
const composeDoc = (services: DockerCompose['services']): DockerCompose => {
  const named = [...new Set(Object.values(services).flatMap((svc) => svc.networks ?? []))];
  const volNames = [...new Set(Object.values(services).flatMap((svc) => (svc.volumes ?? []).flatMap((vol) => {
    const [source, target] = vol.split(':');
    return target && isNamedVolume(source) ? [source] : [];
  })))];
  const doc: DockerCompose = { services };
  if (named.length) doc.networks = Object.fromEntries(named.map((name) => [name, { external: true }]));
  if (volNames.length) doc.volumes = Object.fromEntries(volNames.map((name) => [name, {}]));
  return doc;
};

/* start order for run commands: dependencies first, cycles fall back to given order */
const dependsOnNames = (deps?: DependsOn): string[] => (Array.isArray(deps) ? deps : Object.keys(deps ?? {}));

export const orderByDependencies = (stack: Service[]): Service[] => {
  const ordered: Service[] = [];
  const visit = (svc: Service, trail: Set<string>) => {
    if (ordered.includes(svc) || trail.has(svc.name)) return;
    trail.add(svc.name);
    dependsOnNames(svc.depends_on).forEach((name) => {
      const dep = stack.find((other) => other.name === name);
      if (dep) visit(dep, trail);
    });
    ordered.push(svc);
  };
  stack.forEach((svc) => visit(svc, new Set()));
  return ordered;
};

export const generateDockerRunCommand = (template: TemplateOrService) => dockerRun(template);

export const convertToDockerCompose = (template: Template) => {
  const service = composeService(template);
  // container_name mirrors docker run --name
  if (template.name) service.container_name = template.name;
  return yaml.dump(composeDoc({ [serviceName(template)]: service }));
};

export const convertPortainerStackToDockerCompose = (stack: Service[]) => {
  const siblings = new Set(stack.map((service) => service.name));
  return yaml.dump(composeDoc(Object.fromEntries(stack.map((service) => [service.name, composeService(service, siblings)]))));
};

const swarmRestart: Record<string, string> = {
  'always': 'any',
  'unless-stopped': 'any',
  'on-failure': 'on-failure',
  'no': 'none',
};

export interface SwarmOptions {
  replicas?: number;
  mode?: 'replicated' | 'global';
  placement?: string;
  portMode?: 'ingress' | 'host';
  deployLabels?: Label[];
}

// swarm services can't be privileged, interactive, use devices, gpus or a host/container network
export const convertToSwarmStack = (template: MergedTemplate, opts: SwarmOptions = {}): string | null => {
  if (!template.image || template.build || template.privileged || template.interactive || template.devices?.length || template.gpu) return null;
  if (template.network && isNetworkMode(template.network) && template.network !== 'bridge') return null;
  const service = composeService(template);
  delete service.restart;
  delete service.network_mode;
  // resource limits live under deploy in swarm mode
  delete service.cpus;
  delete service.mem_limit;
  // stack deploy doesn't read env_file, so values stay inline
  if (service.env_file) {
    delete service.env_file;
    if (template.env?.length) service.environment = envMap(template.env);
  }
  // host mode skips the routing mesh, so clients keep their real IP
  if (opts.portMode === 'host' && template.ports?.length) {
    service.ports = template.ports.flatMap((spec) => {
      const port = parsePort(spec);
      return port ? [{ target: port.container, published: port.host, protocol: port.protocol.toLowerCase(), mode: 'host' }] : [];
    });
  }
  const deploy: NonNullable<DockerComposeService['deploy']> = {};
  if (opts.mode === 'global') deploy.mode = 'global';
  else if (opts.replicas && opts.replicas > 1) deploy.replicas = Math.floor(opts.replicas);
  if (opts.placement) deploy.placement = { constraints: [opts.placement] };
  if (template.restart_policy) deploy.restart_policy = { condition: swarmRestart[template.restart_policy] };
  if (template.cpus || template.memory) deploy.resources = { limits: {
    ...(template.cpus && { cpus: template.cpus }),
    ...(template.memory && { memory: template.memory }),
  } };
  // traefik and co read swarm labels from the service level, not the container
  if (opts.deployLabels?.length) deploy.labels = labelMap(opts.deployLabels);
  if (Object.keys(deploy).length) service.deploy = deploy;
  return yaml.dump({ version: '3.8', ...composeDoc({ [serviceName(template)]: service }) });
};

type Port = { host: number; container: number; protocol: string };

const parsePort = (spec: string): Port | null => {
  const [address, protocol] = spec.split('/');
  const parts = address.split(':');
  const container = Number(parts.at(-1));
  const host = parts.length > 1 ? Number(parts.at(-2)) : container;
  if (!(host > 0) || !(container > 0)) return null;
  return { host, container, protocol: (protocol || 'tcp').toUpperCase() };
};

const uniquePorts = (specs: string[]): Port[] => {
  const seen = new Set<string>();
  return specs
    .map(parsePort)
    .filter((port): port is Port => !!port && !seen.has(`${port.host}/${port.protocol}`) && !!seen.add(`${port.host}/${port.protocol}`));
};

// docker-style sizes (512m, 2g) become kubernetes quantities (512Mi, 2Gi)
const k8sMemory = (memory: string): string => {
  const match = /^(\d+(?:\.\d+)?)\s*([kmgt])?i?b?$/i.exec(memory.trim());
  if (!match) return memory;
  const unit = match[2] ? { k: 'Ki', m: 'Mi', g: 'Gi', t: 'Ti' }[match[2].toLowerCase()] : '';
  return `${match[1]}${unit}`;
};

export interface KubernetesOptions {
  replicas?: number;
  namespace?: string;
  serviceType?: 'LoadBalancer' | 'NodePort' | 'ClusterIP';
  pvcSize?: string;
  storageClass?: string;
  ingress?: { host: string; port?: number; tls?: boolean; issuer?: string };
}

// deployment, volume claims and a service, aimed at k3s but portable to any cluster
export const convertToKubernetes = (template: MergedTemplate, opts: KubernetesOptions = {}): { file: string; content: string }[] | null => {
  if (!template.image || template.build) return null;
  const { replicas = 1, namespace = '', serviceType = 'LoadBalancer', pvcSize = '', storageClass = '' } = opts;
  const name = dnsName(template.name ?? '') || appSlug(template);
  const metaOf = (resource: string) => ({ name: resource, ...(namespace ? { namespace } : {}) });
  const volName = (index: number) => `${name}-data-${index}`;
  const devName = (index: number) => `${name}-dev-${index}`;
  const ports = uniquePorts(template.ports ?? []);
  const volumes = template.volumes ?? [];
  const devices = (template.devices ?? []).map((spec) => {
    const [host, container] = spec.split(':');
    return { host, container: container || host };
  });
  const hostNetwork = template.network === 'host';

  const [uid, gid] = (template.user ?? '').split(':');
  const security = {
    ...(template.privileged ? { privileged: true } : {}),
    ...(/^\d+$/.test(uid ?? '') ? { runAsUser: Number(uid) } : {}),
    ...(/^\d+$/.test(gid ?? '') ? { runAsGroup: Number(gid) } : {}),
  };
  const limits = {
    ...(template.cpus ? { cpu: template.cpus } : {}),
    ...(template.memory ? { memory: k8sMemory(template.memory) } : {}),
    ...(template.gpu ? { 'nvidia.com/gpu': 1 } : {}),
  };
  const envEntries = template.env ?? [];
  const useSecret = !!template.env_file && envEntries.length > 0;

  const hc = template.healthcheck ?? {};
  const check = healthCmd(hc.test);
  const probeTimes = {
    periodSeconds: toSeconds(hc.interval),
    timeoutSeconds: toSeconds(hc.timeout),
    initialDelaySeconds: toSeconds(hc.start_period),
    failureThreshold: typeof hc.retries === 'number' ? hc.retries : null,
  };
  const livenessProbe = check ? {
    exec: { command: ['sh', '-c', check] },
    ...Object.fromEntries(Object.entries(probeTimes).filter(([, val]) => val)),
  } : null;
  const mounts = [
    ...volumes.map((volume, index) => ({
      name: volName(index),
      mountPath: volume.container,
      ...(volume.readonly ? { readOnly: true } : {}),
    })),
    ...devices.map((device, index) => ({ name: devName(index), mountPath: device.container })),
  ];

  const container = {
    name,
    image: template.image,
    ...(template.entrypoint ? { command: splitArgs(template.entrypoint) } : {}),
    ...(template.command ? { args: splitArgs(template.command) } : {}),
    ...(useSecret
      ? { envFrom: [{ secretRef: { name: `${name}-env` } }] }
      : envEntries.length ? { env: envEntries.map((entry) => ({ name: entry.name, value: envValue(entry) })) } : {}),
    ...(ports.length ? { ports: ports.map((port) => ({ containerPort: port.container, protocol: port.protocol })) } : {}),
    ...(mounts.length ? { volumeMounts: mounts } : {}),
    ...(livenessProbe ? { livenessProbe } : {}),
    ...(Object.keys(limits).length ? { resources: { limits } } : {}),
    ...(Object.keys(security).length ? { securityContext: security } : {}),
    ...(template.interactive ? { stdin: true, tty: true } : {}),
  };

  const hostPath = (volume: Volume) => !!volume.bind && !isNamedVolume(volume.bind);

  const claims = volumes.flatMap((volume, index) => hostPath(volume) ? [] : [{
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: metaOf(volName(index)),
    spec: {
      accessModes: ['ReadWriteOnce'],
      ...(storageClass ? { storageClassName: storageClass } : {}),
      resources: { requests: { storage: pvcSize || '1Gi' } },
    },
  }]);

  const secrets = useSecret ? [{
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: metaOf(`${name}-env`),
    type: 'Opaque',
    stringData: envMap(envEntries),
  }] : [];

  const podVolumes = [
    ...volumes.map((volume, index) => hostPath(volume)
      ? { name: volName(index), hostPath: { path: volume.bind } }
      : { name: volName(index), persistentVolumeClaim: { claimName: volName(index) } }),
    ...devices.map((device, index) => ({ name: devName(index), hostPath: { path: device.host } })),
  ];

  const deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { ...metaOf(name), labels: { app: name } },
    spec: {
      replicas: Math.max(1, Math.floor(replicas)),
      // recreate stops the old pod first, so it can't fight the new one over a RWO claim
      ...(claims.length ? { strategy: { type: 'Recreate' } } : {}),
      selector: { matchLabels: { app: name } },
      template: {
        // docker labels have no k8s equivalent, annotations keep them visible
        metadata: { labels: { app: name }, ...(template.labels?.length ? { annotations: labelMap(template.labels) } : {}) },
        spec: {
          ...(hostNetwork ? { hostNetwork: true } : {}),
          ...(template.hostname ? { hostname: template.hostname } : {}),
          containers: [container],
          ...(podVolumes.length ? { volumes: podVolumes } : {}),
        },
      },
    },
  };

  const services = ports.length && !hostNetwork ? [{
    apiVersion: 'v1',
    kind: 'Service',
    metadata: metaOf(name),
    spec: {
      type: serviceType,
      selector: { app: name },
      ports: ports.map((port) => ({
        name: `${port.host}-${port.protocol.toLowerCase()}`,
        port: port.host,
        targetPort: port.container,
        protocol: port.protocol,
      })),
    },
  }] : [];

  // routes the domain through the cluster's ingress controller (traefik on k3s)
  const target = opts.ingress && (ports.find((port) => port.container === opts.ingress?.port) ?? ports[0]);
  const ingresses = opts.ingress && target && services.length ? [{
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      ...metaOf(name),
      // with an issuer set, cert-manager provisions the tls secret itself
      ...(opts.ingress.tls && opts.ingress.issuer ? { annotations: { 'cert-manager.io/cluster-issuer': opts.ingress.issuer } } : {}),
    },
    spec: {
      rules: [{
        host: opts.ingress.host,
        http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name, port: { number: target.host } } } }] },
      }],
      ...(opts.ingress.tls ? { tls: [{ hosts: [opts.ingress.host], secretName: `${name}-tls` }] } : {}),
    },
  }] : [];

  return [
    ...secrets.map((secret) => ({ file: `${name}-secret.yaml`, content: yaml.dump(secret) })),
    ...claims.map((claim) => ({ file: `${claim.metadata.name}.yaml`, content: yaml.dump(claim) })),
    { file: `${name}-deployment.yaml`, content: yaml.dump(deployment) },
    ...services.map((service) => ({ file: `${name}-service.yaml`, content: yaml.dump(service) })),
    ...ingresses.map((ingress) => ({ file: `${name}-ingress.yaml`, content: yaml.dump(ingress) })),
  ];
};

// systemd-style quoting, only needed when a value has spaces or quotes
const unitValue = (value: string): string =>
  /[\s"]/.test(value) ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : value;

const quadletRestart: Record<string, string> = {
  'always': 'always',
  'unless-stopped': 'always',
  'on-failure': 'on-failure',
  'no': 'no',
};

// a .container unit for podman, run and managed by systemd
export const convertToQuadlet = (template: MergedTemplate, opts: { scope?: 'user' | 'system'; autoUpdate?: boolean } = {}): string | null => {
  if (!template.image || template.build || template.interactive) return null;
  const lines = [
    '[Unit]',
    `Description=${template.title}`,
    '',
    '[Container]',
    `Image=${template.image}`,
    `ContainerName=${serviceName(template)}`,
    ...(template.ports ?? []).map((port) => `PublishPort=${port}`),
    // env file paths resolve relative to the unit file, so it sits alongside
    ...(template.env_file
      ? [`EnvironmentFile=${template.env_file}`]
      : (template.env ?? []).map((entry) => `Environment=${unitValue(`${entry.name}=${envValue(entry)}`)}`)),
    ...(template.volumes ?? []).map((volume) => `Volume=${volumeBinding(volume)}`),
    ...(template.devices ?? []).map((device) => `AddDevice=${device}`),
    // podman reaches nvidia gpus through cdi
    ...(template.gpu ? ['AddDevice=nvidia.com/gpu=all'] : []),
    ...(template.labels ?? []).map((label) => `Label=${unitValue(`${label.name}=${label.value}`)}`),
  ];
  if (template.network && template.network !== 'default') lines.push(`Network=${template.network}`);
  if (template.hostname) lines.push(`HostName=${template.hostname}`);
  if (template.user) lines.push(`User=${template.user}`);
  if (template.entrypoint) {
    // multi-word entrypoints need json form, a plain string is taken as one binary
    const entry = splitArgs(template.entrypoint);
    lines.push(`Entrypoint=${entry.length > 1 ? JSON.stringify(entry) : entry[0] ?? ''}`);
  }
  if (template.command) lines.push(`Exec=${template.command}`);
  if (opts.autoUpdate) lines.push('AutoUpdate=registry');
  const hc = template.healthcheck ?? {};
  const check = healthCmd(hc.test);
  if (check) {
    lines.push(`HealthCmd=${unitValue(check)}`);
    if (hc.interval) lines.push(`HealthInterval=${hc.interval}`);
    if (hc.timeout) lines.push(`HealthTimeout=${hc.timeout}`);
    if (hc.retries) lines.push(`HealthRetries=${hc.retries}`);
    if (hc.start_period) lines.push(`HealthStartPeriod=${hc.start_period}`);
  }
  const podmanArgs = [
    template.privileged && '--privileged',
    template.cpus && `--cpus ${template.cpus}`,
    template.memory && `--memory ${template.memory}`,
  ].filter(Boolean);
  if (podmanArgs.length) lines.push(`PodmanArgs=${podmanArgs.join(' ')}`);
  lines.push(
    '',
    '[Service]',
    `Restart=${quadletRestart[template.restart_policy ?? 'always']}`,
    '',
    '[Install]',
    `WantedBy=${opts.scope === 'system' ? 'multi-user.target' : 'default.target'}`,
  );
  return lines.join('\n');
};

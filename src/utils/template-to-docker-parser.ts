import yaml from 'js-yaml';
import type { Template, Service, Volume, Environment, Label, DockerCompose, DockerComposeService, TemplateOrService } from '$src/Types';

// a template merged with its stackfile service, so it may carry service-only fields
type MergedTemplate = Template & Partial<Service>;

export const envValue = (env: Environment): string =>
  env.value ?? env.default ?? env.select?.find((option) => option.default)?.value ?? '';

export const appSlug = (template: Template): string =>
  template.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app';

const volumeBinding = (volume: Volume): string => {
  const binding = volume.bind ? `${volume.bind}:${volume.container}` : volume.container;
  return volume.bind && volume.readonly ? `${binding}:ro` : binding;
};

// single-quote values so spaces or quotes can't break the command
const shellQuote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

const envMap = (env: Environment[]): Record<string, string> =>
  Object.fromEntries(env.map((entry) => [entry.name, envValue(entry)]));

const labelMap = (labels: Label[]): Record<string, string> =>
  Object.fromEntries(labels.map((label) => [label.name, label.value]));

// host/bridge/none are network modes, anything else is a named user network
const isNetworkMode = (network: string): boolean =>
  ['bridge', 'host', 'none'].includes(network) || network.startsWith('container:');

const dockerRun = (svc: TemplateOrService): string => {
  if (!svc.image) return '';
  const parts = [svc.name ? `docker run -d --name ${svc.name}` : 'docker run -d'];
  if (svc.interactive) parts.push('-it');
  if (svc.privileged) parts.push('--privileged');
  if (svc.network) parts.push(`--network ${svc.network}`);
  if (svc.hostname) parts.push(`--hostname ${svc.hostname}`);
  svc.ports?.forEach((port) => parts.push(`-p ${port}`));
  svc.env?.forEach((env) => parts.push(`-e ${shellQuote(`${env.name}=${envValue(env)}`)}`));
  svc.volumes?.forEach((volume) => parts.push(`-v ${volumeBinding(volume)}`));
  svc.labels?.forEach((label) => parts.push(`--label ${shellQuote(`${label.name}=${label.value}`)}`));
  // --entrypoint only takes the binary, any extra words become args after the image
  const [entryBin, ...entryArgs] = svc.entrypoint?.trim().split(/\s+/) ?? [];
  if (entryBin) parts.push(`--entrypoint ${entryBin}`);
  if (svc.restart_policy) parts.push(`--restart=${svc.restart_policy}`);
  parts.push(svc.image);
  const trailing = [...entryArgs, svc.command ?? ''].join(' ').trim();
  if (trailing) parts.push(trailing);
  return parts.join(' \\\n  ');
};

const composeService = (svc: TemplateOrService): DockerComposeService => {
  const service: DockerComposeService = {};
  if (svc.image) service.image = svc.image;
  if (svc.build) service.build = svc.build;
  if (svc.command) service.command = svc.command;
  if (svc.entrypoint) service.entrypoint = svc.entrypoint;
  if (svc.ports?.length) service.ports = svc.ports;
  if (svc.volumes?.length) service.volumes = svc.volumes.map(volumeBinding);
  if (svc.env?.length) service.environment = envMap(svc.env);
  if (svc.labels?.length) service.labels = labelMap(svc.labels);
  if (svc.network && svc.network !== 'default') {
    if (isNetworkMode(svc.network)) service.network_mode = svc.network;
    else service.networks = [svc.network];
  }
  if (svc.hostname) service.hostname = svc.hostname;
  if (svc.privileged) service.privileged = true;
  if (svc.interactive) {
    service.stdin_open = true;
    service.tty = true;
  }
  if (svc.restart_policy) service.restart = svc.restart_policy;
  return service;
};

// named networks are declared as external, since they already exist on the host
const composeDoc = (services: DockerCompose['services']): DockerCompose => {
  const named = [...new Set(Object.values(services).flatMap((svc) => svc.networks ?? []))];
  const doc: DockerCompose = { services };
  if (named.length) doc.networks = Object.fromEntries(named.map((name) => [name, { external: true }]));
  return doc;
};

export const generateDockerRunCommand = (template: Template) => dockerRun(template);

export const generateDockerRunCommands = (stack: Service[]) =>
  stack.filter((service) => service.image).map(dockerRun);

export const convertToDockerCompose = (template: Template) =>
  yaml.dump(composeDoc({ [appSlug(template)]: composeService(template) }));

export const convertPortainerStackToDockerCompose = (stack: Service[]) =>
  yaml.dump(composeDoc(Object.fromEntries(stack.map((service) => [service.name, composeService(service)]))));

const swarmRestart: Record<string, string> = {
  'always': 'any',
  'unless-stopped': 'any',
  'on-failure': 'on-failure',
  'no': 'none',
};

// swarm services can't be privileged, interactive or on a host/container network
export const convertToSwarmStack = (template: MergedTemplate): string | null => {
  if (!template.image || template.build || template.privileged || template.interactive) return null;
  if (template.network && isNetworkMode(template.network) && template.network !== 'bridge') return null;
  const service = composeService(template);
  delete service.restart;
  delete service.network_mode;
  if (template.restart_policy) service.deploy = { restart_policy: { condition: swarmRestart[template.restart_policy] } };
  return yaml.dump({ version: '3.8', ...composeDoc({ [appSlug(template)]: service }) });
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

// deployment, volume claims and a service, aimed at k3s but portable to any cluster
export const convertToKubernetes = (template: MergedTemplate): { file: string; content: string }[] | null => {
  if (!template.image || template.build) return null;
  const name = appSlug(template);
  const volName = (index: number) => `${name}-data-${index}`;
  const ports = uniquePorts(template.ports ?? []);
  const volumes = template.volumes ?? [];
  const hostNetwork = template.network === 'host';

  const container = {
    name,
    image: template.image,
    ...(template.entrypoint ? { command: template.entrypoint.trim().split(/\s+/) } : {}),
    ...(template.command ? { args: template.command.trim().split(/\s+/) } : {}),
    ...(template.env?.length ? { env: template.env.map((entry) => ({ name: entry.name, value: envValue(entry) })) } : {}),
    ...(ports.length ? { ports: ports.map((port) => ({ containerPort: port.container, protocol: port.protocol })) } : {}),
    ...(volumes.length ? { volumeMounts: volumes.map((volume, index) => ({
      name: volName(index),
      mountPath: volume.container,
      ...(volume.readonly ? { readOnly: true } : {}),
    })) } : {}),
    ...(template.privileged ? { securityContext: { privileged: true } } : {}),
    ...(template.interactive ? { stdin: true, tty: true } : {}),
  };

  const claims = volumes.flatMap((volume, index) => volume.bind ? [] : [{
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: volName(index) },
    spec: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '1Gi' } } },
  }]);

  const deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name, labels: { app: name } },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: name } },
      template: {
        metadata: { labels: { app: name } },
        spec: {
          ...(hostNetwork ? { hostNetwork: true } : {}),
          ...(template.hostname ? { hostname: template.hostname } : {}),
          containers: [container],
          ...(volumes.length ? { volumes: volumes.map((volume, index) => volume.bind
            ? { name: volName(index), hostPath: { path: volume.bind } }
            : { name: volName(index), persistentVolumeClaim: { claimName: volName(index) } }) } : {}),
        },
      },
    },
  };

  const services = ports.length && !hostNetwork ? [{
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name },
    spec: {
      type: 'LoadBalancer',
      selector: { app: name },
      ports: ports.map((port) => ({
        name: `${port.host}-${port.protocol.toLowerCase()}`,
        port: port.host,
        targetPort: port.container,
        protocol: port.protocol,
      })),
    },
  }] : [];

  return [
    ...claims.map((claim) => ({ file: `${claim.metadata.name}.yaml`, content: yaml.dump(claim) })),
    { file: `${name}-deployment.yaml`, content: yaml.dump(deployment) },
    ...services.map((service) => ({ file: `${name}-service.yaml`, content: yaml.dump(service) })),
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

// a .container unit for rootless podman, run and managed by systemd
export const convertToQuadlet = (template: MergedTemplate): string | null => {
  if (!template.image || template.build || template.interactive) return null;
  const lines = [
    '[Unit]',
    `Description=${template.title}`,
    '',
    '[Container]',
    `Image=${template.image}`,
    `ContainerName=${appSlug(template)}`,
    ...(template.ports ?? []).map((port) => `PublishPort=${port}`),
    ...(template.env ?? []).map((entry) => `Environment=${unitValue(`${entry.name}=${envValue(entry)}`)}`),
    ...(template.volumes ?? []).map((volume) => `Volume=${volumeBinding(volume)}`),
    ...(template.labels ?? []).map((label) => `Label=${unitValue(`${label.name}=${label.value}`)}`),
  ];
  if (template.network && template.network !== 'default') lines.push(`Network=${template.network}`);
  if (template.hostname) lines.push(`HostName=${template.hostname}`);
  if (template.entrypoint) lines.push(`Entrypoint=${template.entrypoint}`);
  if (template.command) lines.push(`Exec=${template.command}`);
  if (template.privileged) lines.push('PodmanArgs=--privileged');
  lines.push(
    '',
    '[Service]',
    `Restart=${quadletRestart[template.restart_policy ?? 'always']}`,
    '',
    '[Install]',
    'WantedBy=default.target',
  );
  return lines.join('\n');
};

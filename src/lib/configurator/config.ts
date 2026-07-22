import { convertToKubernetes, convertToQuadlet, convertToSwarmStack, envValue } from '$src/utils/template-to-docker-parser';
import type { DependsOn, DockerMeta, Label, RestartPolicy, SelectOption, Service, Template, TemplateOrService } from '$src/Types';

export interface AppOption {
  slug: string;
  title: string;
  logo?: string;
}

export interface GithubLink {
  repo: string;
  url: string;
  stars: number;
}

export interface ConfigureResponse {
  template: Template;
  services: Service[];
  meta: DockerMeta | null;
  stats: { pulls: number; updated: string } | null;
  github: GithubLink | null;
}

// the subset MethodConfigurator needs, so pages can feed it their own data
export type ConfigData = Pick<ConfigureResponse, 'template' | 'services' | 'meta'>;

export type MethodId = 'docker-run' | 'docker-compose' | 'docker-swarm' | 'kubernetes' | 'podman-quadlet';

export const METHODS: { id: MethodId; label: string; icon: string }[] = [
  { id: 'docker-run', label: 'Docker Run', icon: 'docker.png' },
  { id: 'docker-compose', label: 'Docker Compose', icon: 'docker-compose.png' },
  { id: 'docker-swarm', label: 'Docker Swarm', icon: 'docker-swarm.png' },
  { id: 'kubernetes', label: 'Kubernetes', icon: 'kubernetes.png' },
  { id: 'podman-quadlet', label: 'Podman Quadlet', icon: 'podman.png' },
];

export type MethodFields = { restart: boolean; devices: boolean; privileged: boolean; gpu: boolean; interactive: boolean };
export const ALL_FIELDS: MethodFields = { restart: true, devices: true, privileged: true, gpu: true, interactive: true };

/* advanced fields a method's output can actually use; the rest are hidden to avoid dead-end configs */
export const methodFields = (method: MethodId): MethodFields => ({
  restart: method !== 'kubernetes',
  devices: method !== 'docker-swarm',
  privileged: method !== 'docker-swarm',
  gpu: method !== 'docker-swarm',
  interactive: method !== 'docker-swarm' && method !== 'podman-quadlet',
});

/* strip values the chosen method ignores, so a hidden field never blocks generation */
export const maskConfig = (cfg: ServiceConfig, fields: MethodFields): ServiceConfig => ({
  ...cfg,
  ...(fields.devices ? {} : { devices: [] }),
  ...(fields.privileged ? {} : { privileged: false }),
  ...(fields.gpu ? {} : { gpu: false }),
  ...(fields.interactive ? {} : { interactive: false }),
});

export const availableMethods = ({ template, services }: Pick<ConfigureResponse, 'template' | 'services'>): MethodId[] => {
  if (services.length > 1) {
    return services.some((s) => s.image) ? ['docker-run', 'docker-compose'] : ['docker-compose'];
  }
  if (!template.image) return [];
  const ids: MethodId[] = ['docker-run', 'docker-compose'];
  if (convertToSwarmStack(template)) ids.push('docker-swarm');
  if (convertToKubernetes(template)) ids.push('kubernetes');
  if (convertToQuadlet(template)) ids.push('podman-quadlet');
  return ids;
};

/* short, plain-English tooltips shown by HelpTip next to each field; keyed by field */
export const HINTS = {
  name: "The name your container shows up as in Docker and Portainer. Makes it easier to spot in logs and lists.",
  restart: "Whether Docker starts the container again after a crash or reboot. 'Unless stopped' is a safe pick for most apps.",
  ports: "Maps a port on your machine to one inside the container, so you can reach the app. Host port on the left, container port on the right.",
  env: "Settings handed to the app on startup, like timezone, user IDs or API keys. Check the app's docs for the ones it accepts.",
  volumes: "Keeps data on your machine so it survives the container being recreated. Host path or named volume on the left, container path on the right.",
  image: "The Docker image to run, with an optional tag for the version, like 'nginx:latest'.",
  network: "The Docker network the container joins. Leave blank for the default, or use 'host' to share your machine's network directly.",
  hostname: "The name the container uses for itself on the network. Usually fine to leave blank.",
  entrypoint: "Replaces the first command the image runs. Only set this if the app's docs ask you to.",
  command: "Replaces the default arguments the container starts with. Leave blank to keep the image's own.",
  user: "Runs the app as a set user and group ID instead of root, so file permissions line up with your host.",
  cpus: "The most CPU cores the container may use, like 1.5. Leave blank for no limit.",
  memory: "The most memory the container may use, like 512m or 2g. Leave blank for no limit.",
  devices: "Shares a piece of hardware from your machine, such as a GPU or serial device, with the container.",
  labels: "Extra key/value tags on the container, often read by tools like Traefik or Watchtower.",
} as const;

export interface PortRow { host: string; container: string; protocol: 'tcp' | 'udp' }
export interface EnvRow { name: string; value: string; fixed?: boolean; label?: string; description?: string; select?: SelectOption[]; preset?: boolean }
export interface VolumeRow { bind: string; container: string; readonly: boolean }
export interface LabelRow { name: string; value: string }
export interface DeviceRow { host: string; container: string }

export interface TraefikConfig {
  enabled: boolean;
  domain: string;
  port: string;
  entrypoint: string;
  tls: boolean;
  certResolver: string;
  scheme: '' | 'http' | 'https';
}

export interface ServiceConfig {
  name: string;
  image: string;
  ports: PortRow[];
  env: EnvRow[];
  volumes: VolumeRow[];
  labels: LabelRow[];
  devices: DeviceRow[];
  restart: RestartPolicy;
  network: string;
  hostname: string;
  entrypoint: string;
  command: string;
  user: string;
  cpus: string;
  memory: string;
  privileged: boolean;
  interactive: boolean;
  gpu: boolean;
  envFile: boolean;
  traefik: TraefikConfig;
  // stackfile pass-through, not editable in the form
  dependsOn?: DependsOn;
  healthcheck?: Record<string, unknown>;
}

// hyphens and slashes escaped in classes, so the browser's v-flag pattern check accepts them
export const patterns = {
  name: '[a-zA-Z0-9][a-zA-Z0-9_.\\-]*',
  hostPort: '((\\d{1,3}\\.){3}\\d{1,3}:)?\\d{1,5}(-\\d{1,5})?',
  containerPort: '\\d{1,5}(-\\d{1,5})?',
  envName: '[^\\s=]+',
  containerPath: '/[^:]*',
  volumeSource: '[a-zA-Z0-9][a-zA-Z0-9_.\\-]*|[\\/~.][^:]*',
  network: '(container:)?[a-zA-Z0-9][a-zA-Z0-9_.\\-]*',
  hostname: '[a-zA-Z0-9._\\-]+',
  image: '\\S+',
  user: '[^\\s:]+(:[^\\s:]+)?',
  cpus: '\\d+(\\.\\d+)?',
  memory: '\\d+(\\.\\d+)?[kKmMgGtT]?[iI]?[bB]?',
  devicePath: '/[^\\s:]*',
  namespace: '[a-z0-9]([a-z0-9\\-]*[a-z0-9])?',
  k8sName: '[a-z0-9]([a-z0-9.\\-]*[a-z0-9])?',
  quantity: '\\d+(\\.\\d+)?[MGTmgt]i?',
  domain: '([a-zA-Z0-9\\-]+\\.)+[a-zA-Z]{2,}',
  ident: '[a-zA-Z0-9_\\-]+',
};

const full = (pattern: string) => new RegExp(`^(${pattern})$`);
const inRange = (port: string) => port.split('-').every((n) => +n >= 1 && +n <= 65535);

const POLICIES: RestartPolicy[] = ['always', 'unless-stopped', 'on-failure', 'no'];

// some templates tack :ro onto the path instead of setting readonly, so lift it into the flag
const stripRo = (path: string): [string, boolean] =>
  path.endsWith(':ro') ? [path.slice(0, -3), true] : [path, false];

const dockerName = (name: string): string =>
  name.trim().replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^[^a-zA-Z0-9]+/, '').replace(/[-_.]+$/, '');

const parsePort = (spec: string): PortRow => {
  const [address, protocol] = spec.split('/');
  const parts = address.split(':');
  const container = parts.pop() ?? '';
  return { host: parts.join(':'), container, protocol: protocol === 'udp' ? 'udp' : 'tcp' };
};

const blankPort = (p: PortRow) => !p.host && !p.container;
const blankEnv = (e: EnvRow) => !e.name && !e.value;
const blankVolume = (v: VolumeRow) => !v.bind && !v.container;
const blankLabel = (l: LabelRow) => !l.name && !l.value;
const blankDevice = (d: DeviceRow) => !d.host && !d.container;

export const emptyPort = (): PortRow => ({ host: '', container: '', protocol: 'tcp' });
export const emptyEnv = (): EnvRow => ({ name: '', value: '' });
export const emptyVolume = (): VolumeRow => ({ bind: '', container: '', readonly: false });
export const emptyLabel = (): LabelRow => ({ name: '', value: '' });
export const emptyDevice = (): DeviceRow => ({ host: '', container: '' });

// looks sensitive? the form masks it until focused
export const secretEnv = (name: string): boolean => /pass|secret|token|key|pwd|credential/i.test(name);

const WEB_PORTS = ['443', '80', '8080', '3000', '8000', '8443', '8096', '9000'];
const bestWebPort = (ports: PortRow[]): string =>
  ports.map((p) => p.container).find((c) => WEB_PORTS.includes(c)) ?? ports[0]?.container ?? '';

export const fromTemplate = (src: TemplateOrService): ServiceConfig => ({
  name: dockerName(src.name ?? ''),
  image: src.image ?? '',
  ports: (src.ports ?? []).map(parsePort),
  traefik: {
    enabled: false,
    domain: '',
    port: bestWebPort((src.ports ?? []).map(parsePort)),
    entrypoint: '',
    tls: true,
    certResolver: '',
    scheme: '',
  },
  env: (src.env ?? []).map((env) => ({
    name: env.name,
    value: envValue(env),
    fixed: true,
    label: env.label,
    description: env.description,
    select: env.select,
    preset: env.preset,
  })),
  volumes: (src.volumes ?? []).map((vol) => {
    const [container, roC] = stripRo(vol.container.trim());
    const [bind, roB] = stripRo((vol.bind ?? '').trim());
    return { bind, container, readonly: !!vol.readonly || roC || roB };
  }),
  labels: (src.labels ?? []).map((label) => ({ name: label.name, value: label.value })),
  devices: (src.devices ?? []).map((spec) => {
    const [host, container] = spec.split(':');
    return { host, container: container ?? '' };
  }),
  restart: POLICIES.includes(src.restart_policy as RestartPolicy) ? src.restart_policy! : 'unless-stopped',
  network: src.network ?? '',
  hostname: src.hostname ?? '',
  entrypoint: src.entrypoint ?? '',
  command: src.command ?? '',
  user: src.user ?? '',
  cpus: src.cpus ?? '',
  memory: src.memory ?? '',
  privileged: !!src.privileged,
  interactive: !!src.interactive,
  gpu: !!src.gpu,
  envFile: false,
  dependsOn: src.depends_on,
  healthcheck: src.healthcheck,
});

export const imageBase = (image: string) => image.split('@')[0].replace(/:[^/]+$/, '');

const portSpec = (p: PortRow) => {
  const address = p.host ? `${p.host}:${p.container}` : p.container;
  return p.protocol === 'udp' ? `${address}/udp` : address;
};

export const toService = (cfg: ServiceConfig, version: string | null): TemplateOrService => {
  const ports = cfg.ports.filter((p) => !blankPort(p)).map(portSpec);
  // empty values are left out, unset beats an accidental FOO=""
  const env = cfg.env.filter((e) => e.name && e.value).map((e) => ({ name: e.name, value: e.value }));
  const volumes = cfg.volumes.filter((v) => !blankVolume(v)).map((v) => ({
    container: v.container,
    ...(v.bind && { bind: v.bind }),
    ...(v.readonly && { readonly: true }),
  }));
  const labels = cfg.labels.filter((l) => !blankLabel(l)).map((l) => ({ name: l.name, value: l.value }));
  const devices = cfg.devices.filter((d) => !blankDevice(d)).map((d) =>
    d.container && d.container !== d.host ? `${d.host}:${d.container}` : d.host);
  return {
    ...(cfg.name && { name: cfg.name }),
    ...(cfg.image && { image: version ? `${imageBase(cfg.image)}:${version}` : cfg.image }),
    ...(ports.length && { ports }),
    ...(env.length && { env }),
    ...(volumes.length && { volumes }),
    ...(labels.length && { labels }),
    ...(devices.length && { devices }),
    restart_policy: cfg.restart,
    ...(cfg.network && { network: cfg.network }),
    ...(cfg.hostname && { hostname: cfg.hostname }),
    ...(cfg.entrypoint && { entrypoint: cfg.entrypoint }),
    ...(cfg.command && { command: cfg.command }),
    ...(cfg.user && { user: cfg.user }),
    ...(cfg.cpus && { cpus: cfg.cpus }),
    ...(cfg.memory && { memory: cfg.memory }),
    ...(cfg.privileged && { privileged: true }),
    ...(cfg.interactive && { interactive: true }),
    ...(cfg.gpu && { gpu: true }),
    ...(cfg.dependsOn && { depends_on: cfg.dependsOn }),
    ...(cfg.healthcheck && { healthcheck: cfg.healthcheck }),
  };
};

const routerName = (cfg: ServiceConfig, fallback: string): string =>
  (cfg.name || fallback).toLowerCase().replace(/[^a-z0-9-]/g, '-');

export const traefikHost = (cfg: ServiceConfig, fallback: string): string =>
  cfg.traefik.domain.trim() || `${routerName(cfg, fallback)}.example.com`;

// mirrors the reverse proxy configurator's traefik output, as container labels
export const traefikLabels = (cfg: ServiceConfig, fallback: string): Label[] => {
  const t = cfg.traefik;
  const router = routerName(cfg, fallback);
  const port = t.port.trim();
  const scheme = t.scheme || (['443', '8443'].includes(port) ? 'https' : 'http');
  const labels: Label[] = [
    { name: 'traefik.enable', value: 'true' },
    { name: `traefik.http.routers.${router}.rule`, value: `Host(\`${traefikHost(cfg, fallback)}\`)` },
    { name: `traefik.http.routers.${router}.entrypoints`, value: t.entrypoint.trim() || (t.tls ? 'websecure' : 'web') },
  ];
  if (t.tls) labels.push({ name: `traefik.http.routers.${router}.tls.certresolver`, value: t.certResolver.trim() || 'letsencrypt' });
  if (port) labels.push({ name: `traefik.http.services.${router}.loadbalancer.server.port`, value: port });
  if (scheme === 'https') labels.push(
    { name: `traefik.http.services.${router}.loadbalancer.server.scheme`, value: 'https' },
    { name: `traefik.http.serversTransports.${router}-insecure.insecureSkipVerify`, value: 'true' },
    { name: `traefik.http.services.${router}.loadbalancer.serversTransport`, value: `${router}-insecure@docker` },
  );
  return labels;
};

export const validate = (cfg: ServiceConfig, prefix = '', nameRequired = false): string[] => {
  const errors: string[] = [];
  const bad = (msg: string) => errors.push(prefix + msg);

  if (nameRequired && !cfg.name) bad('needs a container name');
  if (cfg.name && !full(patterns.name).test(cfg.name)) bad('container name can only use letters, numbers, dots, dashes and underscores');

  cfg.ports.filter((p) => !blankPort(p)).forEach((p) => {
    if (!p.container) bad('each port mapping needs a container port');
    else if (!full(patterns.containerPort).test(p.container) || !inRange(p.container)) bad(`container port "${p.container}" should be between 1 and 65535`);
    if (p.host && (!full(patterns.hostPort).test(p.host) || !inRange(p.host.split(':').pop() ?? ''))) bad(`host port "${p.host}" should be a port number, optionally prefixed with an IP`);
  });

  cfg.env.filter((e) => !blankEnv(e)).forEach((e) => {
    if (!e.name) bad('environment variables need a name');
    else if (!full(patterns.envName).test(e.name)) bad(`variable name "${e.name}" can't contain spaces or "="`);
  });

  cfg.volumes.filter((v) => !blankVolume(v)).forEach((v) => {
    if (!full(patterns.containerPath).test(v.container)) bad(`container path "${v.container}" should be an absolute path`);
    if (v.bind && !full(patterns.volumeSource).test(v.bind)) bad(`volume source "${v.bind}" should be a path or a named volume`);
  });

  cfg.labels.filter((l) => !blankLabel(l)).forEach((l) => {
    if (!l.name) bad('labels need a name');
    else if (!full(patterns.envName).test(l.name)) bad(`label name "${l.name}" can't contain spaces or "="`);
  });

  cfg.devices.filter((d) => !blankDevice(d)).forEach((d) => {
    if (!d.host) bad('devices need a host path');
    else if (!full(patterns.devicePath).test(d.host)) bad(`device "${d.host}" should be an absolute path like /dev/dri`);
    if (d.container && !full(patterns.devicePath).test(d.container)) bad(`device path "${d.container}" should be an absolute path`);
  });

  if (cfg.image && !full(patterns.image).test(cfg.image)) bad(`image "${cfg.image}" can't contain spaces`);
  if (cfg.network && !full(patterns.network).test(cfg.network)) bad(`network "${cfg.network}" doesn't look like a network name`);
  if (cfg.hostname && !full(patterns.hostname).test(cfg.hostname)) bad(`hostname "${cfg.hostname}" has invalid characters`);
  if (cfg.user && !full(patterns.user).test(cfg.user)) bad(`user "${cfg.user}" should be a user or uid, optionally with :group`);
  if (cfg.cpus && !full(patterns.cpus).test(cfg.cpus)) bad(`cpu limit "${cfg.cpus}" should be a number like 1.5`);
  if (cfg.memory && !full(patterns.memory).test(cfg.memory)) bad(`memory limit "${cfg.memory}" should look like 512m or 2g`);

  if (cfg.traefik.enabled) {
    const t = cfg.traefik;
    if (t.domain && !full(patterns.domain).test(t.domain.trim())) bad(`traefik domain "${t.domain}" doesn't look like a hostname`);
    if (!t.port.trim()) bad('traefik needs the app port to route traffic to');
    else if (!full(patterns.containerPort).test(t.port.trim()) || !inRange(t.port.trim())) bad(`traefik port "${t.port}" should be between 1 and 65535`);
    if (t.entrypoint && !full(patterns.ident).test(t.entrypoint.trim())) bad(`traefik entrypoint "${t.entrypoint}" has invalid characters`);
    if (t.certResolver && !full(patterns.ident).test(t.certResolver.trim())) bad(`traefik cert resolver "${t.certResolver}" has invalid characters`);
  }

  return errors;
};

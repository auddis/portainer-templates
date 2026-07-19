import yaml from 'js-yaml';
import type { Template, Service, Volume, Environment, Label, DockerCompose, DockerComposeService, TemplateOrService } from '$src/Types';

const envValue = (env: Environment): string =>
  env.value ?? env.default ?? env.select?.find((option) => option.default)?.value ?? '';

const volumeBinding = (volume: Volume): string => {
  const binding = volume.bind ? `${volume.bind}:${volume.container}` : volume.container;
  return volume.bind && volume.readonly ? `${binding}:ro` : binding;
};

const envMap = (env: Environment[]): Record<string, string> =>
  Object.fromEntries(env.map((entry) => [entry.name, envValue(entry)]));

const labelMap = (labels: Label[]): Record<string, string> =>
  Object.fromEntries(labels.map((label) => [label.name, label.value]));

const dockerRun = (svc: TemplateOrService): string => {
  if (!svc.image) return '';
  const parts = [svc.name ? `docker run -d --name ${svc.name}` : 'docker run -d'];
  if (svc.interactive) parts.push('-it');
  if (svc.privileged) parts.push('--privileged');
  if (svc.network) parts.push(`--network ${svc.network}`);
  if (svc.hostname) parts.push(`--hostname ${svc.hostname}`);
  svc.ports?.forEach((port) => parts.push(`-p ${port}`));
  svc.env?.forEach((env) => parts.push(`-e "${env.name}=${envValue(env)}"`));
  svc.volumes?.forEach((volume) => parts.push(`-v ${volumeBinding(volume)}`));
  svc.labels?.forEach((label) => parts.push(`--label "${label.name}=${label.value}"`));
  if (svc.entrypoint) parts.push(`--entrypoint ${svc.entrypoint}`);
  if (svc.restart_policy) parts.push(`--restart=${svc.restart_policy}`);
  parts.push(svc.image);
  if (svc.command) parts.push(svc.command);
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
  if (svc.network) service.network_mode = svc.network;
  if (svc.hostname) service.hostname = svc.hostname;
  if (svc.privileged) service.privileged = true;
  if (svc.interactive) {
    service.stdin_open = true;
    service.tty = true;
  }
  if (svc.restart_policy) service.restart = svc.restart_policy;
  return service;
};

export const generateDockerRunCommand = (template: Template) => dockerRun(template);

export const generateDockerRunCommands = (stack: Service[]) =>
  stack.filter((service) => service.image).map(dockerRun);

export const convertToDockerCompose = (template: Template) => {
  const name = template.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
  const compose: DockerCompose = { version: '3.8', services: { [name]: composeService(template) } };
  return yaml.dump(compose);
};

export const convertPortainerStackToDockerCompose = (stack: Service[]) => {
  const services: DockerCompose['services'] = Object.fromEntries(stack.map((service) => [service.name, composeService(service)]));
  return yaml.dump({ version: '3.8', services });
};

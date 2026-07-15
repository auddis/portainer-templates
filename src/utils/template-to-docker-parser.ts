
import yaml from 'js-yaml';
import type { Template, Volume, Service, Environment, DockerCompose, DockerComposeService } from '$src/Types';

/* Resolve the value for an env var: explicit value, then default, then a flagged select option */
const envValue = (env: Environment): string =>
  env.value ?? env.default ?? env.select?.find((option) => option.default)?.value ?? '';

/* Format a volume as a Docker-style binding, handling named/anonymous volumes with no host bind */
const volumeBinding = (volume: Volume): string =>
  volume.bind ? `${volume.bind}:${volume.container}` : volume.container;

export const generateDockerRunCommand = (template: Template) => {
  let command = `docker run -d \\ \n`;
  if (template.ports) {
    template.ports.forEach((port) => {
      command += `  -p ${port} \\\n`;
    });
  }
  if (template.env) {
    template.env.forEach((env) => {
      command += `  -e ${env.name}=\${${env.name}} \\\n`;
    });
  }
  if (template.volumes) {
    template.volumes.forEach((volume: Volume) => {
      const readOnly = volume.readonly ? ":ro" : "";
      command += `  -v ${volumeBinding(volume)}${readOnly} \\\n`;
    });
  }
  if (template.restart_policy) {
    command += `  --restart=${template.restart_policy} \\\n`;
  }
  command += `  ${template.image}`;
  return command;
};

export const generateDockerRunCommands = (stack: Service[]) => {
  const commands = stack.filter((s) => s.image).map((service) => {
    let cmd = `docker run --name ${service.name} -d \\\n`;
    if (service.command) {
      cmd += ` ${service.command} \\\n`;
    }
    if (service.env) {
      service.env.forEach((envVar) => {
        cmd += ` -e "${envVar.name}=${envValue(envVar)}" \\\n`;
      });
    }
    if (service.ports) {
      service.ports.forEach((port) => {
        cmd += ` -p ${port} \\\n`;
      });
    }
    if (service.volumes) {
      service.volumes.forEach((volume) => {
        cmd += ` -v ${volumeBinding(volume)} \\\n`;
      });
    }
    if (service.restart_policy) {
      cmd += ` --restart=${service.restart_policy} \\\n`;
    }
    cmd += ` ${service.image}`;
    return cmd;
  });
  return commands;
}

export const convertToDockerCompose = (template: Template) => {
  const serviceName = template.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const service: DockerComposeService = { image: template.image };
  if (template.ports && template.ports.length > 0) {
    service.ports = template.ports;
  }
  if (template.env && template.env.length > 0) {
    service.environment = template.env.reduce((envVars, envVar) => {
      envVars[envVar.name] = envValue(envVar);
      return envVars;
    }, {} as { [key: string]: string });
  }
  if (template.volumes && template.volumes.length > 0) {
    service.volumes = template.volumes.map(volumeBinding);
  }
  if (template.command) {
    service.command = template.command;
  }
  if (template.restart_policy) {
    service.restart = template.restart_policy;
  }
  if (template.labels && template.labels.length > 0) {
    service.labels = template.labels.reduce((labels, label) => {
      labels[label.name] = label.value;
      return labels;
    }, {} as { [key: string]: string });
  }
  const dockerCompose: DockerCompose = { version: "3.8", services: { [serviceName]: service } };
  return yaml.dump(dockerCompose);
};

export const convertPortainerStackToDockerCompose = (stack: Service[]) => {
  const services = stack.reduce((acc, service) => {
    const composeService: DockerComposeService = {};
    if (service.image) composeService.image = service.image;
    if (service.build) composeService.build = service.build;
    if (service.command) composeService.command = service.command;
    if (service.ports && service.ports.length > 0) composeService.ports = service.ports;
    if (service.volumes && service.volumes.length > 0) composeService.volumes = service.volumes.map(volumeBinding);
    if (service.env && service.env.length > 0) {
      composeService.environment = service.env.reduce((envVars, envVar) => {
        envVars[envVar.name] = envValue(envVar);
        return envVars;
      }, {} as { [key: string]: string });
    }
    if (service.restart_policy) composeService.restart = service.restart_policy;
    acc[service.name] = composeService;
    return acc;
  }, {} as DockerCompose['services']);
  return yaml.dump({ version: "3.8", services });
};

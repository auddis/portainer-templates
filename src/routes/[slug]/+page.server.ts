import yaml from 'js-yaml';

import { get } from 'svelte/store';
import { templatesUrl } from '$src/constants';
import { templates } from '$src/store';
import type { Template, Service, Environment, Volume, DockerHubResponse } from '$src/Types';
import type { PageServerLoad } from './$types';

/* Turn a template title into its URL slug */
const slugify = (title: string) =>
  title.toLowerCase().replace(/[^a-zA-Z ]/g, "").replaceAll(' ', '-');

/* Based on the current page name, find the corresponding template */
const findTemplate = (allTemplates: Template[], slug: string) => {
  return allTemplates.find((temp) => slugify(temp.title) === slug);
};

/* With a given image name, fetch stats from DockerHub registry */
const getDockerHubStats = async (image?: string): Promise<DockerHubResponse | null> => {
  if (!image) return null;
  const [imageName] = image.split(':');
  const [namespace, repo] = imageName.includes('/') ? imageName.split('/') : ['library', imageName];
  const apiEndpoint = `https://hub.docker.com/v2/repositories/${namespace}/${repo}/`;

  return await fetch(apiEndpoint)
    .then((res) => res.json())
    .then((data) => data as DockerHubResponse)
    .catch(() => null);
}

/* Compose environment can be a map ({ KEY: value }) or a list ([ "KEY=value" ]) */
const parseEnv = (environment?: Record<string, unknown> | string[]): Environment[] => {
  if (!environment) return [];
  if (Array.isArray(environment)) {
    return environment.map((entry) => {
      const [name, ...rest] = String(entry).split('=');
      return { name, value: rest.join('=') };
    });
  }
  return Object.entries(environment).map(([name, value]) => ({
    name,
    value: value == null ? '' : String(value),
  }));
};

/* Compose volumes are strings ("source:target"); skip long-syntax objects we can't render inline */
const parseVolumes = (volumes?: unknown[]): Volume[] =>
  (volumes || [])
    .filter((vol): vol is string => typeof vol === 'string')
    .map((vol) => {
      const [source, target] = vol.split(':');
      return target ? { bind: source, container: target } : { container: source };
    });

type ComposeServiceRaw = {
  image?: string;
  entrypoint?: string;
  command?: string;
  ports?: string[];
  build?: string;
  interactive?: boolean;
  volumes?: unknown[];
  restart?: Service['restart_policy'];
  environment?: Record<string, unknown> | string[];
};

const getServices = async (template: Template): Promise<Service[]> => {
  try {
    if (template?.repository) {
      const { url: repoUrl, stackfile } = template.repository;
      const path = `${repoUrl.replace('github.com', 'raw.githubusercontent.com')}/HEAD/${stackfile}`;
      const response = await fetch(path);
      const data = await response.text();
      const parsedData = yaml.load(data) as { services?: Record<string, ComposeServiceRaw> } | null;
      if (!parsedData?.services) return [];

      return Object.entries(parsedData.services).map(([name, serviceData]) => ({
        name,
        image: serviceData.image,
        entrypoint: serviceData.entrypoint,
        command: serviceData.command,
        ports: serviceData.ports,
        build: serviceData.build,
        interactive: serviceData.interactive,
        volumes: parseVolumes(serviceData.volumes),
        restart_policy: serviceData.restart,
        env: parseEnv(serviceData.environment),
      }));
    } else {
      return [];
    }
  } catch (error) {
    console.error('Error fetching or parsing YAML:', error);
    return [];
  }
};

/* Format results for returning to component */
const returnResults = async (allTemplates: Template[], templateSlug: string) => {
  // Find template, based on slug
  let template = findTemplate(allTemplates, templateSlug);
  if (!template) return { template: null, dockerStats: null, services: [] as Service[] };

  // Fetch service info from associated stackfile, if it exists
  let services = template.repository ? await getServices(template) : [];

  // If only 1 service, merge it with the template
  if (services.length === 1) {
    template = { ...template, ...services[0] };
  } else if (services.length > 1) {
    // If made up from multiple services, fetch Docker info for each image
    services = await Promise.all(
      services.map(async (service) => ({
        ...service,
        dockerStats: await getDockerHubStats(service.image),
      }))
    );
  }
  // If image specified, fetch Docker image info from DockerHub
  const dockerStats = template.image ? await getDockerHubStats(template.image) : null;
  return { template, dockerStats, services };
};

export const load: PageServerLoad = async ({ params }) => {
  const templateSlug = params.slug;
  const cached = get(templates);
  if (cached && cached.length > 0) {
    return returnResults(cached, templateSlug);
  }
  const data = await fetch(templatesUrl).then((res) => res.json());
  templates.set(data.templates);
  return returnResults(data.templates, templateSlug);
};

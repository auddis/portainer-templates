import yaml from 'js-yaml';

import { error } from '@sveltejs/kit';
import { get } from 'svelte/store';
import { templatesUrl } from '$src/constants';
import { templates } from '$src/store';
import { getDockerHubStats, getDockerMeta } from '$lib/server/dockerhub';
import { getProjectStats } from '$lib/server/github';
import type { Template, Service, Environment, Volume, SimilarApp } from '$src/Types';
import type { PageServerLoad } from './$types';

type Fetch = typeof globalThis.fetch;

/* Turn a template title into its URL slug */
const slugify = (title: string) =>
  title.toLowerCase().replace(/[^a-zA-Z ]/g, "").replaceAll(' ', '-');

/* Based on the current page name, find the corresponding template */
const findTemplate = (allTemplates: Template[], slug: string) => {
  return allTemplates.find((temp) => slugify(temp.title) === slug);
};

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

const getServices = async (template: Template, fetch: Fetch): Promise<Service[]> => {
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

/* Other apps sharing a category, A-Z. Pure local data, so it's free and always there. */
const findSimilar = (allTemplates: Template[], current: Template, limit = 8): SimilarApp[] => {
  const cats = new Set(current.categories ?? []);
  if (!cats.size) return [];
  return allTemplates
    .filter((t) => t.title !== current.title && (t.categories ?? []).some((c) => cats.has(c)))
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((t) => ({
      title: t.title,
      slug: slugify(t.title),
      logo: t.logo,
      category: (t.categories ?? []).find((c) => cats.has(c)),
    }));
};

/* Format results for returning to component */
const returnResults = async (allTemplates: Template[], templateSlug: string, fetch: Fetch) => {
  // Find template, based on slug
  let template = findTemplate(allTemplates, templateSlug);
  if (!template) throw error(404, `No template named "${templateSlug}"`);

  // Fetch service info from associated stackfile, if it exists
  let services = template.repository ? await getServices(template, fetch) : [];

  // If only 1 service, merge it with the template
  if (services.length === 1) {
    template = { ...template, ...services[0] };
  } else if (services.length > 1) {
    // If made up from multiple services, fetch Docker info for each image
    services = await Promise.all(
      services.map(async (service) => ({
        ...service,
        dockerStats: await getDockerHubStats(service.image, fetch),
      }))
    );
  }

  // Everything below is independent, so fetch it all at once
  const [dockerStats, dockerMeta, project] = await Promise.all([
    getDockerHubStats(template.image, fetch),
    getDockerMeta(template.image, fetch),
    getProjectStats(template.description, fetch),
  ]);

  return {
    template,
    dockerStats,
    dockerMeta,
    project,
    services,
    similar: findSimilar(allTemplates, template),
  };
};

export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
  const templateSlug = params.slug;
  let list = get(templates);
  if (!list || list.length === 0) {
    try {
      const data = await fetch(templatesUrl).then((res) => res.json());
      list = data.templates;
      templates.set(list);
    } catch {
      throw error(503, 'Could not load the templates list. Please try again shortly.');
    }
  }
  // Third-party stats change slowly, so let CDNs and browsers hang onto the page
  setHeaders({ 'cache-control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400' });
  return returnResults(list, templateSlug, fetch);
};

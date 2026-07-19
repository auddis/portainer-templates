import yaml from 'js-yaml';

import { error } from '@sveltejs/kit';
import { get } from 'svelte/store';
import { templatesUrl } from '$src/constants';
import { templates } from '$src/store';
import { getDockerHubStats, getDockerMeta } from '$lib/server/dockerhub';
import { getProjectStats, getReadme, getReleases } from '$lib/server/github';
import { slugify } from '$lib/format';
import type { Template, Service, Environment, Volume, SimilarApp, DockerMeta, ProjectStats } from '$src/Types';
import type { PageServerLoad } from './$types';

type Fetch = typeof globalThis.fetch;

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

/* Fetch and parse the template's stackfile, keeping the raw text too */
const getServices = async (template: Template, fetch: Fetch): Promise<{ services: Service[]; stackfile: string | null }> => {
  try {
    if (!template?.repository) return { services: [], stackfile: null };
    const { url: repoUrl, stackfile } = template.repository;
    const path = `${repoUrl.replace('github.com', 'raw.githubusercontent.com')}/HEAD/${stackfile}`;
    const response = await fetch(path);
    if (!response.ok) return { services: [], stackfile: null };
    const data = await response.text();
    const parsedData = yaml.load(data) as { services?: Record<string, ComposeServiceRaw> } | null;
    if (!parsedData?.services) return { services: [], stackfile: null };

    const services = Object.entries(parsedData.services).map(([name, serviceData]) => ({
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
    return { services, stackfile: data };
  } catch (error) {
    console.error('Error fetching or parsing YAML:', error);
    return { services: [], stackfile: null };
  }
};

/* Match docker tags to github releases, so each version can show its release notes */
const withReleaseNotes = async (meta: DockerMeta | null, project: ProjectStats | null, fetch: Fetch): Promise<DockerMeta | null> => {
  if (!meta?.versions.length || !project) return meta;
  const releases = (await getReleases(project.repo, fetch)) ?? [];
  const bare = (tag: string) => tag.replace(/^v/i, '');
  const byTag = new Map(releases.map((rel) => [bare(rel.tag_name), rel]));
  const versions = meta.versions.map((version) => {
    const rel = byTag.get(bare(version.name));
    return rel ? { ...version, release: { title: rel.name, notes: rel.body, url: rel.html_url } } : version;
  });
  return { ...meta, versions };
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
  let { services, stackfile } = await getServices(template, fetch);

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
  const [dockerStats, rawMeta, project] = await Promise.all([
    getDockerHubStats(template.image, fetch),
    getDockerMeta(template.image, fetch),
    getProjectStats(template, fetch),
  ]);
  const dockerMeta = await withReleaseNotes(rawMeta, project, fetch);

  // No Docker Hub docs to show? Fall back to the project's GitHub readme
  const hasDocs = !!dockerStats?.full_description || services.some((s) => s.dockerStats?.full_description);
  const readme = !hasDocs && project ? await getReadme(project.repo, fetch) : null;

  return {
    template,
    dockerStats,
    dockerMeta,
    project,
    readme,
    services,
    stackfile,
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

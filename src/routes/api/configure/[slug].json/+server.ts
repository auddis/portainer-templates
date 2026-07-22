import { json, error } from '@sveltejs/kit';
import { loadTemplates, getServices } from '$lib/server/templates';
import { getDockerHubStats, getDockerMeta } from '$lib/server/dockerhub';
import { getProjectStats } from '$lib/server/github';
import { slugify } from '$lib/format';
import type { Environment } from '$src/Types';
import type { RequestHandler } from './$types';

// Stackfile values win, but keep the template's richer definitions (labels, selects etc)
const mergeEnv = (defs: Environment[] = [], values: Environment[] = []): Environment[] => {
  if (!values.length) return defs;
  const byName = new Map(defs.map((env) => [env.name, env]));
  const seen = new Set(values.map((env) => env.name));
  return [
    ...values.map((env) => ({ ...byName.get(env.name), ...env })),
    ...defs.filter((env) => !seen.has(env.name)),
  ];
};

export const GET: RequestHandler = async ({ params, fetch, setHeaders }) => {
  const list = await loadTemplates(fetch);
  let template = list.find((t) => slugify(t.title) === params.slug);
  if (!template) throw error(404, `No template named "${params.slug}"`);

  const { services } = await getServices(template, fetch);
  if (services.length === 1) {
    template = { ...template, ...services[0], env: mergeEnv(template.env, services[0].env) };
  }

  const [meta, hubStats, project] = await Promise.all([
    getDockerMeta(template.image, fetch, 30),
    getDockerHubStats(template.image, fetch),
    getProjectStats(template, fetch),
  ]);
  setHeaders({ 'cache-control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400' });
  return json({
    template,
    services: services.length > 1 ? services : [],
    meta,
    stats: hubStats ? { pulls: hubStats.pull_count, updated: hubStats.last_updated } : null,
    github: project ? { repo: project.repo, url: project.url, stars: project.stars } : null,
  });
};

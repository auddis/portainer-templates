import { error } from '@sveltejs/kit';
import { loadTemplates, getServices } from '$lib/server/templates';
import { getDockerHubStats, getDockerMeta } from '$lib/server/dockerhub';
import { getProjectStats, getReadme, getReleases } from '$lib/server/github';
import { slugify } from '$lib/format';
import type { Template, Service, SimilarApp, DockerMeta, ProjectStats } from '$src/Types';
import type { PageServerLoad } from './$types';

type Fetch = typeof globalThis.fetch;

/* Based on the current page name, find the corresponding template */
const findTemplate = (allTemplates: Template[], slug: string) => {
  return allTemplates.find((temp) => slugify(temp.title) === slug);
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
  const list = await loadTemplates(fetch);
  // Third-party stats change slowly, so let CDNs and browsers hang onto the page
  setHeaders({ 'cache-control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400' });
  return returnResults(list, params.slug, fetch);
};

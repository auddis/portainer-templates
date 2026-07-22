import { json } from '@sveltejs/kit';
import { loadTemplates } from '$lib/server/templates';
import { slugify } from '$lib/format';
import type { RequestHandler } from './$types';

export const prerender = true;

// Slim A-Z app list for the config generator's picker
export const GET: RequestHandler = async ({ fetch }) => {
  const templates = await loadTemplates(fetch);
  const seen = new Set<string>();
  const apps = templates
    .flatMap((template) => {
      const slug = slugify(template.title);
      if (!slug || seen.has(slug)) return [];
      seen.add(slug);
      return [{ slug, title: template.title, ...(template.logo && { logo: template.logo }) }];
    })
    .sort((a, b) => a.title.localeCompare(b.title));
  return json(apps);
};

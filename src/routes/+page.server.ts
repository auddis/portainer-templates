import { error } from '@sveltejs/kit';
import { get } from 'svelte/store';
import { templates } from '$src/store';
import { templatesUrl } from '$src/constants';
import type { Template } from '$src/Types';
import type { PageServerLoad } from './$types';

const makeCategories = (allTemplates: Template[]): Record<string, number> => {
  // Get categories from templates
  const categories = allTemplates.reduce((acc: Record<string, number>, { categories: templateCategories }) => {
    (templateCategories || []).forEach((category) => {
      acc[category] = (acc[category] || 0) + 1;
    });
    return acc;
  }, {});

  // Sort categories by count, and remove categories with only a few templates
  const sortedCategories = Object.fromEntries(
    Object.entries(categories)
      .filter(([, value]) => value > 3)
      .sort(([, a], [, b]) => b - a)
  );

  return sortedCategories;
};


export const load: PageServerLoad = async () => {
  try {
    const data = await fetch(templatesUrl).then((res) => res.json());
    templates.set(data.templates);
    return {
      templates: data.templates as Template[],
      categories: makeCategories(data.templates),
    };
  } catch {
    // On a fetch failure, fall back to the last successfully loaded list if we have one
    const cached = get(templates);
    if (cached.length) {
      return { templates: cached, categories: makeCategories(cached) };
    }
    throw error(503, 'Could not load the templates list. Please try again shortly.');
  }
};

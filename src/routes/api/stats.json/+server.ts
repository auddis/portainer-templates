import { json } from '@sveltejs/kit';
import { getSearchIndex } from '$lib/server/search-index';

export const prerender = true;

export async function GET() {
  return json(await getSearchIndex());
}

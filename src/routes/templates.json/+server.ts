import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const CONTENTS = 'https://api.github.com/repos/Lissy93/portainer-templates/contents/templates.json';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
};

// Build GitHub API headers, only attaching the token and a user agent when a token is set
function ghHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github.raw+json' };
  if (env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    headers['User-Agent'] = 'portainer-templates-website';
  }
  return headers;
}

// Grab the raw templates file from GitHub at a given ref, returning null if the request never lands
async function fetchTemplates(ref: string | null, fetch: typeof globalThis.fetch): Promise<Response | null> {
  const url = ref ? `${CONTENTS}?ref=${encodeURIComponent(ref)}` : CONTENTS;
  try {
    return await fetch(url, { headers: ghHeaders(), signal: AbortSignal.timeout(8000) });
  } catch {
    return null;
  }
}

// Serve the Portainer templates from GitHub as JSON, optionally pinned to a version tag
export const GET: RequestHandler = async ({ url, fetch }) => {
  const version = url.searchParams.get('version') || null;
  // Tags are v-prefixed, so also try v1.2.3 when someone asks for 1.2.3
  const refs = version && !/^v/i.test(version) ? [version, `v${version}`] : [version];

  let res: Response | null = null;
  for (const ref of refs) {
    res = await fetchTemplates(ref, fetch);
    if (res?.ok) break;
  }

  if (res?.ok) {
    return new Response(await res.text(), {
      headers: { ...JSON_HEADERS, 'Cache-Control': 'public, max-age=3600' },
    });
  }

  // A missing tag is a 404, anything else is an upstream or network problem
  const missingVersion = version !== null && res?.status === 404;
  return new Response(
    JSON.stringify({
      error: missingVersion
        ? `No templates found for version "${version}"`
        : 'Unable to fetch templates from GitHub',
    }),
    { status: missingVersion ? 404 : 502, headers: JSON_HEADERS },
  );
};

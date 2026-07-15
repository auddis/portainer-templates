import snarkdown from 'snarkdown';
import { env } from '$env/dynamic/private';
import { baseUrl } from '$src/constants';
import type { RequestHandler } from './$types';

const repo = 'lissy93/portainer-templates';

interface GhRelease { tag_name: string; name: string | null; body: string | null; published_at: string; html_url: string; }

const escapeXml = (str: string) =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: RequestHandler = async ({ fetch, setHeaders }) => {
  const token = env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Releases are the minor/major versions, so patch tags are left out
  const releases = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, { headers })
    .then((res) => res.json() as Promise<GhRelease[]>)
    .catch(() => [] as GhRelease[]);

  releases.sort((a, b) => b.published_at.localeCompare(a.published_at));

  const entries = releases.map((release) => `
  <entry>
    <title>${escapeXml(release.name || release.tag_name)}</title>
    <link href="${release.html_url}" />
    <id>${release.html_url}</id>
    <updated>${release.published_at}</updated>
    <content type="html"><![CDATA[${release.body ? snarkdown(release.body) : ''}]]></content>
  </entry>`).join('');

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Portainer Templates Changelog</title>
  <link href="${baseUrl}/changelog.xml" rel="self" />
  <link href="${baseUrl}/changelog" />
  <id>${baseUrl}/changelog</id>
  <author><name>Alicia Sykes</name></author>
  <updated>${releases[0]?.published_at ?? new Date().toISOString()}</updated>${entries}
</feed>`;

  setHeaders({ 'cache-control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400' });
  return new Response(feed, { headers: { 'Content-Type': 'application/atom+xml' } });
};

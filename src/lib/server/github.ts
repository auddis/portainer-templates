import { env } from '$env/dynamic/private';
import { cached } from './cache';
import { fetchJson } from './http';
import type { ProjectStats } from '$src/Types';

const DAY = 86_400_000;

// Grab owner/repo from a github link. repo is greedy over word/dot/dash chars, so it
// naturally stops at the next slash, bracket or space (handles trailing slashes too).
const GITHUB_LINK = /\bgithub\.com\/([\w.-]+)\/([\w.-]+)/i;
const NOT_A_PROJECT = new Set(['sponsors', 'orgs', 'apps', 'topics', 'about', 'features', 'marketplace']);

// Only trust an explicit github link in the template's own description. Image names
// and repository.url point at aggregators (linuxserver etc), not the upstream project.
export function resolveRepo(description?: string): string | null {
  const match = description?.match(GITHUB_LINK);
  if (!match) return null;
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, '').replace(/\.+$/, '');
  if (!repo || NOT_A_PROJECT.has(owner.toLowerCase())) return null;
  return `${owner}/${repo}`;
}

function httpsOnly(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

interface GhRepo {
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  pushed_at: string;
  homepage: string | null;
  archived: boolean;
  license: { spdx_id: string | null } | null;
}
interface GhRelease {
  tag_name: string;
}

export function getProjectStats(
  description: string | undefined,
  fetch: typeof globalThis.fetch,
): Promise<ProjectStats | null> {
  const repo = resolveRepo(description);
  if (!repo) return Promise.resolve(null);

  return cached(`gh:${repo}`, DAY, async () => {
    const token = env.GITHUB_TOKEN;
    const headers = {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const data = await fetchJson<GhRepo>(`https://api.github.com/repos/${repo}`, { headers, fetch });
    if (!data) return null;

    const release = await fetchJson<GhRelease>(`https://api.github.com/repos/${repo}/releases/latest`, { headers, fetch });
    const license = data.license?.spdx_id;
    return {
      repo,
      url: `https://github.com/${repo}`,
      stars: data.stargazers_count,
      forks: data.forks_count,
      license: license && license !== 'NOASSERTION' ? license : null,
      language: data.language,
      updatedAt: data.pushed_at,
      latestRelease: release?.tag_name ?? null,
      homepage: httpsOnly(data.homepage),
      archived: data.archived,
    };
  });
}

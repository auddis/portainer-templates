import { env } from '$env/dynamic/private';
import { cached } from './cache';
import { fetchJson } from './http';
import type { ProjectStats, Template } from '$src/Types';

const DAY = 86_400_000;

// Grab owner/repo from a github link. repo is greedy over word/dot/dash chars, so it
// naturally stops at the next slash, bracket or space (handles trailing slashes too).
const GITHUB_LINK = /\bgithub\.com\/([\w.-]+)\/([\w.-]+)/i;
// A project's Pages site (owner.github.io/repo) maps straight back to its repo.
const PAGES_LINK = /\b([\w-]+)\.github\.io\/([\w.-]+)/i;
const NOT_A_PROJECT = new Set(['sponsors', 'orgs', 'apps', 'topics', 'about', 'features', 'marketplace']);
// Owners that republish other people's apps; their repos aren't the upstream project.
const AGGREGATORS = new Set(['linuxserver']);
// Monorepos that bundle many apps; not any single upstream project.
const AGGREGATOR_REPOS = new Set(['pi-hosted/pi-hosted']);

function toRepo(owner: string, repo: string): string | null {
  const o = owner.toLowerCase();
  const name = repo.replace(/\.git$/i, '').replace(/\.+$/, '');
  if (!name || NOT_A_PROJECT.has(o) || AGGREGATORS.has(o)) return null;
  if (AGGREGATOR_REPOS.has(`${o}/${name.toLowerCase()}`)) return null;
  return `${owner}/${name}`;
}

// Repos a template might map to, strongest signal first. Each is checked against the
// GitHub API in turn, so a wrong guess costs one 404 and falls through to the next.
// Aggregators (linuxserver on lscr.io etc) yield no candidate, so they never match.
function candidateRepos({ description, note, image }: Pick<Template, 'description' | 'note' | 'image'>): string[] {
  const text = `${description ?? ''} ${note ?? ''}`;
  const gh = text.match(GITHUB_LINK);
  const pages = text.match(PAGES_LINK);
  const img = (image ?? '').split('@')[0].split(':')[0].split('/');
  const ghcr = img.length === 3 && img[0] === 'ghcr.io' ? img.slice(1) : null;
  const hub = img.length === 2 && !img[0].includes('.') ? img : null;

  const ordered = [
    gh && toRepo(gh[1], gh[2]),          // explicit github link, the most deliberate signal
    ghcr && toRepo(ghcr[0], ghcr[1]),    // a GHCR image lives in the repo's own namespace
    pages && toRepo(pages[1], pages[2]), // the project's Pages site maps back to its repo
    hub && toRepo(hub[0], hub[1]),       // docker hub owner often mirrors the repo
  ];
  return [...new Set(ordered.filter((r): r is string => !!r))];
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
  template: Pick<Template, 'description' | 'note' | 'image'>,
  fetch: typeof globalThis.fetch,
): Promise<ProjectStats | null> {
  const repos = candidateRepos(template);
  if (!repos.length) return Promise.resolve(null);

  return cached(`gh:${repos.join(',')}`, DAY, async () => {
    const token = env.GITHUB_TOKEN;
    const headers = {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    for (const repo of repos) {
      const data = await fetchJson<GhRepo>(`https://api.github.com/repos/${repo}`, { headers, fetch });
      if (!data) continue;

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
    }
    return null;
  });
}

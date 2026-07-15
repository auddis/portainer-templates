import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { ChangelogEntry } from '$src/Types';
import type { PageServerLoad } from './$types';

const repo = 'lissy93/portainer-templates';

interface GhTag { name: string; commit: { sha: string }; }
interface GhRelease { tag_name: string; name: string | null; body: string | null; published_at: string; }
interface GhCommit { commit: { committer: { date: string } }; }

// patch number of 0 means it's a minor or major release, so we show its notes
const isMinorOrMajor = (version: string) => Number(version.replace(/^v/, '').split('.')[2]) === 0;

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
  const token = env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const gh = <T>(path: string): Promise<T> =>
    fetch(`https://api.github.com/repos/${repo}${path}`, { headers }).then((res) => {
      if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
      return res.json() as Promise<T>;
    });

  try {
    const [tags, releases] = await Promise.all([
      gh<GhTag[]>('/tags?per_page=100'),
      gh<GhRelease[]>('/releases?per_page=100'),
    ]);

    const releaseByTag = new Map(releases.map((r) => [r.tag_name, r]));

    const entries: ChangelogEntry[] = await Promise.all(
      tags.map(async (tag) => {
        const release = releaseByTag.get(tag.name);
        // Releases have a publish date, plain tags fall back to their commit date
        const date = release?.published_at
          ?? (await gh<GhCommit>(`/commits/${tag.commit.sha}`)).commit.committer.date;
        return {
          version: tag.name,
          date,
          isRelease: isMinorOrMajor(tag.name),
          title: release?.name ?? null,
          notes: release?.body?.trim() || null,
        };
      })
    );

    entries.sort((a, b) => b.date.localeCompare(a.date));

    setHeaders({ 'cache-control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400' });
    return { entries };
  } catch {
    throw error(503, 'Could not load the changelog from GitHub. Please try again shortly.');
  }
};

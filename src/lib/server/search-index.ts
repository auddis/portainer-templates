import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { env } from '$env/dynamic/private';
import { fetchJson, fetchText } from './http';
import { parseImage, summarise, type DhTag } from './dockerhub';
import { candidateRepos } from './github';
import { slugify } from '$lib/format';
import { templatesUrl } from '$src/constants';
import type { DockerHubResponse, SearchEntry, SearchIndex, Template } from '$src/Types';

const DAY = 86_400_000;
const CONCURRENCY = 8;
const HUB_GAP_MS = 100;
const CACHE_VERSION = 1;
const CACHE_FILE = path.join(process.cwd(), 'node_modules', '.cache', 'search-index.json');

// Databases and other sidecars that shouldn't count as a stack's main app
const SIDECARS = new Set([
  'postgres', 'postgresql', 'mysql', 'mariadb', 'redis', 'valkey', 'keydb', 'mongo', 'mongodb',
  'memcached', 'rabbitmq', 'elasticsearch', 'opensearch', 'clickhouse', 'minio', 'mc', 'traefik',
  'nginx', 'busybox', 'alpine', 'watchtower', 'docker-socket-proxy', 'socat',
]);

interface GhLite {
  ghRepo: string;
  ghStars: number;
  language?: string;
  ghUpdated?: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Run a worker over items a few at a time, so we don't hammer upstream APIs
async function pool<T, R>(items: T[], worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
  return results;
}

// Space out request starts so docker hub doesn't throttle the burst
let gate: Promise<unknown> = Promise.resolve();
function paced<T>(fn: () => Promise<T>): Promise<T> {
  const turn = (gate = gate.then(() => sleep(HUB_GAP_MS)));
  return turn.then(fn);
}

async function hubGet(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Paced fetch with retries on throttling or blips, but not on genuine 404s
async function hubJson<T>(url: string, attempts = 3): Promise<T | null> {
  const res = await paced(() => hubGet(url));
  if (res?.ok) return res.json().then((data) => data as T).catch(() => null);
  if (attempts <= 1 || res?.status === 404) return null;
  const wait = Math.min(Number(res?.headers.get('retry-after')) * 1000 || 5000, 30_000);
  await sleep(wait);
  return hubJson(url, attempts - 1);
}

function readCache(): SearchIndex | null {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    const fresh = raw.version === CACHE_VERSION && Date.now() - new Date(raw.generated).getTime() < DAY;
    return fresh ? { generated: raw.generated, entries: raw.entries } : null;
  } catch {
    return null;
  }
}

function writeCache(index: SearchIndex): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ version: CACHE_VERSION, ...index }));
  } catch {
    // no writable disk (serverless etc), skip caching
  }
}

const imageBase = (image: string) => image.split('@')[0].split(':')[0].split('/').pop() ?? '';

// Stack templates keep their images in a compose file. Use the service that looks like
// the app itself; if only databases and other sidecars have images (app built from
// source etc), attribute nothing rather than the sidecar's stats.
async function stackImage(template: Template): Promise<string | undefined> {
  if (!template.repository) return undefined;
  const { url, stackfile } = template.repository;
  const raw = await fetchText(`${url.replace('github.com', 'raw.githubusercontent.com')}/HEAD/${stackfile}`);
  if (!raw) return undefined;
  try {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const parsed = yaml.load(raw) as { services?: Record<string, { image?: string }> } | null;
    const services = Object.entries(parsed?.services ?? {}).filter(([, s]) => s?.image);
    const apps = services.filter(([, s]) => !SIDECARS.has(imageBase(s.image!)));
    const ref = norm(template.name || template.title);
    const named = ref && apps.find(([name, s]) => norm(name + s.image).includes(ref));
    // sidecar images only count when the template is that very thing (a postgres stack etc)
    const main = named || apps[0] || (ref && services.find(([, s]) => ref.includes(imageBase(s.image!))));
    return main ? main[1].image : undefined;
  } catch {
    return undefined;
  }
}

async function fetchGithub(repo: string, token: string): Promise<GhLite | null> {
  const data = await fetchJson<{ stargazers_count: number; language: string | null; pushed_at: string }>(
    `https://api.github.com/repos/${repo}`,
    { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` } },
  );
  if (!data) return null;
  return {
    ghRepo: repo,
    ghStars: data.stargazers_count,
    language: data.language ?? undefined,
    ghUpdated: data.pushed_at,
  };
}

async function build(): Promise<SearchIndex> {
  const opts = { timeoutMs: 15_000 };
  const data =
    (await fetchJson<{ templates: Template[] }>(templatesUrl, opts)) ??
    (await fetchJson<{ templates: Template[] }>(templatesUrl, opts));
  if (!data?.templates?.length) throw new Error('search-index: could not fetch templates list');
  const templates = data.templates;

  console.log(`[search-index] resolving images for ${templates.length} templates`);
  const images = await pool(templates, async (t) => t.image || (await stackImage(t)));

  const hubImages = [...new Set(images.filter((img): img is string => !!img && !!parseImage(img)))];
  console.log(`[search-index] fetching docker hub stats for ${hubImages.length} images`);
  const hub = new Map(
    await pool(hubImages, async (img) => {
      const { ns, repo } = parseImage(img)!;
      const stats = await hubJson<DockerHubResponse>(`https://hub.docker.com/v2/repositories/${ns}/${repo}/`);
      const tags = stats
        ? await hubJson<{ results: DhTag[] }>(`https://hub.docker.com/v2/repositories/${ns}/${repo}/tags/?page_size=100&ordering=last_updated`)
        : null;
      const meta = tags?.results?.length ? summarise(tags.results) : null;
      return [img, { stats, meta }] as const;
    }),
  );

  const token = env.GITHUB_TOKEN;
  const ghLookups = new Map<string, Promise<GhLite | null>>();
  const github = token
    ? await pool(templates, async (t, i) => {
        for (const repo of candidateRepos({ description: t.description, note: t.note, image: images[i] })) {
          const lookup = ghLookups.get(repo) ?? fetchGithub(repo, token);
          ghLookups.set(repo, lookup);
          const hit = await lookup;
          if (hit) return hit;
        }
        return null;
      })
    : templates.map(() => null);
  if (!token) console.log('[search-index] GITHUB_TOKEN not set, skipping github stats');

  const seen = new Set<string>();
  const entries: SearchEntry[] = [];
  templates.forEach((t, i) => {
    const slug = slugify(t.title);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    const { stats, meta } = (images[i] && hub.get(images[i]!)) || {};
    entries.push({
      slug,
      title: t.title,
      description: t.description ?? '',
      type: t.type,
      ...(t.logo && { logo: t.logo }),
      ...(t.categories?.length && { categories: t.categories }),
      ...(t.platform && { platform: t.platform }),
      ...(images[i] && { image: images[i] }),
      ...(stats && {
        pulls: stats.pull_count,
        dockerStars: stats.star_count,
        imageCreated: stats.date_registered,
        imageUpdated: stats.last_updated,
      }),
      ...(meta?.size && { size: meta.size }),
      ...(meta?.architectures.length && { architectures: meta.architectures }),
      ...github[i],
    });
  });

  const withStats = entries.filter((e) => e.pulls != null).length;
  console.log(`[search-index] built ${entries.length} entries, ${withStats} with docker stats`);
  return { generated: new Date().toISOString(), entries };
}

let pending: Promise<SearchIndex> | null = null;

export function getSearchIndex(): Promise<SearchIndex> {
  pending ??= (async () => {
    const cached = readCache();
    if (cached) return cached;
    const index = await build();
    // don't cache a run where docker hub was mostly unreachable
    if (index.entries.some((e) => e.pulls != null)) writeCache(index);
    return index;
  })();
  pending.catch(() => (pending = null));
  return pending;
}

import { cached } from './cache';
import { fetchJson } from './http';
import type { DockerHubResponse, DockerMeta } from '$src/Types';

const DAY = 86_400_000;

export interface DhTag {
  name: string;
  full_size: number;
  tag_last_pushed: string;
  images: { architecture: string; os: string; variant?: string }[];
}

// Docker Hub images are "repo" or "namespace/repo". Anything with a registry host
// (ghcr.io/..., lscr.io/...) or an extra path segment isn't on Docker Hub, so skip it.
// docker.io style prefixes are just hub aliases though, so strip those first.
export function parseImage(image: string): { ns: string; repo: string } | null {
  const name = image
    .split('@')[0]
    .split(':')[0]
    .replace(/^(docker\.io|index\.docker\.io|registry\.hub\.docker\.com)\//, '');
  const parts = name.split('/');
  if (parts.length > 2 || parts[0].includes('.')) return null;
  const [ns, repo] = parts.length === 2 ? parts : ['library', parts[0]];
  return ns && repo ? { ns, repo } : null;
}

export function getDockerHubStats(
  image: string | undefined,
  fetch: typeof globalThis.fetch,
): Promise<DockerHubResponse | null> {
  const parsed = image ? parseImage(image) : null;
  if (!parsed) return Promise.resolve(null);
  const { ns, repo } = parsed;
  return cached(`dh:stats:${ns}/${repo}`, DAY, () =>
    fetchJson<DockerHubResponse>(`https://hub.docker.com/v2/repositories/${ns}/${repo}/`, { fetch }),
  );
}

// Tags that shouldn't count as a real version, or stand in for "latest"
const ARCH_PREFIXED = /^(amd64|arm64|arm32|arm|386|i386|ppc64le|s390x|riscv64)([-/]|v\d)/i;
const PRERELEASE = /(nightly|beta|alpha|canary|-rc|-ls\d)/i;

// Keep clean release tags like "1.36.0" / "v10.11.11", drop arch-prefixed, sha,
// nightly and per-build noise that docker hub lists right alongside them.
function isVersion(tag: string): boolean {
  return /^v?\d+(\.\d+)+/.test(tag) && !ARCH_PREFIXED.test(tag) && !tag.startsWith('sha-') && !PRERELEASE.test(tag);
}

const ARCH_ORDER = ['amd64', 'arm64', 'arm/v7', 'arm/v6', '386', 'ppc64le', 's390x', 'riscv64'];

const rank = (x: string) => (ARCH_ORDER.indexOf(x) < 0 ? 99 : ARCH_ORDER.indexOf(x));
const sortArches = (arches: Iterable<string>) =>
  [...arches].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

const tagPlatforms = (tag: DhTag): string[] =>
  sortArches(new Set(
    (tag.images || [])
      .filter((img) => img.architecture && img.architecture !== 'unknown' && img.os !== 'unknown')
      .map((img) => (img.variant ? `${img.architecture}/${img.variant}` : img.architecture)),
  ));

export function summarise(results: DhTag[]): DockerMeta {
  const archSet = new Set<string>();
  for (const tag of results) tagPlatforms(tag).forEach((arch) => archSet.add(arch));
  const architectures = sortArches(archSet);

  const versions: DockerMeta['versions'] = [];
  const seen = new Set<string>();
  for (const tag of results) {
    if (versions.length >= 5) break;
    if (!isVersion(tag.name) || seen.has(tag.name)) continue;
    seen.add(tag.name);
    versions.push({ name: tag.name, size: tag.full_size, date: tag.tag_last_pushed, platforms: tagPlatforms(tag) });
  }

  const size = versions[0]?.size || results[0]?.full_size || null;
  return { architectures, size, latestVersion: versions[0]?.name ?? null, versions };
}

export function getDockerMeta(
  image: string | undefined,
  fetch: typeof globalThis.fetch,
): Promise<DockerMeta | null> {
  const parsed = image ? parseImage(image) : null;
  if (!parsed) return Promise.resolve(null);
  const { ns, repo } = parsed;
  return cached(`dh:meta:${ns}/${repo}`, DAY, async () => {
    const url = `https://hub.docker.com/v2/repositories/${ns}/${repo}/tags/?page_size=100&ordering=last_updated`;
    const data = await fetchJson<{ results: DhTag[] }>(url, { fetch });
    if (!data?.results?.length) return null;
    const meta = summarise(data.results);
    // Nothing worth showing? Let the caller treat it as absent
    return meta.architectures.length || meta.size || meta.versions.length ? meta : null;
  });
}

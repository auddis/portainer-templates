import { cached } from './cache';
import { fetchJson } from './http';
import { sortArches } from './dockerhub';
import type { DockerHubResponse, DockerMeta } from '$src/Types';

const DAY = 86_400_000;

interface OciPlatform {
  architecture: string;
  os: string;
  variant?: string;
}

interface OciDescriptor {
  digest: string;
  platform?: OciPlatform;
}

interface OciManifest {
  manifests?: OciDescriptor[]; // present on a multi-arch image index / manifest list
  layers?: { size: number }[]; // present on a single image manifest
}

// GHCR refs look like ghcr.io/{owner}/{name}[:tag][@digest]. The registry repository is the
// whole path after the host. Anything that isn't a ghcr.io image gets skipped.
export function parseGhcr(image: string | undefined): { repository: string; owner: string; tag: string } | null {
  if (!image?.startsWith('ghcr.io/')) return null;
  const path = image.slice('ghcr.io/'.length).split('@')[0];
  const [repository, tag] = path.split(':');
  const owner = repository.split('/')[0];
  return repository.includes('/') && owner ? { repository, owner, tag: tag || 'latest' } : null;
}

// Media types we'll accept back, so the registry hands us a real manifest and not a 404 on Accept
const ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

// Buildkit attaches attestation manifests with a bogus unknown/unknown platform, drop those
const realArch = (m: OciDescriptor): m is OciDescriptor & { platform: OciPlatform } =>
  !!m.platform && m.platform.architecture !== 'unknown' && m.platform.os !== 'unknown';

// GHCR is a standard OCI registry, so grab an anonymous pull token, read the manifest and pull
// architectures + compressed size straight out of it. No GITHUB_TOKEN needed for public images.
// GHCR exposes no pull count, so unlike Docker Hub there's no downloads figure to show.
export function getGhcrStats(
  image: string | undefined,
  fetch: typeof globalThis.fetch,
): Promise<{ info: DockerHubResponse; meta: DockerMeta } | null> {
  const parsed = image ? parseGhcr(image) : null;
  if (!parsed) return Promise.resolve(null);
  const { repository, owner, tag } = parsed;

  return cached(`ghcr:${repository}:${tag}`, DAY, async () => {
    const scope = `repository:${repository}:pull`;
    const auth = await fetchJson<{ token: string }>(
      `https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent(scope)}`,
      { fetch },
    );
    if (!auth?.token) return null;

    const headers = { Authorization: `Bearer ${auth.token}`, Accept: ACCEPT };
    const manifestUrl = (ref: string) => `https://ghcr.io/v2/${repository}/manifests/${ref}`;
    const top = await fetchJson<OciManifest>(manifestUrl(tag), { fetch, headers });
    if (!top) return null;

    // Multi-arch: architectures come from the index entries, size from one child manifest's layers
    const entries = (top.manifests ?? []).filter(realArch);
    const architectures = sortArches(
      new Set(entries.map((m) => (m.platform.variant ? `${m.platform.architecture}/${m.platform.variant}` : m.platform.architecture))),
    );

    let layers = top.layers;
    if (entries.length) {
      const pick = entries.find((m) => m.platform.architecture === 'amd64') ?? entries[0];
      layers = (await fetchJson<OciManifest>(manifestUrl(pick.digest), { fetch, headers }))?.layers;
    }
    const size = layers?.length ? layers.reduce((sum, l) => sum + (l.size || 0), 0) : null;

    // Nothing worth showing? Let the caller treat the image as having no stats
    if (!architectures.length && !size) return null;

    // The image-details card reads only a few of these fields and hides any that are empty, so a
    // minimal object renders a correct GHCR card (pulls/status/dates just don't appear).
    const info = { name: repository.split('/').slice(1).join('/'), hub_user: owner } as unknown as DockerHubResponse;
    const meta: DockerMeta = { architectures, size, latestVersion: null, versions: [] };
    return { info, meta };
  });
}

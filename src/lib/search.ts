import snarkdown from 'snarkdown';
import type { SearchEntry } from '$src/Types';

export interface SearchDoc {
  entry: SearchEntry;
  plain: string;
  title: string;
  text: string;
  tags: string;
}

export interface RankedEntry {
  entry: SearchEntry;
  plain: string;
  rank: number;
}

// markdown sneaks into some descriptions, flatten it for display and matching
export const plainText = (md: string): string => snarkdown(md).replace(/<[^>]*>/g, '');

// newest of the docker or github timestamps, for "recently updated"
export const lastUpdated = (e: SearchEntry): number | undefined =>
  Math.max(Date.parse(e.imageUpdated ?? '') || 0, Date.parse(e.ghUpdated ?? '') || 0) || undefined;

// flatten an entry into the lowercased fields we match against
export const buildDoc = (entry: SearchEntry): SearchDoc => {
  const plain = plainText(entry.description);
  return {
    entry,
    plain,
    title: entry.title.toLowerCase(),
    text: plain.toLowerCase(),
    tags: [entry.slug, ...(entry.categories ?? []), entry.image ?? '', entry.ghRepo ?? '', entry.language ?? '']
      .join(' ')
      .toLowerCase(),
  };
};

// chars just need to appear in order, so "grfana" still finds grafana
const subsequence = (needle: string, hay: string): boolean => {
  let i = 0;
  for (const c of hay) if (c === needle[i]) i++;
  return i === needle.length;
};

const tokenScore = (t: string, d: SearchDoc): number => {
  if (d.title === t) return 100;
  if (d.title.startsWith(t)) return 60;
  if (d.title.includes(t)) return 40;
  if (d.tags.includes(t)) return 25;
  if (d.text.includes(t)) return 15;
  if (t.length > 2 && subsequence(t, d.title)) return 8;
  return 0;
};

// every word must hit somewhere, closer hits rank higher
export const rankDoc = (d: SearchDoc, words: string[]): number => {
  let total = 0;
  for (const w of words) {
    const s = tokenScore(w, d);
    if (!s) return 0;
    total += s;
  }
  return total;
};

export const tokenize = (q: string): string[] => q.trim().toLowerCase().split(/\s+/).filter(Boolean);

// rank every entry against a free-text query, best first, dropping non-matches
export const searchEntries = (entries: SearchEntry[], query: string, limit?: number): RankedEntry[] => {
  const words = tokenize(query);
  if (!words.length) return [];
  const ranked = entries
    .map(buildDoc)
    .map((d) => ({ entry: d.entry, plain: d.plain, rank: rankDoc(d, words) }))
    .filter((d) => d.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.entry.title.localeCompare(b.entry.title));
  return limit ? ranked.slice(0, limit) : ranked;
};

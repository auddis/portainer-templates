type FetchLike = typeof globalThis.fetch;

interface Options {
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetch?: FetchLike;
}

// Fetch JSON with a hard timeout. Never throws; a failure (network, bad status,
// timeout, dodgy JSON) just resolves to null so callers can degrade gracefully.
export async function fetchJson<T>(url: string, opts: Options = {}): Promise<T | null> {
  const { headers, timeoutMs = 5000, fetch: doFetch = fetch } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(url, { headers, signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type FetchLike = typeof globalThis.fetch;

interface Options {
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetch?: FetchLike;
}

// Fetch with a hard timeout. Never throws; a failure (network, bad status,
// timeout, dodgy body) just resolves to null so callers can degrade gracefully.
async function fetchBody<T>(url: string, read: (res: Response) => Promise<T>, opts: Options = {}): Promise<T | null> {
  const { headers, timeoutMs = 5000, fetch: doFetch = fetch } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(url, { headers, signal: controller.signal });
    if (!res.ok) return null;
    return await read(res);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const fetchJson = <T>(url: string, opts: Options = {}): Promise<T | null> =>
  fetchBody(url, (res) => res.json() as Promise<T>, opts);

export const fetchText = (url: string, opts: Options = {}): Promise<string | null> =>
  fetchBody(url, (res) => res.text(), opts);

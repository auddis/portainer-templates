interface Entry {
  value: unknown;
  expires: number;
}

const store = new Map<string, Entry>();

// Tiny in-memory TTL cache. Great on the long-running node server, and a harmless
// no-op on serverless where module state doesn't survive between invocations.
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  const value = await fn();
  // Keep failures around only briefly so a blip doesn't stick for the full ttl
  const ttl = value == null ? Math.min(ttlMs, 60_000) : ttlMs;
  store.set(key, { value, expires: Date.now() + ttl });
  return value;
}

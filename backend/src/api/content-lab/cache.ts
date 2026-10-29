/**
 * Small in-process TTL cache of promises: concurrent callers for the same key
 * share one fetch, a rejected fetch is evicted (the next caller retries), and
 * the oldest entry goes once `maxEntries` is reached. Per process: the VPS
 * `api` service is one process, so explore pages, creator reads and type-ahead
 * keystrokes share it; a restart just starts cold.
 */
export function createTtlCache<T>(ttlMs: number, maxEntries: number) {
  const entries = new Map<string, { value: Promise<T>; expiresAt: number }>();

  function get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = entries.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    if (hit) entries.delete(key);
    if (entries.size >= maxEntries) entries.delete(entries.keys().next().value!);
    const value = load();
    entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    value.catch(() => {
      if (entries.get(key)?.value === value) entries.delete(key);
    });
    return value;
  }

  /** True when `key` holds a live entry (loaded or loading). */
  function has(key: string): boolean {
    const hit = entries.get(key);
    return Boolean(hit && hit.expiresAt > Date.now());
  }

  return { get, has };
}

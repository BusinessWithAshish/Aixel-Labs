export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function jitter(max = 300): number {
  return Math.random() * max;
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  detail: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timed out after ${ms}ms (${detail})`)),
        ms,
      ),
    ),
  ]);
}

export function shortUrl(url: string, maxLen = 90): string {
  return url.length > maxLen ? url.slice(0, maxLen) + "…" : url;
}

/**
 * Merges header maps left→right. Same header name with different casing counts once;
 * later layers override values.
 */
export function mergeHttpHeaderRecords(
  ...layers: Record<string, string>[]
): Record<string, string> {
  const canonicalKeyByLower = new Map<string, string>();
  const valueByLower = new Map<string, string>();

  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer)) {
      const lower = k.toLowerCase();
      canonicalKeyByLower.set(lower, k);
      valueByLower.set(lower, v);
    }
  }

  const out: Record<string, string> = {};
  for (const lower of canonicalKeyByLower.keys()) {
    const key = canonicalKeyByLower.get(lower)!;
    out[key] = valueByLower.get(lower)!;
  }
  return out;
}

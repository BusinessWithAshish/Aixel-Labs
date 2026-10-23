import 'server-only';

// shortcut: in-memory per server instance, so serverless instances each keep their own count; move to Mongo/Redis if abuse gets past it.
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 20; // per window per key

type Bucket = { count: number; windowStart: number; windowMs: number };

const buckets = new Map<string, Bucket>();

// Evict stale entries every 5 minutes to prevent unbounded growth
const CLEANUP_INTERVAL_MS = 5 * 60_000;
let lastCleanup = Date.now();

function evictStale(now: number) {
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
    lastCleanup = now;
    for (const [key, bucket] of buckets) {
        if (now - bucket.windowStart > bucket.windowMs) buckets.delete(key);
    }
}

/**
 * Fixed-window rate limiter keyed by e.g. userId.
 * Returns `{ allowed: true }` if the request is within limits,
 * or `{ allowed: false, retryAfterMs }` if the caller should back off.
 */
export function checkRateLimit(
    key: string,
    max = MAX_REQUESTS,
    windowMs = WINDOW_MS,
): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const now = Date.now();
    evictStale(now);

    const bucket = buckets.get(key);

    if (!bucket || now - bucket.windowStart > windowMs) {
        buckets.set(key, { count: 1, windowStart: now, windowMs });
        return { allowed: true };
    }

    if (bucket.count >= max) {
        const retryAfterMs = windowMs - (now - bucket.windowStart);
        return { allowed: false, retryAfterMs };
    }

    bucket.count++;
    return { allowed: true };
}

/** `checkRateLimit` for server actions: throws a plain message when over the limit. */
export function assertRateLimit(key: string, max: number, windowMs = WINDOW_MS): void {
    const limit = checkRateLimit(key, max, windowMs);
    if (!limit.allowed) {
        throw new Error(`Too many tries. Try again in ${Math.ceil(limit.retryAfterMs / 1000)} seconds.`);
    }
}

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 20; // per window per user

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

// Evict stale entries every 5 minutes to prevent unbounded growth
const CLEANUP_INTERVAL_MS = 5 * 60_000;
let lastCleanup = Date.now();

function evictStale(now: number) {
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
    lastCleanup = now;
    for (const [key, bucket] of buckets) {
        if (now - bucket.windowStart > WINDOW_MS) buckets.delete(key);
    }
}

/**
 * Fixed-window rate limiter keyed by userId.
 * Returns `{ allowed: true }` if the request is within limits,
 * or `{ allowed: false, retryAfterMs }` if the user should back off.
 */
export function checkRateLimit(userId: string): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const now = Date.now();
    evictStale(now);

    const bucket = buckets.get(userId);

    if (!bucket || now - bucket.windowStart > WINDOW_MS) {
        buckets.set(userId, { count: 1, windowStart: now });
        return { allowed: true };
    }

    if (bucket.count >= MAX_REQUESTS) {
        const retryAfterMs = WINDOW_MS - (now - bucket.windowStart);
        return { allowed: false, retryAfterMs };
    }

    bucket.count++;
    return { allowed: true };
}

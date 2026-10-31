/**
 * The clock for LineFinder's collection, like `board-schedule-ticker.ts` is for boards. The worker
 * lives in the frontend (`POST /api/line-finder/collect/run-due`) because it owns the Mongo writes,
 * and it runs serverless, so something long-lived has to call it.
 *
 * Off unless both env vars are set. Started by `server.ts` in the `api` service only.
 */

import { fetch } from "undici";

const TICK_MS = 60_000;
/** The route answers within its 5-minute limit. */
const REQUEST_TIMEOUT_MS = 310_000;

/** Starts ticking; returns a stop function, or undefined when collection isn't configured. */
export function startLineFinderTicker(): (() => void) | undefined {
  const url = process.env.LINE_FINDER_COLLECT_URL?.trim();
  const secret = process.env.CRON_SECRET?.trim();
  if (!url || !secret) {
    console.log("[line-finder] collection off: set LINE_FINDER_COLLECT_URL and CRON_SECRET to turn it on");
    return undefined;
  }

  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) console.warn(`[line-finder] run-due answered ${res.status}`);
    } catch (error) {
      console.warn(`[line-finder] run-due failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      busy = false;
    }
  };

  const timer = setInterval(tick, TICK_MS);
  timer.unref();
  return () => clearInterval(timer);
}

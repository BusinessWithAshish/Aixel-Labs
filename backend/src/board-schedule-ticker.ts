/**
 * The clock for Content Lab's scheduled board runs. The runner itself lives in the frontend
 * (`POST /api/content-lab/boards/run-due`): it owns the boards' Mongo writes and the owner's AI
 * key, and it runs serverless, so something long-lived has to call it. This process is that
 * caller: every `TICK_MS` it posts to `CONTENT_LAB_RUN_DUE_URL` with `CRON_SECRET`, and the route
 * runs whatever is due (boards are claimed with a lease, so two slots ticking during a deploy
 * never run a board twice).
 *
 * Off unless both env vars are set. Started by `server.ts` in the `api` service only.
 */

import { fetch } from "undici";

const TICK_MS = 5 * 60_000;
/** The route answers within its 5-minute limit. */
const REQUEST_TIMEOUT_MS = 310_000;
const FIRST_TICK_MS = 30_000;
/** Calls in a row while the route says more boards are due (it runs about one long board per call). */
const MAX_CALLS_PER_TICK = 6;

/** Starts ticking; returns a stop function, or undefined when scheduled runs are not configured. */
export function startBoardScheduleTicker(): (() => void) | undefined {
  const url = process.env.CONTENT_LAB_RUN_DUE_URL?.trim();
  const secret = process.env.CRON_SECRET?.trim();
  if (!url || !secret) {
    console.log("[content-lab] scheduled board runs off: set CONTENT_LAB_RUN_DUE_URL and CRON_SECRET to turn them on");
    return undefined;
  }

  let busy = false;
  let stopped = false;
  /** One call; true when the route says boards are still due. */
  const call = async (): Promise<boolean> => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn(`[content-lab] run-due answered ${res.status}`);
        return false;
      }
      const body = (await res.json().catch(() => null)) as { data?: { more?: boolean } } | null;
      return body?.data?.more === true;
    } catch (error) {
      console.warn(`[content-lab] run-due failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      for (let calls = 0; calls < MAX_CALLS_PER_TICK && !stopped; calls++) {
        if (!(await call())) break;
      }
    } finally {
      busy = false;
    }
  };

  const first = setTimeout(tick, FIRST_TICK_MS);
  const timer = setInterval(tick, TICK_MS);
  first.unref();
  timer.unref();
  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(timer);
  };
}

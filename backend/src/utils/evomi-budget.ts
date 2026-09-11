import { EVOMI_BUDGET_CONFIG } from "./constants";

/**
 * Global Evomi spend cap — checked from `buildEvomiProxyUrl`, which every
 * proxied path (TLS sessions, gsearch, YouTube InnerTube) goes through.
 *
 * Off unless BOTH `EVOMI_DAILY_CAP_MB` and `EVOMI_PUBLIC_API_KEY` are set.
 * When on, it compares Evomi's own rolling-24h bandwidth figure
 * (`GET api.evomi.com/public/usage?period=24h`, the dashboard number) against
 * the cap and throws `EvomiBudgetExceededError` (503) instead of handing out
 * a proxy URL once the cap is reached.
 *
 * The check is synchronous so `buildEvomiProxyUrl` can stay sync: it reads
 * a cached figure and kicks a background refresh when that figure is stale.
 * Consequences worth knowing:
 *  - Fail-open. No figure yet (first call after boot), the usage API down,
 *    or a figure older than `STALE_AFTER_MS` → the call is allowed.
 *  - It gates NEW proxy URLs only. A transfer already in flight, or a caller
 *    that built its proxy URL earlier and reuses it (the YouTube download's
 *    per-country InnerTube agent), is not interrupted.
 *  - Evomi's figure lags real traffic by a few minutes.
 */

type BudgetState = { usedMb: number; checkedAt: number };

let state: BudgetState | null = null;
let inflight: Promise<void> | null = null;
let lastWarnAt = 0;

export class EvomiBudgetExceededError extends Error {
  readonly statusCode = 503;
}

function capMb(): number | null {
  const n = Number(process.env[EVOMI_BUDGET_CONFIG.CAP_ENV]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function apiKey(): string | undefined {
  return process.env[EVOMI_BUDGET_CONFIG.API_KEY_ENV]?.trim() || undefined;
}

function warnThrottled(message: string): void {
  if (Date.now() - lastWarnAt < EVOMI_BUDGET_CONFIG.WARN_EVERY_MS) return;
  lastWarnAt = Date.now();
  console.warn(`[evomi-budget] ${message}`);
}

async function refresh(key: string): Promise<void> {
  try {
    const url = `${EVOMI_BUDGET_CONFIG.USAGE_URL}?product=${EVOMI_BUDGET_CONFIG.USAGE_PRODUCT}&period=24h`;
    // Plain global fetch — this call must never itself go through the proxy.
    const res = await fetch(url, {
      headers: {
        "x-apikey": key,
        // api.evomi.com 403s requests without a UA.
        "user-agent": EVOMI_BUDGET_CONFIG.USER_AGENT,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(EVOMI_BUDGET_CONFIG.REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { meta?: { total_bandwidth_mb?: unknown } };
    const usedMb = Number(body.meta?.total_bandwidth_mb);
    if (!Number.isFinite(usedMb)) throw new Error("response has no meta.total_bandwidth_mb");
    state = { usedMb, checkedAt: Date.now() };
  } catch (err) {
    warnThrottled(
      `usage check failed, cap not enforced until it recovers: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function kickRefresh(key: string): void {
  if (inflight) return;
  inflight = refresh(key).finally(() => {
    inflight = null;
  });
}

/** Throws `EvomiBudgetExceededError` when the rolling-24h usage is at/over the cap. */
export function assertEvomiBudget(): void {
  const cap = capMb();
  const key = apiKey();
  if (cap === null || !key) return;

  const now = Date.now();
  if (!state || now - state.checkedAt > EVOMI_BUDGET_CONFIG.REFRESH_MS) kickRefresh(key);
  if (!state || now - state.checkedAt > EVOMI_BUDGET_CONFIG.STALE_AFTER_MS) return;

  if (state.usedMb >= cap) {
    throw new EvomiBudgetExceededError(
      `Evomi daily cap reached: ${Math.round(state.usedMb)} MB used in the last 24h (cap ${cap} MB, ${EVOMI_BUDGET_CONFIG.CAP_ENV}). ` +
        `Proxied requests are refused until the rolling 24h window drops below the cap.`,
    );
  }
}

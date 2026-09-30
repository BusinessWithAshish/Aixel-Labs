// ─────────────────────────────────────────────────────────────
//  GMAPS SCRAPER — SERVICE
//  Orchestration shared by the HTTP handler and the MCP tool.
// ─────────────────────────────────────────────────────────────

import { GMAPS } from "./constants";
import {
  closeUrlFetchSession,
  createGmapsSession,
  delay,
  extractPsi,
  fetchPage,
  generateQueries,
  parsePlaces,
  pickBrowserProfile,
} from "./helpers";
import type { GMAPS_INTERNAL_REQUEST, GMAPS_INTERNAL_RESPONSE } from "./types";
import {
  GMAPS_ENRICHMENT_DEFAULTS,
  GMAPS_REQUEST_LIMIT_DEFAULT,
  filterGmapsPlaces,
} from "../filters";
import { GMAPS_EMPTY, buildGmapsSearchQuery } from "../place-types";

/** Thrown for the request-shape checks the Zod schema can't express (still a 400 over HTTP). */
export class GmapsInternalValidationError extends Error {}

/**
 * Thrown when every city was blocked (bot detection, 429, 403, network
 * failure) rather than genuinely returning zero places. Callers must not
 * treat this the same as a confirmed-empty `[]` result — the underlying
 * `errors` list names why each city failed.
 */
export class GmapsBlockedError extends Error {
  constructor(
    message: string,
    public readonly errors: string[],
  ) {
    super(message);
  }
}

/** A page/PSI-level failure worth aborting a city's retries over immediately. */
function isBlockingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("429") ||
    msg.includes("403") ||
    /bot detection/i.test(msg) ||
    /HTTP 302/.test(msg)
  );
}

/** Primary Maps lead search — same logic HTTP and MCP call, no loopback. */
export async function searchGmapsInternal(
  parsed: GMAPS_INTERNAL_REQUEST,
): Promise<GMAPS_INTERNAL_RESPONSE[]> {
  if (parsed.urls?.length) {
    throw new GmapsInternalValidationError("URL mode not implemented");
  }

  if (!parsed.query && !parsed.placeType) {
    throw new GmapsInternalValidationError("Query or placeType is required");
  }

  if (!parsed.countryCode?.trim()) {
    throw new GmapsInternalValidationError("countryCode is required");
  }

  const {
    query,
    placeType,
    cities = [],
    state = GMAPS_EMPTY,
    country = GMAPS_EMPTY,
    countryCode,
    enrichment = GMAPS_ENRICHMENT_DEFAULTS,
    limit = GMAPS_REQUEST_LIMIT_DEFAULT,
  } = parsed;
  const resolvedHl = GMAPS.DEFAULT_HL;
  const resolvedGl = countryCode.toLowerCase();

  const searchQuery = buildGmapsSearchQuery({ placeType, query });
  if (!searchQuery) {
    throw new GmapsInternalValidationError("Query or placeType is required");
  }

  const queries = generateQueries(searchQuery, cities, state, country);

  if (!queries.length) {
    throw new GmapsInternalValidationError(
      "No queries generated — provide at least one city",
    );
  }

  // ── Pick ONE browser profile for this entire call lifecycle ──
  // Same UA + TLS clientIdentifier throughout = consistent browser identity.
  // Individual sessions are created fresh per city below.
  const profile = pickBrowserProfile();
  console.log(
    `[gmaps] Profile: ${profile.clientIdentifier} | ${profile.platform}`,
  );
  console.log(
    `[gmaps] Starting ${queries.length} quer${queries.length === 1 ? "y" : "ies"}`,
  );

  const allPlaces: GMAPS_INTERNAL_RESPONSE[] = [];
  const blockedCityErrors: string[] = [];
  let consecutiveFails = 0;

  // ── City loop ───────────────────────────────────────────────
  for (let qi = 0; qi < queries.length; qi++) {
    const cityQuery = queries[qi];

    if (consecutiveFails >= GMAPS.MAX_CONSECUTIVE_FAILURES) {
      console.warn(
        `[gmaps] Halting — ${GMAPS.MAX_CONSECUTIVE_FAILURES} consecutive failures`,
      );
      blockedCityErrors.push(
        `Halted after ${GMAPS.MAX_CONSECUTIVE_FAILURES} consecutive city failures`,
      );
      break;
    }

    let citySuccess = false;
    let lastBlockError: string | null = null;

    // ── Retry loop per city ────────────────────────────────────
    for (
      let attempt = 1;
      attempt <= GMAPS.MAX_RETRIES && !citySuccess;
      attempt++
    ) {
      // One TLS session batch per city (cookie jar + sticky proxy).
      const session = await createGmapsSession(profile);

      try {
        console.log(
          `[gmaps] [${qi + 1}/${queries.length}] Attempt ${attempt}: "${cityQuery}"`,
        );

        const { psi, lat, lng } = await extractPsi(
          session,
          profile,
          cityQuery,
          resolvedHl,
          resolvedGl,
        );

        const cityPlaces: GMAPS_INTERNAL_RESPONSE[] = [];

        // ── Page loop ────────────────────────────────────────────
        // fetch page 1 twice, then page 2, then the rest of the pages
        const pageOrder = [
          1,
          1,
          2,
          ...Array.from({ length: GMAPS.MAX_PAGES - 2 }, (_, i) => i + 3),
        ];
        for (const page of pageOrder) {
          try {
            const data = await fetchPage(
              session,
              profile,
              cityQuery,
              lat,
              lng,
              page,
              psi,
              resolvedHl,
              resolvedGl,
            );
            const places = parsePlaces(data);

            cityPlaces.push(...places);
            console.log(
              `[gmaps]   pg${page}: ${places.length} results (city total: ${cityPlaces.length})`,
            );

            // Fewer than a full page → this is the last page
            if (places.length < GMAPS.RESULTS_PER_PAGE) break;

            // Humanlike delay before next page
            if (page < GMAPS.MAX_PAGES) {
              await delay(GMAPS.DELAY_PAGE_MIN, GMAPS.DELAY_PAGE_MAX);
            }
          } catch (pageErr) {
            const msg = String(pageErr);
            console.error(`[gmaps]   pg${page} error: ${msg}`);

            // Rate limit / forbidden → abort this city immediately (don't waste retries)
            if (msg.includes("429") || msg.includes("403")) throw pageErr;

            // Other page errors → skip page, continue
          }
        }

        // A page loop that completed with zero places (no exception thrown
        // above) is a confirmed empty result, not a failure — don't retry it
        // and don't let it masquerade as a block below.
        allPlaces.push(...cityPlaces);
        citySuccess = true;
        consecutiveFails = 0;
        console.log(`[gmaps] ✓ City done: ${cityPlaces.length} places`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[gmaps] Attempt ${attempt} failed: ${msg}`);
        if (isBlockingError(err)) lastBlockError = msg;

        if (attempt < GMAPS.MAX_RETRIES) {
          const backoff = GMAPS.DELAY_RETRY_BASE * attempt;
          await delay(backoff, backoff + 1_000);
        }
      } finally {
        await closeUrlFetchSession(session);
      }
    }

    if (!citySuccess) {
      consecutiveFails++;
      console.warn(`[gmaps] ✗ City failed after ${GMAPS.MAX_RETRIES} attempts`);
      blockedCityErrors.push(
        `"${cityQuery}": ${lastBlockError ?? "failed after retries"}`,
      );
    }

    // Inter-city delay (skip after the last query)
    if (qi < queries.length - 1) {
      await delay(GMAPS.DELAY_CITY_MIN, GMAPS.DELAY_CITY_MAX);
    }
  }

  // Every city was blocked/failed and nothing came back — surface that as a
  // real error instead of a `[]` that looks identical to a confirmed-empty
  // search. A genuinely empty city (fetches succeeded, zero places) never
  // reaches here because it doesn't push onto blockedCityErrors above.
  if (allPlaces.length === 0 && blockedCityErrors.length > 0) {
    throw new GmapsBlockedError(
      `Google Maps search blocked or failed for all ${queries.length} cit${queries.length === 1 ? "y" : "ies"}: ${blockedCityErrors.join("; ")}`,
      blockedCityErrors,
    );
  }

  // ── Deduplicate by placeId, preferring entries with rating/reviewCount ──
  // (warmup page returns nulls; later fetches of same place have correct data)
  const byPlaceId = new Map<string, GMAPS_INTERNAL_RESPONSE>();
  for (const p of allPlaces) {
    if (!p.placeId) continue;
    const existing = byPlaceId.get(p.placeId);
    if (!existing) {
      byPlaceId.set(p.placeId, p);
    } else {
      byPlaceId.set(p.placeId, {
        ...existing,
        rating: p.rating ?? existing.rating,
        reviewCount: p.reviewCount ?? existing.reviewCount,
      });
    }
  }
  const unique = Array.from(byPlaceId.values());
  const filtered = filterGmapsPlaces(unique, enrichment);
  const limited = filtered.slice(0, limit);

  const duplicatesRemoved = allPlaces.length - unique.length;
  console.log(
    `[gmaps] Done — ${allPlaces.length} fetched, ${unique.length} unique, ${duplicatesRemoved} dupes removed, ${filtered.length} after enrichment, ${limited.length} after limit`,
  );

  return limited;
}

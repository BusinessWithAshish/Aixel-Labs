// ─────────────────────────────────────────────────────────────
//  GMAPS SCRAPER — HANDLER
//  POST /gmaps/internal
//
//  Session strategy per HTTP request:
//  ┌─────────────────────────────────────────────────────────┐
//  │  1 browser profile (random, fixed for entire lifecycle) │
//  │  └── per city:                                          │
//  │       • fresh TLS session (new cookie jar)              │
//  │       • fresh PSI  (never reused across cities)         │
//  │       • pages 1..N reuse same session + PSI             │
//  └─────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────

import { Request, Response } from "express";
import { GMAPS } from "./constants";
import {
  createTlsSession,
  delay,
  extractPsi,
  fetchPage,
  generateQueries,
  parsePlaces,
  pickBrowserProfile,
} from "./helpers";
import type { GMAPS_INTERNAL_RESPONSE } from "./types";
import { destroyTLS, initTLS } from "node-tls-client";
import { Lead, LeadSource } from "../../../db/types";
import { ALApiResponse } from "../../types";
import { GMAPS_REQUEST_SCHEMA } from "../schemas";

// ─────────────────────────────────────────────────────────────

// ── Initialize TLS lazily (CJS-safe, avoids top-level await) ──
let tlsInitialized = false;
async function ensureTls() {
  if (tlsInitialized) return;
  await initTLS();
  tlsInitialized = true;
}

export const gmapsInternalHandler = async (req: Request, res: Response) => {
  await ensureTls();
  // ── Validate request ────────────────────────────────────────
  const parsed = GMAPS_REQUEST_SCHEMA.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ success: false, error: "Invalid request body" });
    return;
  }

  if (parsed.data.urls?.length) {
    res.status(400).json({ success: false, error: "URL mode not implemented" });
    return;
  }

  if (!parsed.data.query) {
    res.status(400).json({ success: false, error: "Query is required" });
    return;
  }

  const { query, cities = [], state = "", country = "" } = parsed.data;
  const resolvedHl = GMAPS.DEFAULT_HL;

  const queries = generateQueries(query, cities, state, country);

  if (!queries.length) {
    res.status(400).json({
      success: false,
      error: "No queries generated — provide at least one city",
    });
    return;
  }

  // ── Pick ONE browser profile for this entire handler lifecycle ──
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
  let consecutiveFails = 0;

  // ── City loop ───────────────────────────────────────────────
  for (let qi = 0; qi < queries.length; qi++) {
    const cityQuery = queries[qi];

    if (consecutiveFails >= GMAPS.MAX_CONSECUTIVE_FAILURES) {
      console.warn(
        `[gmaps] Halting — ${GMAPS.MAX_CONSECUTIVE_FAILURES} consecutive failures`,
      );
      break;
    }

    let citySuccess = false;

    // ── Retry loop per city ────────────────────────────────────
    for (
      let attempt = 1;
      attempt <= GMAPS.MAX_RETRIES && !citySuccess;
      attempt++
    ) {
      // Fresh TLS session per city = clean cookie jar, new TLS handshake.
      // Profile (UA + clientIdentifier) stays the same → consistent fingerprint.
      const session = createTlsSession(profile);

      try {
        console.log(
          `[gmaps] [${qi + 1}/${queries.length}] Attempt ${attempt}: "${cityQuery}"`,
        );

        const { psi, lat, lng } = await extractPsi(
          session,
          profile,
          cityQuery,
          resolvedHl,
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

        if (!cityPlaces.length)
          throw new Error("Zero results across all pages");

        allPlaces.push(...cityPlaces);
        citySuccess = true;
        consecutiveFails = 0;
        console.log(`[gmaps] ✓ City done: ${cityPlaces.length} places`);
      } catch (err) {
        console.error(`[gmaps] Attempt ${attempt} failed: ${err}`);

        if (attempt < GMAPS.MAX_RETRIES) {
          const backoff = GMAPS.DELAY_RETRY_BASE * attempt;
          await delay(backoff, backoff + 1_000);
        }
      }
    }

    if (!citySuccess) {
      consecutiveFails++;
      console.warn(`[gmaps] ✗ City failed after ${GMAPS.MAX_RETRIES} attempts`);
    }

    // Inter-city delay (skip after the last query)
    if (qi < queries.length - 1) {
      await delay(GMAPS.DELAY_CITY_MIN, GMAPS.DELAY_CITY_MAX);
    }
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

  const duplicatesRemoved = allPlaces.length - unique.length;
  console.log(
    `[gmaps] Done — ${allPlaces.length} fetched, ${unique.length} unique, ${duplicatesRemoved} dupes removed`,
  );

  const response: ALApiResponse<GMAPS_INTERNAL_RESPONSE[]> = {
    success: true,
    data: unique,
  };

  res.status(200).json(response);
};

// ── Cleanup ───────────────────────────────────────────────────
process.on("SIGTERM", async () => {
  await destroyTLS();
  process.exit(0);
});
process.on("SIGINT", async () => {
  await destroyTLS();
  process.exit(0);
});

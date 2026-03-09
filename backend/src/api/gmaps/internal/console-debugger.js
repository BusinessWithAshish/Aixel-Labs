/**
 * ============================================================
 *  GOOGLE MAPS FIELD INSPECTOR v2
 *
 *  HOW TO USE:
 *  1. Open incognito tab → go to https://www.google.com/maps
 *  2. Open DevTools → Console
 *  3. Paste entire script → hit Enter
 *
 *  TO SHARE WITH AI FOR HELP:
 *  Copy-paste the console output and say:
 *  "Here is my gmaps-inspector output, help me update my constants"
 *
 *  LAST VERIFIED: March 2026
 * ============================================================
 */

(async () => {
  // ─── CHANGE THESE ───────────────────────────────────────────
  const CONFIG = {
    TEST_QUERY: "cake shops near me", // ← your search query
    TEST_PAGE: 1, // ← which page to test
    ZOOM: 14, // ← zoom level
    COUNTRY: "in", // ← gl param
    LANGUAGE: "en", // ← hl param
  };

  // ─── KNOWN FIELDS ───────────────────────────────────────────
  // These are the fields your backend currently uses.
  // The script verifies each one is still at the right path.
  //
  // expect values:
  //   "string"  → typeof string
  //   "number"  → typeof number
  //   "array"   → Array.isArray
  //   "ChIJ"    → string starting with "ChIJ" (Place ID)
  //   "http"    → string starting with "http" (URL)
  //   "latnum"  → number between -90 and 90
  //   "lngnum"  → number between -180 and 180
  //
  // TO ADD A NEW FIELD: add an entry below with path + expect.
  const KNOWN_FIELDS = {
    name: { path: [11], label: "Name", expect: "string" },
    nameLocal: { path: [101], label: "Local Name", expect: "string" },
    placeId: { path: [78], label: "Place ID", expect: "ChIJ" },
    fullAddress: { path: [18], label: "Full Address", expect: "string" },
    altAddress: { path: [39], label: "Alt Address", expect: "string" },
    lat: { path: [9, 2], label: "Latitude", expect: "latnum" },
    lng: { path: [9, 3], label: "Longitude", expect: "lngnum" },
    phone: { path: [178, 0, 0], label: "Phone", expect: "string" },
    website: { path: [7, 0], label: "Website", expect: "http" },
    categories: { path: [13], label: "Categories", expect: "array" },
    rating: { path: [4, 7], label: "Rating", expect: "number" },
    reviewCount: { path: [4, 8], label: "Review Count", expect: "number" },
    reviewsText: { path: [4, 3, 1], label: "Reviews Text", expect: "string" },
  };

  // ────────────────────────────────────────────────────────────
  //  INTERNALS — no need to change anything below this line
  // ────────────────────────────────────────────────────────────

  const EARTH_R = 6371010;
  const TILE_SIZE = 256;
  const SCREEN_W = 1024;
  const SCREEN_H = 768;

  // ─── Logging helpers ────────────────────────────────────────
  const C = {
    header:
      "background:#1a73e8;color:#fff;padding:3px 10px;border-radius:4px;font-weight:bold;font-size:13px",
    section: "color:#1a73e8;font-weight:bold;font-size:12px",
    ok: "color:#188038;font-weight:bold",
    fail: "color:#d93025;font-weight:bold",
    warn: "color:#e37400;font-weight:bold",
    info: "color:#5f6368;font-size:11px",
    found:
      "background:#e6f4ea;color:#137333;padding:1px 6px;border-radius:3px;font-size:11px",
    field: "color:#7b1fa2;font-weight:bold;font-size:11px",
    mono: "font-family:monospace;font-size:11px",
  };

  const log = (m, s = C.info) => console.log(`%c${m}`, s);
  const ok = (m) => console.log(`%c  ✅  ${m}`, C.ok);
  const fail = (m) => console.log(`%c  ❌  ${m}`, C.fail);
  const warn = (m) => console.log(`%c  ⚠️   ${m}`, C.warn);
  const info = (m) => console.log(`%c      ${m}`, C.info);
  const sep = () => console.log(`%c${"─".repeat(64)}`, C.info);
  const header = (m) => {
    sep();
    console.log(`%c ${m} `, C.header);
    sep();
  };

  // ─── Utilities ──────────────────────────────────────────────

  const get = (obj, path) => {
    let cur = obj;
    for (const k of path) {
      if (cur == null) return undefined;
      cur = cur[k];
    }
    return cur;
  };

  const typeOk = (val, expect) => {
    if (expect === "string") return typeof val === "string";
    if (expect === "number") return typeof val === "number";
    if (expect === "array") return Array.isArray(val);
    if (expect === "ChIJ")
      return typeof val === "string" && val.startsWith("ChIJ");
    if (expect === "http")
      return typeof val === "string" && val.startsWith("http");
    if (expect === "latnum")
      return typeof val === "number" && val >= -90 && val <= 90;
    if (expect === "lngnum")
      return typeof val === "number" && val >= -180 && val <= 180;
    return true;
  };

  const fmt = (val) => {
    if (val === null || val === undefined) return "null";
    const s = JSON.stringify(val);
    return s.length > 90 ? s.substring(0, 90) + "…" : s;
  };

  const altitudeCalc = (zoom, lat) => {
    const R = 27.3611 * EARTH_R * SCREEN_H;
    return (R * Math.cos((lat * Math.PI) / 180)) / (2 ** zoom * TILE_SIZE);
  };

  const buildPb = (lat, lng, zoom, page, psi) => {
    const alt = altitudeCalc(zoom, lat);
    const offset = (page - 1) * 20;
    return (
      `!4m8!1m3!1d${alt}!2d${lng}!3d${lat}` +
      `!3m2!1i${SCREEN_W}!2i${SCREEN_H}!4f13.1!7i20!8i${offset}` +
      `!10b1!12m25!1m1!18b1!2m3!5m1!6e2!20e3` +
      `!6m16!4b1!23b1!26i1!27i1!41i2!45b1!49b1!63m0!67b1!73m0` +
      `!74i150000!75b1!89b1!105b1!109b1!110m0` +
      `!10b1!16b1!19m4!2m3!1i360!2i120!4i8` +
      `!22m3!1s${psi}!2z!7e81` +
      `!24m5!1m4!13m2!2b1!3b1!2b1!5b1`
    );
  };

  // ─── STEP 1: Get PSI ────────────────────────────────────────
  header("STEP 1 — PSI Extraction");

  let psi = null,
    lat = 0,
    lng = 0;

  // Try reading from live page state if already on Maps results
  try {
    if (typeof APP_INITIALIZATION_STATE !== "undefined") {
      const ug = APP_INITIALIZATION_STATE[0]?.ug;
      if (ug?.[0]?.[2] && ug?.[0]?.[1]) {
        lat = ug[0][2];
        lng = ug[0][1];
        psi = APP_INITIALIZATION_STATE[13]?.ug?.[3];
        if (psi) ok(`PSI from live APP_INITIALIZATION_STATE`);
      }
    }
  } catch (_) {}

  // Fallback: fetch a fresh Maps page
  if (!psi) {
    warn("Not on a Maps results page — fetching fresh page...");
    const slug = CONFIG.TEST_QUERY.toLowerCase().replace(/\s+/g, "+");
    const freshUrl = `https://www.google.com/maps/search/${slug}?hl=${CONFIG.LANGUAGE}&gl=${CONFIG.COUNTRY}`;
    const r = await fetch(freshUrl, {
      credentials: "include",
      headers: { Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
    });
    const html = await r.text();

    if (html.includes("unusual traffic")) {
      fail(
        "BLOCKED — Google detected unusual traffic. Wait a few minutes and retry.",
      );
      return;
    }
    if (html.length < 10000) {
      fail(
        `Response too short (${html.length} chars) — likely blocked or redirected.`,
      );
      return;
    }

    // Strategy 1: psi= inside embedded pagination URLs (most stable pattern)
    psi = html.match(/[?&]psi=([A-Za-z0-9_-]{20,60})\./)?.[1];
    if (psi) ok(`PSI via strategy 1 — embedded URL pattern`);

    // Strategy 2: APP_INITIALIZATION_STATE in raw HTML
    if (!psi) {
      psi = html.match(
        /APP_INITIALIZATION_STATE[^;]{0,500}?"([A-Za-z0-9_-]{40,60})"/,
      )?.[1];
      if (psi) ok(`PSI via strategy 2 — APP_INITIALIZATION_STATE in HTML`);
    }

    // Strategy 3: broad base64url scan with quality filters
    if (!psi) {
      psi =
        [...html.matchAll(/"([A-Za-z0-9_-]{40,55})"/g)]
          .map((m) => m[1])
          .filter(
            (s) =>
              !/^0ahUKEw/.test(s) &&
              /[A-Z]/.test(s) &&
              /[a-z]/.test(s) &&
              /[0-9_-]/.test(s),
          )[0] ?? null;
      if (psi) warn(`PSI via strategy 3 — broad scan (less reliable)`);
    }

    // Extract coords from @lat,lng,zoom
    const cm = html.match(/@(-?\d+\.\d+),(-?\d+\.\d+),(\d+)z/);
    if (cm) {
      lat = parseFloat(cm[1]);
      lng = parseFloat(cm[2]);
    }

    // Extract coords from protobuf !2d!3d pattern
    if (!lat || !lng) {
      const pm = html.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
      if (pm) {
        lng = parseFloat(pm[1]);
        lat = parseFloat(pm[2]);
      }
    }
  }

  // Last resort: read coords from current browser URL
  if (!lat || !lng) {
    const um = location.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (um) {
      lat = parseFloat(um[1]);
      lng = parseFloat(um[2]);
    }
  }

  if (!psi) {
    fail("All PSI strategies failed. Make sure you are on google.com/maps.");
    return;
  }

  if (!lat || !lng) {
    warn("No coordinates found — using Pune fallback (18.5355665, 73.8308849)");
    lat = 18.5355665;
    lng = 73.8308849;
  }

  info(`PSI   : ${psi}`);
  info(`Coords: lat=${lat}, lng=${lng}`);

  // ─── STEP 2: Fetch & Parse Results ──────────────────────────
  header("STEP 2 — Fetching Results");
  info(`Query : "${CONFIG.TEST_QUERY}"`);
  info(`Page  : ${CONFIG.TEST_PAGE}  |  Zoom: ${CONFIG.ZOOM}`);

  const pb = buildPb(lat, lng, CONFIG.ZOOM, CONFIG.TEST_PAGE, psi);
  const url =
    `https://www.google.com/search?tbm=map` +
    `&hl=${CONFIG.LANGUAGE}&gl=${CONFIG.COUNTRY}` +
    `&pb=${pb}` +
    `&q=${encodeURIComponent(CONFIG.TEST_QUERY)}` +
    `&tch=1&ech=${CONFIG.TEST_PAGE}` +
    `&psi=${psi}.${Date.now()}.1`;

  const resp = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.google.com/maps",
    },
  });

  if (!resp.ok) {
    fail(`HTTP ${resp.status} — request failed`);
    return;
  }

  let raw = (await resp.text())
    .replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, "")
    .trim();

  let data;
  try {
    if (raw.startsWith("{")) {
      const w = JSON.parse(raw);
      data = JSON.parse(w.d.replace(/^\)\]\}'\s*\n?/, ""));
    } else {
      data = JSON.parse(raw.replace(/^[^\[]+/, ""));
    }
  } catch (e) {
    fail(`Failed to parse response: ${e.message}`);
    info("Raw first 300: " + raw.substring(0, 300));
    return;
  }

  const resultsBlock = data?.[0]?.[1];
  if (!Array.isArray(resultsBlock)) {
    fail("data[0][1] is not an array — top-level structure may have changed");
    info("data[0] sample: " + JSON.stringify(data?.[0])?.substring(0, 200));
    return;
  }

  const allPlaces = resultsBlock
    .slice(1)
    .filter((item) => Array.isArray(item) && item[14]);
  const placeData = allPlaces.map((item) => item[14]);

  ok(`Response OK — ${placeData.length} places on this page`);

  // ─── STEP 3: Verify Known Fields ────────────────────────────
  header("STEP 3 — Known Field Verification");
  info(`Checking each field across all ${placeData.length} places.`);
  info(`A field is only flagged MISSING if absent in every single place.\n`);

  const tally = {};
  for (const key of Object.keys(KNOWN_FIELDS)) {
    tally[key] = { found: 0, absent: 0, wrongType: 0, samples: [] };
  }

  for (const p of placeData) {
    for (const [key, def] of Object.entries(KNOWN_FIELDS)) {
      const val = get(p, def.path);
      if (val !== null && val !== undefined) {
        tally[key].found++;
        if (tally[key].samples.length < 3) tally[key].samples.push(val);
        if (!typeOk(val, def.expect)) tally[key].wrongType++;
      } else {
        tally[key].absent++;
      }
    }
  }

  let anyBroken = false;

  for (const [key, def] of Object.entries(KNOWN_FIELDS)) {
    const t = tally[key];
    const pathStr = `p[${def.path.join("][")}]`;
    const label = def.label.padEnd(14);
    const path = pathStr.padEnd(22);
    const sample = t.samples[0];
    const sampleS = Array.isArray(sample)
      ? `Array(${sample.length}) ${JSON.stringify(sample).substring(0, 40)}…`
      : fmt(sample);

    if (t.found === 0) {
      // Truly broken = absent in 100% of places
      fail(
        `${label} ${path} → NOT FOUND in any of ${placeData.length} places — PATH CHANGED`,
      );
      anyBroken = true;
    } else if (t.wrongType > 0) {
      warn(
        `${label} ${path} → TYPE MISMATCH ${t.wrongType}/${t.found} places — expected ${def.expect} | sample: ${sampleS}`,
      );
      anyBroken = true;
    } else if (t.found < placeData.length) {
      // Present in some places — optional field, not broken
      ok(
        `${label} ${path} → ${sampleS}   (${t.found}/${placeData.length} — optional field)`,
      );
    } else {
      ok(`${label} ${path} → ${sampleS}   (${t.found}/${placeData.length})`);
    }
  }

  // ─── STEP 4: Find Ratings ────────────────────────────────────
  header("STEP 4 — Rating & Review Field Discovery");
  info("Scanning for floats 1.0–5.0 (ratings) and integers (review counts)");
  info("across p[4], p[5], p[51], p[52], p[53] in all places...\n");

  const ratingHits = {};
  const reviewHits = {};

  for (const p of placeData) {
    const scan = (obj, path) => {
      if (obj === null || obj === undefined) return;

      // Rating: float between 1.0 and 5.0, not a whole number
      if (
        typeof obj === "number" &&
        !Number.isInteger(obj) &&
        obj >= 1.0 &&
        obj <= 5.0
      ) {
        ratingHits[path] = ratingHits[path] || [];
        ratingHits[path].push(obj);
      }

      // Review count: positive integer under 2M, not 1 (flags use 1)
      if (Number.isInteger(obj) && obj > 1 && obj < 2_000_000) {
        reviewHits[path] = reviewHits[path] || [];
        reviewHits[path].push(obj);
      }

      if (Array.isArray(obj)) {
        obj.forEach((v, i) => scan(v, `${path}[${i}]`));
      }
    };

    // Only scan known rating containers — keeps output clean
    [4, 5, 51, 52, 53].forEach((idx) => scan(p[idx], `p[${idx}]`));
  }

  // Rating paths that appear consistently (2+ places)
  const stableRatings = Object.entries(ratingHits)
    .filter(([, v]) => v.length >= 2)
    .sort(([, a], [, b]) => b.length - a.length);

  log("⭐  Rating candidates (float 1.0–5.0, in 2+ places):");
  if (stableRatings.length) {
    stableRatings.forEach(([path, vals]) => {
      console.log(
        `%c     ${path.padEnd(28)} → [${vals.slice(0, 6).join(", ")}]`,
        C.found,
      );
    });
  } else {
    warn(
      "No stable rating found. Try Step 6 raw dump to inspect p[4] manually.",
    );
  }

  // Review count paths that appear in 2+ places with plausible values
  const stableReviews = Object.entries(reviewHits)
    .filter(([, v]) => v.length >= 2 && v.some((n) => n > 3))
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, 6);

  log("\n📊  Review count candidates (integer, in 2+ places):");
  if (stableReviews.length) {
    stableReviews.forEach(([path, vals]) => {
      console.log(
        `%c     ${path.padEnd(28)} → [${vals.slice(0, 6).join(", ")}]`,
        C.found,
      );
    });
  } else {
    warn("No stable review count found in scanned indices.");
  }

  // ─── STEP 5: Unknown Top-Level Fields ───────────────────────
  header("STEP 5 — Unknown Top-Level Fields");
  info("Top-level p[N] indices present in the response that are NOT in");
  info("your KNOWN_FIELDS. These may be new or unused data.\n");

  const knownTopLevel = new Set(
    Object.values(KNOWN_FIELDS).map((f) => f.path[0]),
  );

  const p0 = placeData[0];
  if (p0) {
    let foundNew = false;
    p0.forEach((val, i) => {
      if (val === null || val === undefined) return;
      if (knownTopLevel.has(i)) return;
      foundNew = true;
      console.log(
        `%c  p[${String(i).padEnd(4)}]  %c${fmt(val)}`,
        C.field,
        C.mono,
      );
    });
    if (!foundNew) ok("No unknown top-level fields — response schema is clean");
  }

  // ─── STEP 6: Raw Dump ───────────────────────────────────────
  header("STEP 6 — Full Raw Dump (first place)");
  info("All non-null fields from the first place result.");
  info("Click the group below to expand.\n");

  if (p0) {
    const name = p0[11] ?? "first place";
    console.groupCollapsed(`%c  ▶ p[14] of "${name}"`, C.section);
    p0.forEach((val, i) => {
      if (val === null || val === undefined) return;
      console.log(`%c[${String(i).padEnd(4)}]  %c${fmt(val)}`, C.field, C.mono);
    });
    console.groupEnd();
  }

  // ─── FINAL SUMMARY ──────────────────────────────────────────
  header("SUMMARY");

  if (!anyBroken) {
    ok("All known field paths are VALID ✓");
    info("No changes needed in constants.ts");
  } else {
    fail("One or more field paths have changed.");
    info(
      "Look for ❌ lines above — update those paths in GMAPS.FIELDS constants.ts",
    );
  }

  if (stableRatings.length) {
    const best = stableRatings[0];
    ok(`Rating   → ${best[0]}  (values: ${best[1].slice(0, 4).join(", ")})`);
  } else {
    warn("Rating field not found — check Step 6 raw dump");
  }

  if (stableReviews.length) {
    const best =
      stableReviews.find(([, v]) => v.some((n) => n > 5)) ?? stableReviews[0];
    ok(`Reviews  → ${best[0]}  (values: ${best[1].slice(0, 4).join(", ")})`);
  } else {
    warn("Review count not found — check Step 6 raw dump");
  }

  sep();
  info("To re-run: change CONFIG.TEST_QUERY at the top and paste again.");
  info("To get AI help: copy this entire console output and share it.");
  sep();
})();

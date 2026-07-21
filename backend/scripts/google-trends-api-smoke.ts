// Smoke test: exercise the `fetchGoogleTrendsTrending` API helper end-to-end across
// diverse geos, languages, time windows, categories, and post-processing options.
//
// Run: pnpm exec tsx scripts/google-trends-api-smoke.ts
//
// Each fixture is a representative request; the test asserts that:
//   - the response echoes the requested geo / hl / hours / category / sort / status
//   - `trends` is non-empty (unless `expectEmpty` is set)
//   - every trend has a non-empty `title` and a 2-letter `geo`
//   - `totalParsed >= totalResults` (filters only ever shrink the set)
//   - `totalResults <= limit`
//   - the `raw` payload is valid JSON that re-parses to the same entry count
//   - category / status / sort filters behave as documented
//
// Network-dependent: requires direct or Evomi-proxied access to trends.google.com.
import "dotenv/config";
import {
  fetchGoogleTrendsTrending,
  GOOGLE_TRENDS_CATEGORY,
  GOOGLE_TRENDS_SORT,
  GOOGLE_TRENDS_STATUS,
} from "../src/api/google-trends";
import type { GOOGLE_TRENDS_REQUEST, GOOGLE_TRENDS_TREND } from "../src/api/google-trends";

type Fixture = {
  name: string;
  request: GOOGLE_TRENDS_REQUEST;
  description: string;
  /** Minimum expected trend count (loose lower bound). */
  minTrends?: number;
  /** When true, expect zero trends after filtering. */
  expectEmpty?: boolean;
  /** When set, assert every returned trend has this category in `categories`. */
  assertCategory?: number;
  /** When set, assert every returned trend matches this status shape. */
  assertStatus?: "trending" | "started";
};

const FIXTURES: Fixture[] = [
  {
    name: "US-24h-default",
    request: { geo: "US", hl: "en", hours: 24 },
    description: "US, English, past 24h — default window, no filters",
    minTrends: 50,
  },
  {
    name: "US-48h",
    request: { geo: "US", hl: "en", hours: 48 },
    description: "US, past 48h — larger window, more entries",
    minTrends: 100,
  },
  {
    name: "US-7d",
    request: { geo: "US", hl: "en", hours: 168, limit: 50 },
    description: "US, past 7 days — biggest window, capped at 50",
    minTrends: 40,
  },
  {
    name: "IN-24h-hi",
    request: { geo: "IN", hl: "hi", hours: 24 },
    description: "India, Hindi — non-English locale",
    minTrends: 20,
  },
  {
    name: "GB-4h",
    request: { geo: "GB", hl: "en", hours: 4 },
    description: "UK, past 4 hours — smallest window",
    minTrends: 1,
  },
  {
    name: "JP-24h-ja",
    request: { geo: "JP", hl: "ja", hours: 24 },
    description: "Japan, Japanese — non-latin locale",
    minTrends: 20,
  },
  {
    name: "US-24h-sports",
    request: {
      geo: "US",
      hl: "en",
      hours: 24,
      category: GOOGLE_TRENDS_CATEGORY.SPORTS,
    },
    description: "US, Sports category filter (id=17)",
    minTrends: 1,
    assertCategory: GOOGLE_TRENDS_CATEGORY.SPORTS,
  },
  {
    name: "US-48h-trending-only",
    request: {
      geo: "US",
      hl: "en",
      hours: 48,
      status: GOOGLE_TRENDS_STATUS.TRENDING,
    },
    description: "US, only still-trending entries (endedAt === null)",
    minTrends: 1,
    assertStatus: "trending",
  },
  {
    name: "US-48h-started-only",
    request: {
      geo: "US",
      hl: "en",
      hours: 48,
      status: GOOGLE_TRENDS_STATUS.STARTED,
    },
    description: "US, only already-peaked entries (endedAt !== null)",
    minTrends: 1,
    assertStatus: "started",
  },
  {
    name: "US-24h-sort-volume",
    request: {
      geo: "US",
      hl: "en",
      hours: 24,
      sort: GOOGLE_TRENDS_SORT.VOLUME,
      limit: 20,
    },
    description: "US, sort by search volume desc — first entry should have max volume",
    minTrends: 10,
  },
  {
    name: "US-24h-jobs-education",
    request: {
      geo: "US",
      hl: "en",
      hours: 24,
      category: GOOGLE_TRENDS_CATEGORY.JOBS_AND_EDUCATION,
    },
    description: "US, Jobs & Education category — often empty, allowed to be 0",
    expectEmpty: true,
    assertCategory: GOOGLE_TRENDS_CATEGORY.JOBS_AND_EDUCATION,
  },
];

type Result = {
  fixture: Fixture;
  ok: boolean;
  trendCount: number;
  totalParsed: number;
  geoName: string | null;
  firstTitle?: string;
  failures: string[];
  error?: string;
};

function checkTrend(t: GOOGLE_TRENDS_TREND, fixture: Fixture, failures: string[]) {
  if (!t.title) failures.push("trend had empty title");
  if (!t.geo || t.geo.length !== 2) {
    failures.push(`trend geo was not a 2-letter code: ${JSON.stringify(t.geo)}`);
  }
  if (!Array.isArray(t.relatedQueries)) {
    failures.push("trend relatedQueries was not an array");
  }
  if (!Array.isArray(t.categories)) {
    failures.push("trend categories was not an array");
  }
  if (!Array.isArray(t.articles)) {
    failures.push("trend articles was not an array");
  }
  if (fixture.assertCategory !== undefined && !t.categories.includes(fixture.assertCategory)) {
    failures.push(
      `trend "${t.title}" missing asserted category ${fixture.assertCategory} (has [${t.categories.join(", ")}])`,
    );
  }
  if (fixture.assertStatus === "trending" && t.endedAt !== null) {
    failures.push(`trend "${t.title}" expected still-trending but endedAt=${t.endedAt}`);
  }
  if (fixture.assertStatus === "started" && t.endedAt === null) {
    failures.push(`trend "${t.title}" expected already-peaked but endedAt is null`);
  }
}

async function runFixture(fixture: Fixture): Promise<Result> {
  const failures: string[] = [];
  try {
    const result = await fetchGoogleTrendsTrending(fixture.request);

    if (result.geo !== fixture.request.geo) {
      failures.push(`expected geo echo "${fixture.request.geo}", got "${result.geo}"`);
    }
    if (result.hl !== fixture.request.hl) {
      failures.push(`expected hl echo "${fixture.request.hl}", got "${result.hl}"`);
    }
    if (result.hours !== fixture.request.hours) {
      failures.push(`expected hours echo ${fixture.request.hours}, got ${result.hours}`);
    }
    if (result.category !== (fixture.request.category ?? 0)) {
      failures.push(
        `expected category echo ${fixture.request.category ?? 0}, got ${result.category}`,
      );
    }
    if (result.sort !== (fixture.request.sort ?? "relevance")) {
      failures.push(
        `expected sort echo "${fixture.request.sort ?? "relevance"}", got "${result.sort}"`,
      );
    }
    if (result.status !== (fixture.request.status ?? "all")) {
      failures.push(
        `expected status echo "${fixture.request.status ?? "all"}", got "${result.status}"`,
      );
    }

    if (result.totalParsed < result.totalResults) {
      failures.push(
        `totalParsed (${result.totalParsed}) < totalResults (${result.totalResults}) — filters should only shrink`,
      );
    }

    const limit = fixture.request.limit ?? 500;
    if (result.trends.length > limit) {
      failures.push(
        `returned ${result.trends.length} trends but limit was ${limit}`,
      );
    }
    if (result.totalResults !== result.trends.length) {
      failures.push(
        `totalResults (${result.totalResults}) !== trends.length (${result.trends.length})`,
      );
    }

    if (fixture.expectEmpty) {
      if (result.trends.length !== 0) {
        failures.push(`expected 0 trends, got ${result.trends.length}`);
      }
    } else {
      if (result.trends.length === 0) {
        failures.push("expected at least one trend");
      }
      if (fixture.minTrends && result.trends.length < fixture.minTrends) {
        failures.push(
          `expected at least ${fixture.minTrends} trends, got ${result.trends.length}`,
        );
      }
    }

    for (const t of result.trends) checkTrend(t, fixture, failures);

    // Raw must be valid JSON and re-parse to the same totalParsed count.
    let reparsedCount: number | null = null;
    try {
      const reparsed = JSON.parse(result.raw) as [null, unknown[]];
      reparsedCount = Array.isArray(reparsed[1]) ? reparsed[1].length : null;
    } catch (e) {
      failures.push(`raw ds:0 was not valid JSON: ${(e as Error).message}`);
    }
    if (reparsedCount !== null && reparsedCount !== result.totalParsed) {
      failures.push(
        `raw re-parsed count (${reparsedCount}) !== totalParsed (${result.totalParsed})`,
      );
    }

    // Sort-by-volume sanity check: first entry should have the max volume.
    if (fixture.request.sort === GOOGLE_TRENDS_SORT.VOLUME && result.trends.length > 1) {
      const max = result.trends.reduce(
        (m, t) => Math.max(m, t.volume ?? 0),
        0,
      );
      const firstVol = result.trends[0].volume ?? 0;
      if (firstVol < max) {
        failures.push(
          `sort=volume but first entry volume (${firstVol}) < max (${max})`,
        );
      }
    }

    return {
      fixture,
      ok: failures.length === 0,
      trendCount: result.trends.length,
      totalParsed: result.totalParsed,
      geoName: result.geoName,
      firstTitle: result.trends[0]?.title.slice(0, 80),
      failures,
    };
  } catch (err) {
    return {
      fixture,
      ok: false,
      trendCount: 0,
      totalParsed: 0,
      geoName: null,
      failures: ["threw: " + (err instanceof Error ? err.message : String(err))],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  console.log(`[smoke] running ${FIXTURES.length} fixtures\n`);

  const results: Result[] = [];
  for (const fixture of FIXTURES) {
    const label = `${fixture.name}`;
    process.stdout.write(`[smoke] ${label} — ${fixture.description} ... `);
    const result = await runFixture(fixture);
    console.log(result.ok ? "PASS" : "FAIL");
    results.push(result);
  }

  console.log("\n[smoke] summary:");
  for (const r of results) {
    const status = r.ok ? "PASS" : "FAIL";
    console.log(
      `  ${status}  ${r.fixture.name}  trends=${r.trendCount}  parsed=${r.totalParsed}  geoName=${JSON.stringify(r.geoName)}`,
    );
    if (r.firstTitle) {
      console.log(`        first: ${r.firstTitle}`);
    }
    if (r.failures.length) {
      for (const f of r.failures) console.log(`        ✗ ${f}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`\n[smoke] ${failed.length}/${results.length} fixtures FAILED`);
    process.exit(1);
  }
  console.log(`\n[smoke] all ${results.length} fixtures PASS`);
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err);
  process.exit(1);
});

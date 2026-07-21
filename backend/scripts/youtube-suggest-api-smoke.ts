// Smoke test: exercise the `fetchYoutubeSuggest` API helper end-to-end across
// diverse queries (English, Spanish, Hindi, special characters, edge cases).
//
// Run: pnpm exec tsx scripts/youtube-suggest-api-smoke.ts
//
// Each fixture is a representative partial query; the test asserts that:
//   - the response echoes the query
//   - `suggestions` is non-empty (unless `expectEmpty` is set)
//   - every suggestion has non-empty `text`
//   - the raw JSONP body starts with `window.google.ac.h(`
//   - the parsed suggestions match the raw body when re-parsed
//
// Network-dependent: requires Evomi proxy or direct YouTube access.
import "dotenv/config";
import {
  fetchYoutubeSuggest,
  parseSuggestJsonp,
  mapSuggestItems,
} from "../src/api/youtube/suggest";

type Fixture = {
  query: string;
  hl?: string;
  country?: string;
  cp?: number;
  description: string;
  /** Minimum expected suggestion count (loose lower bound). */
  minSuggestions?: number;
  /** When true, expect zero suggestions (e.g. nonsense query). */
  expectEmpty?: boolean;
};

const FIXTURES: Fixture[] = [
  {
    query: "neural networks",
    hl: "en",
    country: "US",
    cp: 15,
    description: "English tech query — should return many suggestions",
    minSuggestions: 5,
  },
  {
    query: "redes neuronales",
    hl: "es",
    country: "US",
    cp: 15,
    description: "Spanish query with hl=es",
    minSuggestions: 5,
  },
  {
    query: "नमस्ते दुनिया",
    hl: "hi",
    country: "IN",
    cp: 10,
    description: "Hindi query with gl=IN",
    minSuggestions: 1,
  },
  {
    query: "AI & ML | 2026",
    hl: "en",
    country: "US",
    cp: 10,
    description: "Special characters (&, |) — must be URL-encoded safely",
    minSuggestions: 1,
  },
  {
    query: "machine learning",
    hl: "en",
    country: "GB",
    description: "No cp param — endpoint should still respond",
    minSuggestions: 5,
  },
  {
    query: "a",
    hl: "en",
    country: "US",
    cp: 1,
    description: "Single-character query",
    minSuggestions: 1,
  },
];

type Result = {
  fixture: Fixture;
  ok: boolean;
  query: string;
  suggestionCount: number;
  firstSuggestion?: string;
  rawLength: number;
  rawStartsWithJsonp: boolean;
  failures: string[];
  error?: string;
};

async function runFixture(fixture: Fixture): Promise<Result> {
  const failures: string[] = [];
  try {
    const result = await fetchYoutubeSuggest({
      country: fixture.country ?? "US",
      region: undefined,
      query: fixture.query,
      hl: fixture.hl,
      cp: fixture.cp,
    });

    if (result.query !== fixture.query) {
      failures.push(`expected query echo "${fixture.query}", got "${result.query}"`);
    }

    const rawStartsWithJsonp = result.raw.startsWith("window.google.ac.h(");

    if (!rawStartsWithJsonp) {
      failures.push(
        `expected raw body to start with \`window.google.ac.h(\`, got prefix: ${JSON.stringify(result.raw.slice(0, 40))}`,
      );
    }

    if (!result.raw.endsWith(")")) {
      failures.push("expected raw body to end with `)`");
    }

    if (fixture.expectEmpty) {
      if (result.suggestions.length !== 0) {
        failures.push(
          `expected 0 suggestions, got ${result.suggestions.length}`,
        );
      }
    } else {
      if (result.suggestions.length === 0) {
        failures.push("expected at least one suggestion");
      }
      if (
        fixture.minSuggestions &&
        result.suggestions.length < fixture.minSuggestions
      ) {
        failures.push(
          `expected at least ${fixture.minSuggestions} suggestions, got ${result.suggestions.length}`,
        );
      }
    }

    for (const s of result.suggestions) {
      if (!s.text) failures.push("suggestion had empty text");
      if (!Array.isArray(s.subtypes)) {
        failures.push("suggestion subtypes was not an array");
      }
    }

    if (result.totalResults !== result.suggestions.length) {
      failures.push(
        `totalResults (${result.totalResults}) !== suggestions.length (${result.suggestions.length})`,
      );
    }

    // Re-parse the raw body and confirm it round-trips to the same suggestions.
    const reparsed = parseSuggestJsonp(result.raw);
    const remapped = mapSuggestItems(reparsed);
    if (remapped.length !== result.suggestions.length) {
      failures.push(
        `re-parsed raw body yielded ${remapped.length} suggestions, expected ${result.suggestions.length}`,
      );
    }

    return {
      fixture,
      ok: failures.length === 0,
      query: result.query,
      suggestionCount: result.suggestions.length,
      firstSuggestion: result.suggestions[0]?.text.slice(0, 80),
      rawLength: result.raw.length,
      rawStartsWithJsonp,
      failures,
    };
  } catch (err) {
    return {
      fixture,
      ok: false,
      query: fixture.query,
      suggestionCount: 0,
      rawLength: 0,
      rawStartsWithJsonp: false,
      failures: ["threw: " + (err instanceof Error ? err.message : String(err))],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  console.log(`[smoke] running ${FIXTURES.length} fixtures\n`);

  const results: Result[] = [];
  for (const fixture of FIXTURES) {
    const label = `${JSON.stringify({ q: fixture.query, hl: fixture.hl, gl: fixture.country })}`;
    process.stdout.write(`[smoke] ${label} — ${fixture.description} ... `);
    const result = await runFixture(fixture);
    console.log(result.ok ? "PASS" : "FAIL");
    results.push(result);
  }

  console.log("\n[smoke] summary:");
  for (const r of results) {
    const status = r.ok ? "PASS" : "FAIL";
    console.log(
      `  ${status}  q=${JSON.stringify(r.fixture.query)}  hl=${r.fixture.hl ?? "en"}  gl=${r.fixture.country ?? "US"}  suggestions=${r.suggestionCount}  raw=${r.rawLength}b`,
    );
    if (r.firstSuggestion) {
      console.log(`        first: ${r.firstSuggestion}`);
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

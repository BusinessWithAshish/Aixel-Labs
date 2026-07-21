import type {
  GOOGLE_TRENDS_ARTICLE,
  GOOGLE_TRENDS_RAW_DS0,
  GOOGLE_TRENDS_RAW_ENTRY,
  GOOGLE_TRENDS_TREND,
} from "../types";

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
}

function asArticles(value: unknown): GOOGLE_TRENDS_ARTICLE[] {
  if (!Array.isArray(value)) return [];
  const out: GOOGLE_TRENDS_ARTICLE[] = [];
  for (const entry of value) {
    if (!Array.isArray(entry)) continue;
    const [id, language, geo] = entry;
    if (id === undefined || id === null) continue;
    out.push({
      id: String(id),
      language: typeof language === "string" ? language : "",
      geo: typeof geo === "string" ? geo : "",
    });
  }
  return out;
}

/** Maps a single raw `ds:0` entry tuple to a typed `GOOGLE_TRENDS_TREND`. */
export function mapTrendEntry(raw: GOOGLE_TRENDS_RAW_ENTRY): GOOGLE_TRENDS_TREND {
  const startedAt = Array.isArray(raw[3]) ? asNumber(raw[3][0]) : null;
  const endedAt = Array.isArray(raw[4]) ? asNumber(raw[4][0]) : null;
  return {
    title: raw[0] ?? "",
    geo: raw[2] ?? "",
    startedAt,
    endedAt,
    volume: asNumber(raw[6]),
    score: asNumber(raw[8]),
    relatedQueries: asStringArray(raw[9]),
    categories: asNumberArray(raw[10]),
    articles: asArticles(raw[11]),
  };
}

/** Maps the full raw `ds:0` payload to a list of typed trending entries. */
export function mapTrendEntries(raw: GOOGLE_TRENDS_RAW_DS0): GOOGLE_TRENDS_TREND[] {
  const entries = raw[1] ?? [];
  return entries
    .filter((e): e is GOOGLE_TRENDS_RAW_ENTRY => Array.isArray(e))
    .map(mapTrendEntry);
}

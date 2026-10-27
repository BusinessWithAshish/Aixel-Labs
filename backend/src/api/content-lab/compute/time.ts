const UNIT_MS: Record<string, number> = {
  second: 1_000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
};

/**
 * "3 days ago" / "Streamed 2 weeks ago" (YouTube channel tabs) → an approximate ISO date.
 * shortcut: month = 30 days, year = 365 days; exact dates need a get_watch per video.
 */
export function relativeTimeToIso(text: string | null, now: Date = new Date()): string | null {
  const match = text?.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (!match) return null;
  return new Date(now.getTime() - Number(match[1]) * UNIT_MS[match[2]!.toLowerCase()]!).toISOString();
}

import { GMAPS_DETAILS_FIELDS } from "../constants";
import type { GmapsOpeningHoursDay, GmapsOpeningHoursRange } from "../types";
import { asNumber, asString, collectStrings } from "./parse-place";

function mapRange(raw: unknown): GmapsOpeningHoursRange | null {
  if (!Array.isArray(raw)) return null;
  const text = asString(raw[0]);
  const times = Array.isArray(raw[1])
    ? (raw[1] as unknown[]).filter(Array.isArray).map((t) =>
        (t as unknown[]).map((n) => asNumber(n)).filter((n): n is number => n != null),
      )
    : null;
  return { text, times };
}

export function mapOpeningHours(p: unknown[]): GmapsOpeningHoursDay[] | null {
  const block = p[GMAPS_DETAILS_FIELDS.HOURS];
  if (!Array.isArray(block)) return null;

  // Prefer the longest day-list among common slots (full week vs today-only).
  const candidates = [block[0], block[1]].filter(Array.isArray) as unknown[][];
  let best: unknown[] | null = null;
  for (const c of candidates) {
    const days = c.filter(
      (d) =>
        Array.isArray(d) &&
        typeof d[0] === "string" &&
        typeof d[1] === "number" &&
        Array.isArray(d[3]),
    );
    if (!best || days.length > best.length) best = days;
  }
  if (!best?.length) return null;

  const days: GmapsOpeningHoursDay[] = [];
  for (const d of best) {
    if (!Array.isArray(d)) continue;
    if (typeof d[0] !== "string" || typeof d[1] !== "number") continue;
    const rangesRaw = Array.isArray(d[3]) ? d[3] : [];
    const ranges = rangesRaw
      .map(mapRange)
      .filter((r): r is GmapsOpeningHoursRange => r != null);

    const dateArr = Array.isArray(d[2]) ? d[2] : null;
    const date =
      dateArr &&
      typeof dateArr[0] === "number" &&
      typeof dateArr[1] === "number" &&
      typeof dateArr[2] === "number"
        ? ([dateArr[0], dateArr[1], dateArr[2]] as [number, number, number])
        : null;

    days.push({
      day: asString(d[0]),
      dayIndex: asNumber(d[1]),
      date,
      ranges,
    });
  }

  return days.length ? days : null;
}

export function mapOpenStatus(p: unknown[]): string | null {
  const block = p[GMAPS_DETAILS_FIELDS.HOURS];
  const hits = collectStrings(
    block,
    (s) =>
      /^(Open|Closed|Opens|Closes)/i.test(s) ||
      /Closed\s*·/i.test(s) ||
      /Open\s*·/i.test(s),
  );
  return hits[0] ?? null;
}

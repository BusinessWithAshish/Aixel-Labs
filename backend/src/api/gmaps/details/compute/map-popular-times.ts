import { GMAPS_DETAILS_FIELDS } from "../constants";
import type { GmapsPopularTimesDay, GmapsPopularTimesHour } from "../types";
import { asNumber, asString } from "./parse-place";

export function mapPopularTimes(p: unknown[]): GmapsPopularTimesDay[] | null {
  const block = p[GMAPS_DETAILS_FIELDS.POPULAR_TIMES];
  if (!Array.isArray(block) || !Array.isArray(block[0])) return null;

  const days: GmapsPopularTimesDay[] = [];
  for (const day of block[0] as unknown[]) {
    if (!Array.isArray(day)) continue;
    const hoursRaw = Array.isArray(day[1]) ? day[1] : [];
    const hours: GmapsPopularTimesHour[] = [];
    for (const h of hoursRaw) {
      if (!Array.isArray(h)) continue;
      hours.push({
        hour: asNumber(h[0]),
        busyPercent: asNumber(h[1]),
        label: asString(h[2]),
        timeLabel: asString(h[4]),
      });
    }
    days.push({
      dayIndex: asNumber(day[0]),
      hours,
    });
  }

  return days.length ? days : null;
}

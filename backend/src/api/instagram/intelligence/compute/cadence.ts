import { SECONDS_PER_DAY } from "../constants";
import { computeAverage } from "../math";

/** Average gap in days between consecutive posts (by takenAt, Unix
 * seconds) — an upload-cadence signal, Instagram's analogue of YouTube's
 * uploads-per-week. Needs at least 2 dated posts. */
export function computePostingCadenceDays(
  takenAtValues: Array<number | null>,
): number | null {
  const sorted = takenAtValues
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  if (sorted.length < 2) return null;

  const gapsInDays: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gapsInDays.push((sorted[i]! - sorted[i - 1]!) / SECONDS_PER_DAY);
  }

  return computeAverage(gapsInDays);
}

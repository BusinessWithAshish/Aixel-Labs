import { MS_PER_DAY } from "../constants";

/** `takenAt` from the posts feed is Unix seconds, not an ISO string. */
export function computeInstagramPublishedDaysAgo(
  takenAt: number | null,
  harvestedAt: Date = new Date(),
): number | null {
  if (takenAt === null) return null;
  const diffMs = harvestedAt.getTime() - takenAt * 1000;
  if (diffMs < 0) return 0;
  return diffMs / MS_PER_DAY;
}

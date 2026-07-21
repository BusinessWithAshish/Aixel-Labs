import type { GOOGLE_TRENDS_INTEREST_POINT } from "../../interest/types";

/**
 * Detects crossover points between pairs of query lines in a comparison set.
 *
 * A crossover happens at index `i` when query A was below query B at `i-1`
 * and is above (or equal) at `i` — i.e. their relative order flipped. We report
 * the first crossover per (rising, falling) pair to avoid noise.
 */
export function detectCrossovers(
  points: GOOGLE_TRENDS_INTEREST_POINT[],
  keywords: string[],
): {
  risingKeywordIndex: number;
  fallingKeywordIndex: number;
  approximateTime: number;
  description: string;
}[] {
  const crossovers: {
    risingKeywordIndex: number;
    fallingKeywordIndex: number;
    approximateTime: number;
    description: string;
  }[] = [];

  if (keywords.length < 2 || points.length < 2) return crossovers;

  const seenPairs = new Set<string>();

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!prev || !curr) continue;

    for (let a = 0; a < keywords.length; a++) {
      for (let b = a + 1; b < keywords.length; b++) {
        const prevA = prev.values[a] ?? 0;
        const prevB = prev.values[b] ?? 0;
        const currA = curr.values[a] ?? 0;
        const currB = curr.values[b] ?? 0;

        const pairKey = `${a}-${b}`;
        if (seenPairs.has(pairKey)) continue;

        // A was below B, now A is above B → A crossed above B.
        if (prevA < prevB && currA >= currB) {
          seenPairs.add(pairKey);
          crossovers.push({
            risingKeywordIndex: a,
            fallingKeywordIndex: b,
            approximateTime: curr.time,
            description: `"${keywords[a]}" crossed above "${keywords[b]}" around ${curr.formattedTime || new Date(curr.time * 1000).toISOString()}`,
          });
        } else if (prevB < prevA && currB >= currA) {
          seenPairs.add(pairKey);
          crossovers.push({
            risingKeywordIndex: b,
            fallingKeywordIndex: a,
            approximateTime: curr.time,
            description: `"${keywords[b]}" crossed above "${keywords[a]}" around ${curr.formattedTime || new Date(curr.time * 1000).toISOString()}`,
          });
        }
      }
    }
  }

  return crossovers;
}

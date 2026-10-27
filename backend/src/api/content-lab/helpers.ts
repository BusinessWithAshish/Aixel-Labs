import {
  computeReasons,
  computeTextSignals,
  scorePost,
  type ContentLabFormatFamily,
} from "./compute";
import type {
  CONTENT_LAB_CREATOR,
  CONTENT_LAB_POST,
  ContentLabFormat,
  ContentLabPlatform,
} from "./types";

export type ContentLabPostInput = {
  platform: ContentLabPlatform;
  nativeId: string;
  format: ContentLabFormat;
  url: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  durationSeconds: number | null;
  creator: CONTENT_LAB_CREATOR;
};

export type ContentLabBaselines = Record<ContentLabFormatFamily, number | null>;

/** Raw post fields + the creator's baselines → a CONTENT_LAB_POST with multiple, signals and reasons. */
export function buildContentLabPost(
  input: ContentLabPostInput,
  baselines: ContentLabBaselines,
): CONTENT_LAB_POST {
  const { nativeId, ...rest } = input;
  const signals = computeTextSignals(input.title);
  const { usualViews, multiple } = scorePost(input, baselines);
  return {
    id: `${input.platform}:${nativeId}`,
    ...rest,
    usualViews,
    multiple,
    reasons: computeReasons({ ...input, multiple, signals }),
    signals,
  };
}

/** Newest first; posts without a date keep their place at the end. */
export function sortNewestFirst<T extends { publishedAt: string | null }>(posts: T[]): T[] {
  // Dates arrive with mixed offsets ("…-07:00" from get_watch, "…Z" estimates), so compare instants.
  const time = (p: T) => (p.publishedAt ? Date.parse(p.publishedAt) || 0 : 0);
  return [...posts].sort((a, b) => time(b) - time(a));
}

/**
 * The promise's value, or null once `deadline` (epoch ms) passes. The work
 * itself is not cancelled; its late result is just dropped.
 */
export function beforeDeadline<T>(promise: Promise<T>, deadline: number): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), Math.max(0, deadline - Date.now()));
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Alternates items by key (e.g. posts and reels) so a cap on the front of the list takes some of each. */
export function interleaveBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  const lists = [...groups.values()];
  const out: T[] = [];
  for (let i = 0; out.length < items.length; i++) {
    for (const list of lists) if (list[i] !== undefined) out.push(list[i]!);
  }
  return out;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

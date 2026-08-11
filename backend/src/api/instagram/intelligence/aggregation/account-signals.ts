import type { z } from "zod";
import { computeOutlierThreshold, computePostingCadenceDays } from "../compute";
import { INSTAGRAM_MIN_POSTS_FOR_OUTLIER_DETECTION } from "../constants";
import { computeAverage, computePercentiles, extractNonNullValues } from "../math";
import type { INSTAGRAM_POST_ITEM_INTELLIGENCE } from "../account/types";
import type { AGGREGATE_ACCOUNT_SIGNALS_SCHEMA } from "./schemas";
import type {
  INSTAGRAM_ACCOUNT_SIGNALS_RESPONSE,
  INSTAGRAM_MEDIA_TYPE_DISTRIBUTION,
} from "./types";

export type AggregateAccountSignalsInput = z.infer<
  typeof AGGREGATE_ACCOUNT_SIGNALS_SCHEMA
>;

function asPostItems(items: unknown[]): INSTAGRAM_POST_ITEM_INTELLIGENCE[] {
  return items.filter(
    (item): item is INSTAGRAM_POST_ITEM_INTELLIGENCE =>
      typeof item === "object" &&
      item !== null &&
      "intelligence" in item &&
      "shortcode" in item,
  );
}

function emptyMediaTypeDistribution(): INSTAGRAM_MEDIA_TYPE_DISTRIBUTION {
  return { image: 0, video: 0, carousel: 0, unknown: 0 };
}

function incrementMediaType(
  distribution: INSTAGRAM_MEDIA_TYPE_DISTRIBUTION,
  label: string,
): void {
  if (label === "image" || label === "video" || label === "carousel") {
    distribution[label] += 1;
  } else {
    distribution.unknown += 1;
  }
}

export function aggregateAccountSignalsService(
  input: AggregateAccountSignalsInput,
): INSTAGRAM_ACCOUNT_SIGNALS_RESPONSE {
  const posts = asPostItems(input.items);

  const engagementScores = extractNonNullValues(
    posts.map((post) => post.intelligence.engagementScore),
  );
  const normalizedScores = extractNonNullValues(
    posts.map((post) => post.intelligence.followerNormalizedScore),
  );

  const mediaTypeDistribution = emptyMediaTypeDistribution();
  for (const post of posts) {
    incrementMediaType(mediaTypeDistribution, post.mediaTypeLabel);
  }

  const outlierThreshold =
    normalizedScores.length >= INSTAGRAM_MIN_POSTS_FOR_OUTLIER_DETECTION
      ? computeOutlierThreshold(normalizedScores)
      : null;

  const outlierItems =
    outlierThreshold === null
      ? []
      : posts
          .filter(
            (post) =>
              post.intelligence.followerNormalizedScore !== null &&
              post.intelligence.followerNormalizedScore > outlierThreshold,
          )
          .sort(
            (a, b) =>
              (b.intelligence.velocity ?? 0) - (a.intelligence.velocity ?? 0),
          )
          .map((post) => ({
            id: post.id,
            shortcode: post.shortcode,
            url: post.url,
            videoUrl: post.videoUrl,
            engagementScore: post.intelligence.engagementScore,
            followerNormalizedScore: post.intelligence.followerNormalizedScore,
            velocity: post.intelligence.velocity,
          }));

  const reelCount = posts.filter(
    (post) => post.isVideo && post.productType === "clips",
  ).length;

  return {
    username: input.username ?? null,
    postCount: posts.length,
    avgEngagementScore: computeAverage(engagementScores),
    avgFollowerNormalizedScore: computeAverage(normalizedScores),
    scoreDistribution: computePercentiles(normalizedScores),
    outlierThreshold,
    outlierItems,
    postingCadenceDays: computePostingCadenceDays(
      posts.map((post) => post.takenAt),
    ),
    mediaTypeDistribution,
    reelRatio: posts.length > 0 ? reelCount / posts.length : null,
  };
}

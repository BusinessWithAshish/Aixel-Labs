import type { YOUTUBE_VIDEO_DETAILS_RESPONSE } from "../../video/types";
import {
  computeChannelTier,
  computeCommentToViewRatio,
  computeDecayAdjustedVelocity,
  computeDescriptionLength,
  computeDurationBucket,
  computeEngagementRatio,
  computeHashtagCount,
  computeHasHashtags,
  computeIsShort,
  computeLikeToViewRatio,
  computePublishedDaysAgo,
  computeSubscriberEfficiencyAtVideo,
  computeTagCount,
  computeTitleTextFields,
  computeVelocityScore,
  computeViewsPerDay,
} from "../compute";
import type { YOUTUBE_VIDEO_INTELLIGENCE_RESPONSE } from "./types";

export type VideoIntelligenceHarvest = {
  details: YOUTUBE_VIDEO_DETAILS_RESPONSE;
  suggestionDegree: number | null;
};

export function enrichVideoDetails(
  harvest: VideoIntelligenceHarvest,
  harvestedAt: Date = new Date(),
): YOUTUBE_VIDEO_INTELLIGENCE_RESPONSE {
  const { details: raw, suggestionDegree } = harvest;
  const publishedDaysAgo = computePublishedDaysAgo(
    raw.publishedAt,
    harvestedAt,
  );
  const viewsPerDay = computeViewsPerDay(raw.viewCount, publishedDaysAgo);
  const velocityScore = computeVelocityScore(
    raw.viewCount,
    publishedDaysAgo,
    raw.channelSubscribers,
  );
  const decayAdjustedVelocity = computeDecayAdjustedVelocity(
    velocityScore,
    publishedDaysAgo,
  );

  return {
    ...raw,
    intelligence: {
      publishedDaysAgo,
      viewsPerDay,
      velocityScore,
      decayAdjustedVelocity,
      engagementRatio: computeEngagementRatio(
        raw.likeCount,
        raw.commentCount,
        raw.viewCount,
      ),
      likeToViewRatio: computeLikeToViewRatio(raw.likeCount, raw.viewCount),
      commentToViewRatio: computeCommentToViewRatio(
        raw.commentCount,
        raw.viewCount,
      ),
      durationBucket: computeDurationBucket(raw.lengthSeconds),
      isShort: computeIsShort(raw.lengthSeconds),
      ...computeTitleTextFields(raw.title),
      descriptionLength: computeDescriptionLength(raw.description),
      tagCount: computeTagCount(raw.keywords),
      hasHashtags: computeHasHashtags(raw.title, raw.description),
      hashtagCount: computeHashtagCount(raw.title, raw.description),
      channelTier: computeChannelTier(raw.channelSubscribers),
      subscriberEfficiencyAtVideo: computeSubscriberEfficiencyAtVideo(
        raw.viewCount,
        raw.channelSubscribers,
      ),
      suggestionDegree,
    },
  };
}

import { fetchYoutubeVideoComments } from "../../comments/helpers";
import type { YOUTUBE_VIDEO_COMMENTS_REQUEST } from "../../comments/types";
import {
  aggregateCommentsIntelligence,
  enrichCommentIntelligence,
} from "./compute";
import type { YOUTUBE_COMMENTS_INTELLIGENCE_RESPONSE } from "./types";

export async function enrichCommentsIntelligence(
  request: YOUTUBE_VIDEO_COMMENTS_REQUEST,
): Promise<YOUTUBE_COMMENTS_INTELLIGENCE_RESPONSE> {
  const raw = await fetchYoutubeVideoComments(request);
  const comments = raw.comments.map((comment) => ({
    ...comment,
    intelligence: enrichCommentIntelligence(comment),
  }));

  const intelligence = aggregateCommentsIntelligence(comments);
  // Clusters are computed from the full set above either way; `false` only
  // drops the bodies from the RESPONSE. Research needs the clusters, and the
  // bodies made every 50-100 comment result spill out of the agent's context.
  return {
    ...raw,
    comments: request.includeComments === false ? [] : comments,
    intelligence,
  };
}

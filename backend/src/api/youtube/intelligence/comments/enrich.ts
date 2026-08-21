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

  return {
    ...raw,
    comments,
    intelligence: aggregateCommentsIntelligence(comments),
  };
}

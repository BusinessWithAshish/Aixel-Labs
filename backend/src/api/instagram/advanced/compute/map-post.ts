import { INSTAGRAM_BASE_URL } from "../../constants";
import {
  IG_MEDIA_TYPE,
  IG_MEDIA_TYPE_LABEL,
} from "../constants";
import type {
  IG_ADVANCED_POST,
  IG_ADVANCED_POST_IMAGE,
  IG_ADVANCED_POST_USER,
  IG_ADVANCED_POST_VIDEO,
  IgFeedImageCandidate,
  IgFeedItem,
  IgFeedUser,
  IgFeedVideoVersion,
  IgMediaTypeLabel,
} from "../types";

function asStringId(value: string | number | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return String(value);
}

function mediaTypeLabel(
  mediaType: number | null | undefined,
): IgMediaTypeLabel | "unknown" {
  if (mediaType === IG_MEDIA_TYPE.IMAGE) return IG_MEDIA_TYPE_LABEL[IG_MEDIA_TYPE.IMAGE];
  if (mediaType === IG_MEDIA_TYPE.VIDEO) return IG_MEDIA_TYPE_LABEL[IG_MEDIA_TYPE.VIDEO];
  if (mediaType === IG_MEDIA_TYPE.CAROUSEL)
    return IG_MEDIA_TYPE_LABEL[IG_MEDIA_TYPE.CAROUSEL];
  return "unknown";
}

function mapImages(
  candidates: IgFeedImageCandidate[] | undefined,
): IG_ADVANCED_POST_IMAGE[] {
  if (!candidates?.length) return [];
  return candidates
    .filter((c): c is IgFeedImageCandidate & { url: string } => Boolean(c.url))
    .map((c) => ({
      url: c.url,
      width: c.width ?? null,
      height: c.height ?? null,
    }));
}

function mapVideos(
  versions: IgFeedVideoVersion[] | undefined,
): IG_ADVANCED_POST_VIDEO[] {
  if (!versions?.length) return [];
  return versions
    .filter((v): v is IgFeedVideoVersion & { url: string } => Boolean(v.url))
    .map((v) => ({
      url: v.url,
      width: v.width ?? null,
      height: v.height ?? null,
      type: v.type ?? null,
    }));
}

export function mapFeedUser(
  user: IgFeedUser | undefined | null,
): IG_ADVANCED_POST_USER | null {
  if (!user) return null;
  return {
    id: asStringId(user.pk ?? user.id),
    username: user.username ?? null,
    fullName: user.full_name ?? null,
    isVerified: user.is_verified ?? null,
    profilePicUrl: user.profile_pic_url ?? null,
  };
}

export function mapFeedItem(item: IgFeedItem): IG_ADVANCED_POST {
  const images = mapImages(item.image_versions2?.candidates);
  const videos = mapVideos(item.video_versions);
  const shortcode = item.code ?? null;
  const mediaType = item.media_type ?? null;
  const isVideo =
    mediaType === IG_MEDIA_TYPE.VIDEO ||
    Boolean(videos.length) ||
    item.product_type === "clips" ||
    item.product_type === "igtv";

  const carousel = (item.carousel_media ?? []).map(mapFeedItem);

  return {
    id: item.id ?? null,
    pk: asStringId(item.pk),
    shortcode,
    url: shortcode ? `${INSTAGRAM_BASE_URL}/p/${shortcode}/` : null,
    mediaType,
    mediaTypeLabel: mediaTypeLabel(mediaType),
    productType: item.product_type ?? null,
    takenAt: item.taken_at ?? null,
    caption: item.caption?.text ?? null,
    likeCount: item.like_count ?? null,
    commentCount: item.comment_count ?? null,
    playCount: item.play_count ?? null,
    viewCount: item.view_count ?? null,
    isVideo,
    commentsDisabled: item.comments_disabled ?? null,
    likeAndViewCountsDisabled: item.like_and_view_counts_disabled ?? null,
    locationName: item.location?.name ?? null,
    locationId: asStringId(
      item.location?.pk ?? item.location?.location_id ?? null,
    ),
    imageUrl: images[0]?.url ?? null,
    images,
    videoUrl: videos[0]?.url ?? null,
    videos,
    carouselCount:
      item.carousel_media_count ??
      (carousel.length > 0 ? carousel.length : null),
    carousel,
    user: mapFeedUser(item.user),
    coauthors: (item.coauthor_producers ?? [])
      .map(mapFeedUser)
      .filter((u): u is IG_ADVANCED_POST_USER => u !== null),
  };
}

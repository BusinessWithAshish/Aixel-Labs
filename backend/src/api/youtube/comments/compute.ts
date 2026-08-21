import {
  abbreviatedCountTextToNumber,
  joinYoutubeTextRuns,
  parseNumericString,
} from "../helpers";
import { hasContinuationItemRenderer } from "../type-guards";
import {
  YOUTUBE_COMMENTS_DISABLED_MARKER,
  YOUTUBE_ENGAGEMENT_PANEL_TARGET_IDS,
} from "../constants";
import {
  YOUTUBE_COMMENTS_SECTION_ID,
  YOUTUBE_COMMENTS_SORT,
  YOUTUBE_COMMENTS_SORT_MENU_TITLE,
} from "./constants";
import type {
  YOUTUBE_COMMENT,
  YOUTUBE_COMMENT_ENTITY_PAYLOAD,
  YOUTUBE_COMMENTS_BOOTSTRAP,
  YOUTUBE_COMMENTS_NEXT_RESPONSE,
  YOUTUBE_COMMENTS_PAGE,
  YOUTUBE_COMMENTS_SORT_VALUE,
} from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function runsText(value: unknown): string | null {
  const rec = asRecord(value);
  if (!rec) return null;
  if (typeof rec.simpleText === "string") {
    return rec.simpleText.trim() || null;
  }
  return joinYoutubeTextRuns(rec.runs as Array<{ text?: string }> | undefined);
}

function continuationTokenFrom(value: unknown): string | null {
  const rec = asRecord(value);
  if (!rec) return null;

  const fromCommand = asRecord(asRecord(rec.continuationEndpoint)?.continuationCommand)
    ?.token;
  if (typeof fromCommand === "string" && fromCommand) return fromCommand;

  const fromService = asRecord(
    asRecord(rec.serviceEndpoint)?.continuationCommand,
  )?.token;
  if (typeof fromService === "string" && fromService) return fromService;

  const nested = asRecord(rec.continuationItemRenderer);
  if (nested) return continuationTokenFrom(nested);

  return null;
}

function parseCount(text: string | null): number | null {
  if (!text) return null;
  return abbreviatedCountTextToNumber(text) ?? parseNumericString(text);
}

function mapEntityToComment(
  payload: YOUTUBE_COMMENT_ENTITY_PAYLOAD,
  repliesContinuation: string | null,
): YOUTUBE_COMMENT | null {
  const commentId = payload.properties?.commentId?.trim();
  const text = payload.properties?.content?.content ?? "";
  if (!commentId) return null;

  const likeCountText =
    payload.toolbar?.likeCountNotliked ?? payload.toolbar?.likeCountLiked ?? null;
  const replyCountText = payload.toolbar?.replyCount ?? null;

  return {
    commentId,
    text,
    publishedTime: payload.properties?.publishedTime?.trim() || null,
    likeCount: parseCount(likeCountText),
    likeCountText,
    replyCount: parseCount(replyCountText),
    replyCountText,
    author: {
      channelId: payload.author?.channelId?.trim() || null,
      displayName: payload.author?.displayName?.trim() || null,
      avatarUrl: payload.author?.avatarThumbnailUrl?.trim() || null,
      isVerified: Boolean(payload.author?.isVerified),
      isCreator: Boolean(payload.author?.isCreator),
      isArtist: Boolean(payload.author?.isArtist),
    },
    isCreatorHearted: Boolean(payload.toolbar?.heartActiveTooltip),
    replyLevel: payload.properties?.replyLevel ?? 0,
    repliesContinuation,
  };
}

function entityMapFromNextResponse(
  data: YOUTUBE_COMMENTS_NEXT_RESPONSE,
): Map<string, YOUTUBE_COMMENT_ENTITY_PAYLOAD> {
  const map = new Map<string, YOUTUBE_COMMENT_ENTITY_PAYLOAD>();
  const mutations =
    data.frameworkUpdates?.entityBatchUpdate?.mutations ?? [];

  for (const mutation of mutations) {
    const payload = mutation.payload?.commentEntityPayload;
    const commentId = payload?.properties?.commentId?.trim();
    if (payload && commentId) map.set(commentId, payload);
  }

  return map;
}

function commentIdFromViewModel(value: unknown): string | null {
  const rec = asRecord(value);
  const viewModel = asRecord(rec?.commentViewModel) ?? rec;
  return readString(viewModel?.commentId);
}

function repliesContinuationFromThread(thread: Record<string, unknown>): string | null {
  const replies = asRecord(thread.replies);
  const renderer = asRecord(replies?.commentRepliesRenderer);
  for (const item of asArray(renderer?.contents)) {
    const token = continuationTokenFrom(item);
    if (token) return token;
  }
  return null;
}

function headerCountText(item: unknown): string | null {
  const rec = asRecord(item);
  const header = asRecord(rec?.commentsHeaderRenderer);
  if (!header) return null;
  return (
    runsText(header.commentsCount) ??
    runsText(header.countText) ??
    runsText(header.contextualInfo)
  );
}

function collectContinuationItems(
  data: YOUTUBE_COMMENTS_NEXT_RESPONSE,
): unknown[] {
  const items: unknown[] = [];
  for (const action of data.onResponseReceivedEndpoints ?? []) {
    const chunk =
      action.reloadContinuationItemsCommand?.continuationItems ??
      action.appendContinuationItemsAction?.continuationItems ??
      [];
    items.push(...chunk);
  }
  return items;
}

export function parseCommentsNextResponse(
  data: YOUTUBE_COMMENTS_NEXT_RESPONSE,
): YOUTUBE_COMMENTS_PAGE {
  const entities = entityMapFromNextResponse(data);
  const items = collectContinuationItems(data);
  const comments: YOUTUBE_COMMENT[] = [];
  let continuation: string | null = null;
  let commentCountText: string | null = null;

  for (const item of items) {
    const rec = asRecord(item);
    if (!rec) continue;

    const fromHeader = headerCountText(rec);
    if (fromHeader && fromHeader.toLowerCase() !== "comments") {
      commentCountText = fromHeader;
    }

    if (hasContinuationItemRenderer(rec)) {
      continuation = continuationTokenFrom(rec) ?? continuation;
      continue;
    }

    const thread = asRecord(rec.commentThreadRenderer);
    if (thread) {
      const commentId =
        commentIdFromViewModel(thread.commentViewModel) ??
        readString(asRecord(thread.commentRenderer)?.commentId);
      const payload = commentId ? entities.get(commentId) : undefined;
      if (payload) {
        const mapped = mapEntityToComment(
          payload,
          repliesContinuationFromThread(thread),
        );
        if (mapped) comments.push(mapped);
      }
      continue;
    }

    if (rec.commentViewModel) {
      const commentId = commentIdFromViewModel(rec);
      const payload = commentId ? entities.get(commentId) : undefined;
      if (payload) {
        const mapped = mapEntityToComment(payload, null);
        if (mapped) comments.push(mapped);
      }
    }
  }

  return { comments, continuation, commentCountText };
}

function watchNextContents(root: Record<string, unknown>): unknown[] {
  const contents = asRecord(root.contents);
  const twoCol = asRecord(contents?.twoColumnWatchNextResults);
  const resultsWrap = asRecord(asRecord(twoCol?.results)?.results);
  if (!resultsWrap) return [];
  if (Array.isArray(resultsWrap)) {
    return resultsWrap.flatMap((panel) =>
      asArray(asRecord(panel)?.contents),
    );
  }
  return asArray(resultsWrap.contents);
}

function sortTitleToValue(title: string): YOUTUBE_COMMENTS_SORT_VALUE | null {
  const normalized = title.trim().toLowerCase();
  if (normalized === YOUTUBE_COMMENTS_SORT_MENU_TITLE.top) {
    return YOUTUBE_COMMENTS_SORT.TOP;
  }
  if (normalized === YOUTUBE_COMMENTS_SORT_MENU_TITLE.newest) {
    return YOUTUBE_COMMENTS_SORT.NEWEST;
  }
  return null;
}

function extractSortContinuations(
  root: Record<string, unknown>,
): YOUTUBE_COMMENTS_BOOTSTRAP["continuationBySort"] {
  const bySort: YOUTUBE_COMMENTS_BOOTSTRAP["continuationBySort"] = {};

  for (const panel of asArray(root.engagementPanels)) {
    const section = asRecord(
      asRecord(panel)?.engagementPanelSectionListRenderer,
    );
    if (section?.targetId !== YOUTUBE_ENGAGEMENT_PANEL_TARGET_IDS.COMMENTS) {
      continue;
    }

    const header = asRecord(
      asRecord(section.header)?.engagementPanelTitleHeaderRenderer,
    );
    const menu = asRecord(asRecord(header?.menu)?.sortFilterSubMenuRenderer);

    for (const item of asArray(menu?.subMenuItems)) {
      const rec = asRecord(item);
      const title = readString(rec?.title);
      const sort = title ? sortTitleToValue(title) : null;
      const token = continuationTokenFrom(rec);
      if (sort && token) bySort[sort] = token;
    }
  }

  return bySort;
}

function extractPanelCountText(root: Record<string, unknown>): string | null {
  for (const panel of asArray(root.engagementPanels)) {
    const section = asRecord(
      asRecord(panel)?.engagementPanelSectionListRenderer,
    );
    if (section?.targetId !== YOUTUBE_ENGAGEMENT_PANEL_TARGET_IDS.COMMENTS) {
      continue;
    }
    const header = asRecord(
      asRecord(section.header)?.engagementPanelTitleHeaderRenderer,
    );
    const text =
      runsText(header?.contextualInfo) ??
      runsText(asRecord(header?.title)?.contextualInfo);
    if (text) return text;
  }
  return null;
}

function extractDefaultContinuation(root: Record<string, unknown>): string | null {
  for (const item of watchNextContents(root)) {
    const section = asRecord(asRecord(item)?.itemSectionRenderer);
    if (!section) continue;

    const sectionId = readString(section.sectionIdentifier);
    const hasHeader = Boolean(
      asRecord(section.header)?.commentsHeaderRenderer,
    );
    if (sectionId !== YOUTUBE_COMMENTS_SECTION_ID && !hasHeader) continue;

    for (const content of asArray(section.contents)) {
      const token = continuationTokenFrom(content);
      if (token) return token;
    }
  }

  return null;
}

export function extractCommentsBootstrap(root: unknown): YOUTUBE_COMMENTS_BOOTSTRAP {
  const rec = asRecord(root);
  const empty: YOUTUBE_COMMENTS_BOOTSTRAP = {
    commentsDisabled: false,
    commentCountText: null,
    defaultContinuation: null,
    continuationBySort: {},
  };
  if (!rec) return empty;

  return {
    commentsDisabled: JSON.stringify(rec).includes(
      YOUTUBE_COMMENTS_DISABLED_MARKER,
    ),
    commentCountText: extractPanelCountText(rec),
    defaultContinuation: extractDefaultContinuation(rec),
    continuationBySort: extractSortContinuations(rec),
  };
}

export function resolveCommentsContinuation(
  bootstrap: YOUTUBE_COMMENTS_BOOTSTRAP,
  sort: YOUTUBE_COMMENTS_SORT_VALUE,
): string | null {
  return (
    bootstrap.continuationBySort[sort] ??
    (sort === YOUTUBE_COMMENTS_SORT.TOP
      ? bootstrap.defaultContinuation
      : null) ??
    bootstrap.defaultContinuation
  );
}

export function parseCommentCountText(text: string | null): number | null {
  return parseCount(text);
}

/**
 * Auth-free YouTube handle validator + availability checker.
 *
 * The YouTube Studio `validate_channel_handle` endpoint is owner-authenticated
 * (SAPISIDHASH + login cookies + a channel delegation context) and returns 401
 * without a session, so it can't back an idea-checking tool. Instead this uses
 * the public InnerTube `navigation/resolve_url` call (no key, no auth): a
 * resolvable handle comes back with `endpoint.browseEndpoint.browseId` (the
 * channel id → taken), a free one comes back 404 NOT_FOUND (available).
 *
 * Reuses the youtube module's proxied fetch (Evomi, direct-first) so it stays
 * reliable from this datacenter IP.
 */
import {
  YOUTUBE_BASE_URL,
  YOUTUBE_CHANNEL_ID_PATTERN,
  YOUTUBE_HANDLER_LABELS,
  YOUTUBE_HANDLE_CHECK_CONCURRENCY,
  YOUTUBE_HANDLE_MIN_LENGTH,
  YOUTUBE_HANDLE_VALID_LENGTH_MAX,
  YOUTUBE_INNERTUBE_JSON_HEADERS,
  YOUTUBE_INNERTUBE_RESOLVE_URL,
  YOUTUBE_INNERTUBE_WEB_CLIENT_VERSION,
} from "../constants";
import { runWithConcurrency } from "../concurrency";
import {
  buildInnertubeContext,
  createYoutubeFetchSession,
  normalizeYoutubeHandle,
  resolveYoutubeGeo,
  withDirectFirst,
} from "../helpers";
import { closeUrlFetchSession, type UrlFetchSession } from "../../../utils/node-tls-client-session-handler";
import type {
  YOUTUBE_HANDLE_CHECK_ITEM,
  YOUTUBE_HANDLE_CHECK_REQUEST,
  YOUTUBE_HANDLE_CHECK_RESPONSE,
  YOUTUBE_HANDLE_INVALID_REASON,
} from "./types";

const CHANNEL_ID_EXACT = new RegExp(`^${YOUTUBE_CHANNEL_ID_PATTERN.source}$`);

/** YouTube's handle format rules. Availability is the authoritative "can I claim it". */
function validateHandleFormat(handle: string): {
  valid: boolean;
  reason?: YOUTUBE_HANDLE_INVALID_REASON;
} {
  if (handle.length < YOUTUBE_HANDLE_MIN_LENGTH) return { valid: false, reason: "too_short" };
  if (handle.length > YOUTUBE_HANDLE_VALID_LENGTH_MAX) return { valid: false, reason: "too_long" };
  if (!/^[A-Za-z0-9._-]+$/.test(handle)) return { valid: false, reason: "invalid_chars" };
  if (/^\.|\.$/.test(handle)) return { valid: false, reason: "leading_or_trailing_period" };
  if (/\.\./.test(handle)) return { valid: false, reason: "consecutive_periods" };
  return { valid: true };
}

type Availability = { available: boolean; channelId: string | null };

/** Resolve one handle via the public InnerTube resolve_url. 404 = available; browseId = taken. */
async function resolveAvailability(
  session: UrlFetchSession,
  gl: string,
  handle: string,
): Promise<Availability> {
  const body = {
    url: `${YOUTUBE_BASE_URL}/@${handle}`,
    context: buildInnertubeContext(YOUTUBE_INNERTUBE_WEB_CLIENT_VERSION, gl),
  };
  const response = await session.post(`${YOUTUBE_INNERTUBE_RESOLVE_URL}?prettyPrint=false`, {
    headers: YOUTUBE_INNERTUBE_JSON_HEADERS,
    body: JSON.stringify(body),
  });
  const text = await response.text();

  // 404 NOT_FOUND is the normal "no such handle" — free to claim, not an error.
  if (response.status === 404) return { available: true, channelId: null };
  // Any other non-2xx (rate limit / bot challenge) is a real failure — throw so
  // withDirectFirst retries the whole batch through the proxy.
  if (!response.ok) throw new Error(`resolve_url failed: ${response.status}`);

  let browseId: string | null = null;
  try {
    const data = JSON.parse(text) as {
      endpoint?: { browseEndpoint?: { browseId?: string } };
    };
    browseId = data.endpoint?.browseEndpoint?.browseId ?? null;
  } catch {
    /* fall through to available */
  }
  if (browseId && CHANNEL_ID_EXACT.test(browseId)) {
    return { available: false, channelId: browseId };
  }
  return { available: true, channelId: null };
}

export async function fetchYoutubeHandleCheck(
  input: YOUTUBE_HANDLE_CHECK_REQUEST,
): Promise<YOUTUBE_HANDLE_CHECK_RESPONSE> {
  const { country } = resolveYoutubeGeo({ country: input.country, region: input.region });

  const prepared = input.handles.map((raw) => {
    const handle = normalizeYoutubeHandle(raw);
    return { raw, handle, format: validateHandleFormat(handle) };
  });

  const results = await withDirectFirst(
    YOUTUBE_HANDLER_LABELS.HANDLE_CHECK,
    async (direct): Promise<YOUTUBE_HANDLE_CHECK_ITEM[]> => {
      const session = await createYoutubeFetchSession(
        { country: input.country, region: input.region },
        { direct },
      );
      try {
        return await runWithConcurrency(
          prepared,
          YOUTUBE_HANDLE_CHECK_CONCURRENCY,
          async (p): Promise<YOUTUBE_HANDLE_CHECK_ITEM> => {
            const url = `${YOUTUBE_BASE_URL}/@${p.handle}`;
            if (!p.format.valid) {
              return {
                input: p.raw,
                handle: p.handle,
                valid: false,
                reason: p.format.reason,
                available: null,
                channelId: null,
                url,
              };
            }
            const { available, channelId } = await resolveAvailability(session, country, p.handle);
            return {
              input: p.raw,
              handle: p.handle,
              valid: true,
              available,
              channelId,
              url,
            };
          },
        );
      } finally {
        closeUrlFetchSession(session);
      }
    },
  );

  return { results };
}

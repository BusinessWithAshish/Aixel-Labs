import { randomUUID } from "crypto";
import {
  closeUrlFetchSession,
  createUrlFetchSession,
} from "../../utils/node-tls-client-session-handler";
import {
  GSEARCH_ACCEPT_LANGUAGE,
  GSEARCH_REQUEST_TIMEOUT_MS,
  GSEARCH_USER_AGENT,
} from "./constants";

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Generate a ≤12-char sticky Evomi session id (proxy requirement). */
export function newGsearchSessionId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

export async function gsearchProxiedGet(
  url: string,
  opts: { proxyUrl: string; referer?: string },
): Promise<{ status: number; body: string }> {
  const session = await createUrlFetchSession({
    proxyUrl: opts.proxyUrl,
    timeoutMs: GSEARCH_REQUEST_TIMEOUT_MS,
    headers: {
      "user-agent": GSEARCH_USER_AGENT,
      accept: "*/*",
      "accept-language": GSEARCH_ACCEPT_LANGUAGE,
      ...(opts.referer ? { referer: opts.referer } : {}),
    },
  });

  try {
    const res = await session.get(url, { followRedirects: true });
    const body = await res.text();
    return { status: res.status, body };
  } finally {
    await closeUrlFetchSession(session);
  }
}

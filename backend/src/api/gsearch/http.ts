import { randomUUID } from "crypto";
import { Impit } from "impit";

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
  const headers: Record<string, string> = {
    "user-agent": GSEARCH_USER_AGENT,
    accept: "*/*",
    "accept-language": GSEARCH_ACCEPT_LANGUAGE,
    ...(opts.referer ? { referer: opts.referer } : {}),
  };

  const impit = new Impit({
    browser: "chrome131",
    followRedirects: true,
    timeout: GSEARCH_REQUEST_TIMEOUT_MS,
    headers,
    proxyUrl: opts.proxyUrl,
  });

  const res = await impit.fetch(url, { headers });
  const body = await res.text();
  return { status: res.status, body };
}

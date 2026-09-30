import {
  GOOGLE_TRENDS_INTEREST_ACCEPT_HEADER,
  GOOGLE_TRENDS_INTEREST_REFERER,
  GOOGLE_TRENDS_NID_PRIME_URL,
  GOOGLE_TRENDS_USER_AGENT,
} from "../constants";
import type { UrlFetchSession } from "../../../utils/node-tls-client-session-handler";

export function requestHeaders(hl: string): Record<string, string> {
  return {
    "user-agent": GOOGLE_TRENDS_USER_AGENT,
    accept: GOOGLE_TRENDS_INTEREST_ACCEPT_HEADER,
    "accept-language": `${hl},${hl.split("-")[0]};q=0.9`,
    referer: GOOGLE_TRENDS_INTEREST_REFERER,
  };
}

/**
 * Seeds the session's cookie jar with a real `NID` cookie before the
 * explore/widgetdata calls — see GOOGLE_TRENDS_NID_PRIME_URL's doc comment.
 * The 405 response itself is discarded; only its Set-Cookie matters, and the
 * session object picks that up automatically for subsequent requests.
 */
export async function primeGoogleTrendsSession(
  session: UrlFetchSession,
): Promise<void> {
  await session.get(GOOGLE_TRENDS_NID_PRIME_URL, {
    headers: { "user-agent": GOOGLE_TRENDS_USER_AGENT },
    followRedirects: true,
  });
}

export async function fetchJsonWithSession(
  session: UrlFetchSession,
  url: string,
  hl: string,
  label: string,
): Promise<string> {
  const response = await session.get(url, { headers: requestHeaders(hl) });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${label} failed (${response.status}): ${text.slice(0, 300)}`,
    );
  }
  return text;
}

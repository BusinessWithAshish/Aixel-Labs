import {
  GOOGLE_TRENDS_INTEREST_ACCEPT_HEADER,
  GOOGLE_TRENDS_INTEREST_REFERER,
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

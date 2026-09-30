/**
 * Solves Google's GDPR/EU consent interstitial (`consent.google.com`) for a
 * TLS-client session, once, by replaying the exact request its own
 * "Accept all" HTML form makes — no browser involved.
 *
 * Root cause (found 2026-09-30 via a throwaway-Chrome network capture): this
 * server's outbound IP now geolocates as EU (Google's own redirect echoes
 * `gl=DE`), which google.com started gating behind a mandatory consent page
 * for cookie-less requests. That's a server-side IP classification change on
 * Google's end, not a per-request bot-detection signal — it reproduces
 * identically with plain curl, no proxy, no special headers. A pre-baked
 * static `CONSENT=YES+...` cookie does NOT bypass it (tested); the consent
 * page's `escs` token and `bl` (Google build label) are single-use/dated and
 * must be read from the live page.
 *
 * Once solved, the session's existing cookie jar carries the resulting
 * `SOCS`/`__Secure-BUCKET` cookies for every subsequent request on that
 * session — callers solve this once per session, not once per request.
 */
import type { UrlFetchSession } from "./node-tls-client-session-handler";

const CONSENT_SAVE_URL = "https://consent.google.com/save";
const CONSENT_HOST = "consent.google.com";

type ConsentResponse = {
  status: number;
  headers: Record<string, unknown>;
  text: () => Promise<string>;
};

/** Parses the "Accept all" `<form>` on the consent page — the one setting `set_eom=true` with no `set_sc`/`set_aps` (those belong to the reject/customize form). */
function extractAcceptAllForm(html: string): Record<string, string> | null {
  const forms = [
    ...html.matchAll(
      /<form[^>]*action="https:\/\/consent\.google\.com\/save"[^>]*>([\s\S]*?)<\/form>/gi,
    ),
  ];
  for (const formMatch of forms) {
    const block = formMatch[1] ?? "";
    const inputs: Record<string, string> = {};
    for (const inputMatch of block.matchAll(
      /<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"[^>]*>/gi,
    )) {
      inputs[inputMatch[1]!] = inputMatch[2]!
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"');
    }
    if (inputs.set_eom === "true" && !("set_sc" in inputs)) {
      return inputs;
    }
  }
  return null;
}

/**
 * node-tls-client returns response headers with their original wire casing
 * (e.g. "Location", "Set-Cookie") and each value as an array — not Node's
 * lowercase-normalized `IncomingHttpHeaders` shape other code in this repo
 * assumes. HTTP header names are case-insensitive, so match case-insensitively.
 */
function headerValue(
  headers: Record<string, unknown>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== lower) continue;
    const value = headers[key];
    return Array.isArray(value) ? value[0] : (value as string | undefined);
  }
  return undefined;
}

/**
 * GETs `url` on `session`; if google.com redirects it to the consent
 * interstitial, solves it (GET the consent page, POST its accept-all form),
 * then retries `url` once. Returns whatever the final GET returns either
 * way — a no-op when consent isn't required.
 */
export async function fetchGoogleWithConsent(
  session: UrlFetchSession,
  url: string,
  requestHeaders: Record<string, string>,
): Promise<ConsentResponse> {
  const first = (await session.get(url, {
    headers: requestHeaders,
    followRedirects: false,
  })) as unknown as ConsentResponse;

  if (first.status < 300 || first.status >= 400) return first;
  const location = headerValue(first.headers, "location");
  if (!location || !location.includes(CONSENT_HOST)) return first;

  const consentPage = (await session.get(location, {
    headers: requestHeaders,
    followRedirects: false,
  })) as unknown as ConsentResponse;
  const html = await consentPage.text();

  const form = extractAcceptAllForm(html);
  if (!form) {
    throw new Error(
      "[google-consent] Could not find the Accept-all form on Google's consent page — its markup may have changed",
    );
  }

  const body = new URLSearchParams(form).toString();
  const saveResp = (await session.post(CONSENT_SAVE_URL, {
    headers: {
      ...requestHeaders,
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://consent.google.com",
      referer: location,
    },
    body,
    followRedirects: false,
  } as any)) as unknown as ConsentResponse;

  if (saveResp.status < 300 || saveResp.status >= 400) {
    throw new Error(
      `[google-consent] /save returned unexpected status ${saveResp.status}`,
    );
  }

  // Cookie jar now holds SOCS/__Secure-BUCKET — retry for real content.
  return (await session.get(url, {
    headers: requestHeaders,
    followRedirects: true,
  })) as unknown as ConsentResponse;
}

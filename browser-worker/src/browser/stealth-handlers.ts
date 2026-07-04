import { readFileSync } from "fs";
import { join } from "path";
import { Page } from "puppeteer";
import { config } from "dotenv";

config();

const BOT_STEALTH_INJECT_SCRIPT = readFileSync(
  join(__dirname, "bot-stealth-inject.js"),
  "utf-8",
);

// ============================================================
// VIEWPORT
// ============================================================

type Viewport = {
  width: number;
  height: number;
  deviceScaleFactor: number;
  hasTouch: boolean;
  isLandscape: boolean;
  isMobile: boolean;
};

export const randomViewportGenerator = (): Viewport => {
  const viewports: Viewport[] = [
    {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      hasTouch: false,
      isLandscape: true,
      isMobile: false,
    },
    {
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
      hasTouch: false,
      isLandscape: true,
      isMobile: false,
    },
    {
      width: 1536,
      height: 864,
      deviceScaleFactor: 1,
      hasTouch: false,
      isLandscape: true,
      isMobile: false,
    },
    {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      hasTouch: false,
      isLandscape: true,
      isMobile: false,
    },
    {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      hasTouch: false,
      isLandscape: true,
      isMobile: false,
    },
    {
      width: 2560,
      height: 1440,
      deviceScaleFactor: 1,
      hasTouch: false,
      isLandscape: true,
      isMobile: false,
    },
    {
      width: 1680,
      height: 1050,
      deviceScaleFactor: 1,
      hasTouch: false,
      isLandscape: true,
      isMobile: false,
    },
    {
      width: 1600,
      height: 900,
      deviceScaleFactor: 1,
      hasTouch: false,
      isLandscape: true,
      isMobile: false,
    },
    {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      hasTouch: false,
      isLandscape: true,
      isMobile: false,
    },
    {
      width: 1680,
      height: 1050,
      deviceScaleFactor: 2,
      hasTouch: false,
      isLandscape: true,
      isMobile: false,
    },
  ];
  return viewports[Math.floor(Math.random() * viewports.length)];
};

// ============================================================
// SESSION FINGERPRINT (UA + Sec-CH-UA client hints)
// ============================================================

export type UserAgentMetadata = {
  brands: Array<{ brand: string; version: string }>;
  fullVersion: string;
  platform: string;
  platformVersion: string;
  architecture: string;
  model: string;
  mobile: boolean;
};

export type ParsedChromeUserAgent = {
  userAgent: string;
  majorVersion: string;
  fullVersion: string;
  platform: string;
  platformVersion: string;
  architecture: string;
  mobile: boolean;
};

export function parseChromeUserAgent(rawUa: string): ParsedChromeUserAgent {
  const userAgent = rawUa.replace(/HeadlessChrome/g, "Chrome");

  const chromeMatch = userAgent.match(
    /Chrome\/(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?/,
  );
  const majorVersion = chromeMatch?.[1] ?? "131";
  const fullVersion = chromeMatch
    ? [
        chromeMatch[1],
        chromeMatch[2] ?? "0",
        chromeMatch[3] ?? "0",
        chromeMatch[4] ?? "0",
      ].join(".")
    : `${majorVersion}.0.0.0`;

  let platform = "Windows";
  let platformVersion = "10.0.0";
  let architecture = "x86";
  const mobile = /Mobile|Android/i.test(userAgent);

  if (/Macintosh|Mac OS X/i.test(userAgent)) {
    platform = "macOS";
    const macMatch = userAgent.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/);
    platformVersion = macMatch ? macMatch[1].replace(/_/g, ".") : "10.15.7";
    architecture = /arm64|aarch64/i.test(userAgent) ? "arm" : "x86";
  } else if (/Windows/i.test(userAgent)) {
    platform = "Windows";
    platformVersion = "10.0.0";
    architecture = /Win64|x64|WOW64/i.test(userAgent) ? "x86" : "x86";
  } else if (/Linux|X11/i.test(userAgent)) {
    platform = "Linux";
    platformVersion = "";
    architecture = /aarch64|arm64/i.test(userAgent) ? "arm" : "x86";
  }

  return {
    userAgent,
    majorVersion,
    fullVersion,
    platform,
    platformVersion,
    architecture,
    mobile,
  };
}

export function buildUserAgentMetadata(
  parsed: ParsedChromeUserAgent,
): UserAgentMetadata {
  return {
    brands: [
      { brand: "Google Chrome", version: parsed.majorVersion },
      { brand: "Chromium", version: parsed.majorVersion },
      { brand: "Not_A Brand", version: "24" },
    ],
    fullVersion: parsed.fullVersion,
    platform: parsed.platform,
    platformVersion: parsed.platformVersion,
    architecture: parsed.architecture,
    model: "",
    mobile: parsed.mobile,
  };
}

async function applySessionFingerprint(page: Page): Promise<void> {
  const rawUa = await page.browser().userAgent();
  const parsed = parseChromeUserAgent(rawUa);

  await page.setUserAgent(parsed.userAgent, buildUserAgentMetadata(parsed));

  if (process.env.NODE_ENV === "production") {
    await page.setViewport(randomViewportGenerator());
  }
}

// ============================================================
// STATIC ASSET REQUEST INTERCEPTION
// ============================================================

const ESSENTIAL_RESOURCE_TYPES = new Set([
  "document",
  "script",
  "fetch",
  "xhr",
  "other",
  "ping",
]);

const STATIC_RESOURCE_TYPES = new Set([
  "image",
  "stylesheet",
  "font",
  "media",
  "texttrack",
  "manifest",
  "websocket",
  "eventsource",
]);

const THIRD_PARTY_DENYLIST = [
  "youtube.com",
  "instagram.com",
  "doubleclick.net",
  "googlesyndication.com",
  "adtrafficquality.google",
  "google-analytics.com",
  "googletagmanager.com",
  "play.google.com",
  "mtalk.google.com",
  "content-autofill.googleapis.com",
];

function matchesThirdPartyDenylist(url: string): boolean {
  const lower = url.toLowerCase();
  return THIRD_PARTY_DENYLIST.some((domain) => lower.includes(domain));
}

export function shouldAllowGoogleRequest(
  url: string,
  resourceType: string,
): boolean {
  if (!ESSENTIAL_RESOURCE_TYPES.has(resourceType)) {
    return false;
  }

  const lower = url.toLowerCase();

  if (matchesThirdPartyDenylist(lower)) {
    return false;
  }

  if (lower.includes("google.com/search")) return true;
  if (/google\.com\/?(\?|#|$)/.test(lower)) return true;
  if (lower.includes("google.com/maps")) return true;
  if (lower.includes("google.com/xjs")) return true;
  if (lower.includes("gstatic.com") && lower.endsWith(".js")) return true;
  if (lower.includes("recaptcha")) return true;
  if (lower.includes("gstatic.com/recaptcha")) return true;
  if (lower.includes("google.com") || lower.includes("gstatic.com"))
    return true;

  return true;
}

export function shouldBlockStaticAsset(
  url: string,
  resourceType: string,
): boolean {
  if (shouldAllowGoogleRequest(url, resourceType)) {
    return false;
  }

  if (STATIC_RESOURCE_TYPES.has(resourceType)) {
    return true;
  }

  if (matchesThirdPartyDenylist(url)) {
    return true;
  }

  return false;
}

async function applyStaticAssetInterceptor(page: Page): Promise<void> {
  if (page.listenerCount("request") > 0) return;

  const debug =
    process.env.STEALTH_INTERCEPTOR_DEBUG === "1" ||
    process.env.GSEARCH_INTERCEPTOR_DEBUG === "1";

  let blocked = 0;
  let allowed = 0;

  await page.setRequestInterception(true);

  page.on("request", (req) => {
    if (req.isInterceptResolutionHandled()) return;

    const url = req.url();
    const resourceType = req.resourceType();
    const block = shouldBlockStaticAsset(url, resourceType);

    try {
      if (block) {
        blocked++;
        if (debug) {
          console.log(
            `[Stealth:intercept] BLOCK ${resourceType} ${url.slice(0, 120)}`,
          );
        }
        req.abort();
      } else {
        allowed++;
        req.continue();
      }
    } catch {
      // Request already handled by another listener or navigation teardown.
    }
  });

  page.once("close", () => {
    if (debug) {
      console.log(
        `[Stealth:intercept] session stats blocked=${blocked} allowed=${allowed}`,
      );
    }
  });
}

// ============================================================
// BOT STEALTH (in-page navigator patches)
// ============================================================

async function applyBotStealth(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(
    new Function(BOT_STEALTH_INJECT_SCRIPT) as () => void,
  );
}

// ============================================================
// UNIFIED PAGE STEALTH (gsearch + gmaps)
// ============================================================

/**
 * Single stealth pipeline for all Google scraping (Search + Maps).
 * 1. Static asset interception — saves proxy bandwidth
 * 2. Session fingerprint — real browser UA + matching client hints (no setExtraHTTPHeaders)
 * 3. Bot stealth — in-page navigator / WebGL patches
 */
export async function pageStealther(page: Page): Promise<void> {
  await applyStaticAssetInterceptor(page);
  await applySessionFingerprint(page);
  await applyBotStealth(page);
}

import { randomUUID } from "crypto";
import puppeteer, { type HTTPResponse } from "puppeteer";
import { PROXY_CONFIG } from "../../../../utils/constants";
import { fetchFromEntities } from "../../client";
import { INSTAGRAM_BASE_URL } from "../../constants";
import {
  IG_POPULAR_ERROR_MESSAGES,
  IG_POPULAR_LIMITS,
  IG_POPULAR_PATH_PREFIX,
} from "./constants";
import type {
  IG_POPULAR_REEL_HIT,
  IG_POPULAR_REQUEST,
  IG_POPULAR_RESPONSE,
} from "./types";

function slugifyPopularQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "");
}

function popularPageUrl(query: string): string {
  const slug = slugifyPopularQuery(query);
  return `${INSTAGRAM_BASE_URL}${IG_POPULAR_PATH_PREFIX}${encodeURIComponent(slug)}/`;
}

type DomExtract = {
  title: string;
  reels: IG_POPULAR_REEL_HIT[];
  relatedQueries: string[];
};

async function scrapePopularDom(
  pageUrl: string,
  maxReels: number,
): Promise<DomExtract> {
  const { PROTOCOL, HOSTNAME, PORT, USERNAME, PASSWORD } = PROXY_CONFIG;
  if (!USERNAME || !PASSWORD) {
    throw new Error("Evomi proxy is not configured");
  }

  const sessionId = randomUUID().replace(/-/g, "").slice(0, 12);
  const server = `${PROTOCOL}://${HOSTNAME}:${PORT}`;

  const executablePath = process.env.CHROME_EXECUTABLE_PATH;
  const browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: [
      `--proxy-server=${server}`,
      "--no-sandbox",
      "--ignore-certificate-errors",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.authenticate({
      username: USERNAME,
      password: `${PASSWORD}_session-${sessionId}_country-US`,
    });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    );
    await page.setViewport({ width: 1280, height: 900 });

    const resp: HTTPResponse | null = await page.goto(pageUrl, {
      waitUntil: "networkidle2",
      timeout: IG_POPULAR_LIMITS.navigationTimeoutMs,
    });

    if (!resp || resp.status() >= 400) {
      throw new Error(
        `${IG_POPULAR_ERROR_MESSAGES.PAGE_FAILED} (HTTP ${resp?.status() ?? "none"})`,
      );
    }

    await new Promise((r) => setTimeout(r, 2000));
    // Browser context — avoid DOM lib types in Node tsc.
    await page.evaluate("window.scrollBy(0, 1400)");
    await new Promise((r) => setTimeout(r, 1500));

    const extracted = await page.evaluate((limit: number) => {
      // Typed loosely: this callback runs in Chromium, not Node.
      const doc = (globalThis as unknown as { document: any }).document;
      const reserved = new Set([
        "explore",
        "popular",
        "accounts",
        "reel",
        "reels",
        "p",
        "stories",
        "direct",
        "about",
        "directory",
      ]);

      const reels: Array<{
        username: string;
        shortcode: string;
        reelUrl: string;
        viewsText: string | null;
        captionSnippet: string | null;
      }> = [];
      const seen = new Set<string>();

      for (const a of Array.from(doc.querySelectorAll("a[href*='/reel/']"))) {
        const el = a as { href: string; textContent: string | null; closest: (s: string) => any; parentElement: any };
        const href = el.href;
        const code = href.match(/\/reel\/([A-Za-z0-9_-]+)/)?.[1];
        if (!code || seen.has(code)) continue;
        seen.add(code);

        const root = el.closest("div") ?? el.parentElement;
        const profileHref = Array.from(root?.querySelectorAll("a[href]") ?? [])
          .map((link) => (link as { href: string }).href)
          .find((h) => {
            try {
              const path = new URL(h).pathname;
              const seg = path.split("/").filter(Boolean)[0] ?? "";
              return (
                /^[A-Za-z0-9._]+$/.test(seg) &&
                !reserved.has(seg) &&
                !/\/(reel|p|explore|popular)\//.test(h)
              );
            } catch {
              return false;
            }
          });

        let username = "";
        if (profileHref) {
          username =
            new URL(profileHref).pathname.split("/").filter(Boolean)[0] ?? "";
        }

        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        const views =
          text.match(/([\d.,]+[KMB]?)\s*(?:views?)?/i)?.[1] ?? null;

        reels.push({
          username,
          shortcode: code,
          reelUrl: href.split("?")[0]!,
          viewsText: views,
          captionSnippet: text.slice(0, 200) || null,
        });
        if (reels.length >= limit) break;
      }

      const related = Array.from(doc.querySelectorAll("a[href*='/popular/']"))
        .map((link) => {
          try {
            const path = new URL((link as { href: string }).href).pathname;
            return decodeURIComponent(
              path.replace(/^\/popular\//, "").replace(/\/$/, ""),
            );
          } catch {
            return "";
          }
        })
        .filter(Boolean);

      return {
        title: doc.title as string,
        reels,
        relatedQueries: [...new Set(related as string[])],
      };
    }, maxReels);

    if (/isn't available|Page Not Found/i.test(extracted.title)) {
      throw new Error(IG_POPULAR_ERROR_MESSAGES.PAGE_FAILED);
    }

    return {
      title: extracted.title,
      reels: extracted.reels.filter((r) => r.username && r.shortcode),
      relatedQueries: extracted.relatedQueries,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Native Instagram popular-topic discovery → reel authors as lead handles.
 */
export async function fetchInstagramPopularSearch(
  input: IG_POPULAR_REQUEST,
): Promise<IG_POPULAR_RESPONSE> {
  const query = input.query.trim();
  const maxReels = input.maxReels ?? IG_POPULAR_LIMITS.defaultMaxReels;
  const enrichProfiles = input.enrichProfiles ?? true;
  const country = input.country ?? "IN";
  const pageUrl = popularPageUrl(query);

  const scraped = await scrapePopularDom(pageUrl, maxReels);
  if (scraped.reels.length === 0) {
    throw new Error(IG_POPULAR_ERROR_MESSAGES.EMPTY);
  }

  const usernames = [
    ...new Set(scraped.reels.map((r) => r.username.toLowerCase())),
  ];

  let leads: IG_POPULAR_RESPONSE["leads"] = [];
  if (enrichProfiles && usernames.length > 0) {
    leads = await fetchFromEntities(usernames, country);
  }

  return {
    query,
    pageUrl,
    reels: scraped.reels,
    usernames,
    relatedQueries: scraped.relatedQueries.filter(
      (q) => q.toLowerCase() !== slugifyPopularQuery(query),
    ),
    leads,
    meta: {
      reelCount: scraped.reels.length,
      uniqueHandles: usernames.length,
    },
  };
}

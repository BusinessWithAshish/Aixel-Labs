import { Page } from "puppeteer";
import { config } from "dotenv";
config();

// ============================================================
// USER AGENTS
// ============================================================

export const randomUserAgentGenerator = (): string => {
  const userAgents = [
    // Chrome on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",

    // Chrome on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",

    // Chrome on Linux
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",

    // Firefox on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",

    // Firefox on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13.6; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.1; rv:122.0) Gecko/20100101 Firefox/122.0",

    // Firefox on Linux
    "Mozilla/5.0 (X11; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",

    // Safari on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",

    // Edge on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",

    // Edge on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",

    // Opera on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/106.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/107.0.0.0",

    // Opera on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/106.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/107.0.0.0",

    // Chrome on Android
    "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",

    // Safari on iOS
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",

    // Firefox on Android
    "Mozilla/5.0 (Android 13; Mobile; rv:122.0) Gecko/122.0 Firefox/122.0",
    "Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0",

    // Chrome on ChromeOS
    "Mozilla/5.0 (X11; CrOS x86_64 15509.89.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; CrOS x86_64 15359.58.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",

    // Brave on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Brave/1.61",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Brave/1.60",

    // Vivaldi on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Vivaldi/6.5",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Vivaldi/6.4",

    // Additional Chrome variants
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",

    // Additional Firefox variants
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",

    // Additional Safari variants
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 12_7_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
};

// ============================================================
// RANDOM VIEWPORT GENERATOR (for production)
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
    // Common desktop resolutions
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
    // MacBook resolutions with retina
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
// RANDOM HTTP HEADERS
// ============================================================

export const randomHttpHeaders = (): Record<string, string> => {
  const chromeVersions = ["119", "120", "121", "122", "130", "131"];
  const platforms = ['"macOS"', '"Windows"', '"Linux"'];

  const randomChromeVersion =
    chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
  const randomPlatform =
    platforms[Math.floor(Math.random() * platforms.length)];

  return {
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Sec-Ch-Ua": `"Google Chrome";v="${randomChromeVersion}", "Chromium";v="${randomChromeVersion}", "Not?A_Brand";v="24"`,
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": randomPlatform,
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  };
};

/**
 * Apply stealth techniques to a page to avoid bot detection
 * Based on puppeteer-extra-plugin-stealth techniques
 */
export const pageBotStealthHandler = async (page: Page): Promise<void> => {
  // Must be called before any navigation
  await page.evaluateOnNewDocument(() => {
    // 1. Remove webdriver property
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });

    // 2. Mock chrome.runtime to look like a real browser
    // @ts-ignore
    window.chrome = {
      runtime: {
        connect: () => {},
        sendMessage: () => {},
        onMessage: {
          addListener: () => {},
          removeListener: () => {},
        },
      },
      loadTimes: () => {},
      csi: () => {},
      app: {
        isInstalled: false,
        InstallState: {
          DISABLED: "disabled",
          INSTALLED: "installed",
          NOT_INSTALLED: "not_installed",
        },
        RunningState: {
          CANNOT_RUN: "cannot_run",
          READY_TO_RUN: "ready_to_run",
          RUNNING: "running",
        },
      },
    };

    // 3. Mock plugins array (headless Chrome has empty plugins)
    Object.defineProperty(navigator, "plugins", {
      get: () => [
        {
          name: "Chrome PDF Plugin",
          filename: "internal-pdf-viewer",
          description: "Portable Document Format",
        },
        {
          name: "Chrome PDF Viewer",
          filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
          description: "",
        },
        {
          name: "Native Client",
          filename: "internal-nacl-plugin",
          description: "",
        },
      ],
    });

    // 4. Mock languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });

    // 5. Fix permissions query
    const originalQuery = window.navigator.permissions.query;
    // @ts-ignore
    window.navigator.permissions.query = (parameters: any) =>
      parameters.name === "notifications"
        ? Promise.resolve({
            state: Notification.permission,
          } as PermissionStatus)
        : originalQuery(parameters);

    // 6. Override the `getParameter` function to return non-empty values for WebGL
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter) {
      // UNMASKED_VENDOR_WEBGL
      if (parameter === 37445) {
        return "Intel Inc.";
      }
      // UNMASKED_RENDERER_WEBGL
      if (parameter === 37446) {
        return "Intel Iris OpenGL Engine";
      }
      return getParameter.call(this, parameter);
    };

    // 7. Mock connection type
    Object.defineProperty(navigator, "connection", {
      get: () => ({
        effectiveType: "4g",
        rtt: 100,
        downlink: 10,
        saveData: false,
      }),
    });

    // 8. Mock deviceMemory
    Object.defineProperty(navigator, "deviceMemory", {
      get: () => 8,
    });

    // 9. Mock hardwareConcurrency (CPU cores)
    Object.defineProperty(navigator, "hardwareConcurrency", {
      get: () => 8,
    });

    // 10. Remove Puppeteer-specific properties from Error stack traces
    // Override Error.prepareStackTrace to clean up stack traces
    // @ts-ignore
    if (Error.prepareStackTrace) {
      const originalPrepare = Error.prepareStackTrace;
      // @ts-ignore
      Error.prepareStackTrace = function (error: Error, stack: any[]) {
        const result = originalPrepare(error, stack);
        if (typeof result === "string") {
          return result.replace(/__puppeteer_evaluation_script__/g, "");
        }
        return result;
      };
    }
  });
};

// ============================================================
// REQUEST INTERCEPTION (Combined for all scrapers)
// ============================================================

/**
 * Setup request interception to block unnecessary resources
 * Blocks CSS, fonts, images, media, analytics, tracking, etc.
 * This speeds up page loads significantly
 */
export const pageResourcesRequestInterceptor = async (page: Page): Promise<void> => {
  // Check if request interception is already enabled by checking if there are listeners
  const hasRequestListeners = page.listenerCount('request') > 0;
  
  if (hasRequestListeners) {
    // Request interception already set up, skip
    return;
  }

  await page.setRequestInterception(true);

  page.on("request", (req) => {
    // Check if request is already handled
    if (req.isInterceptResolutionHandled()) {
      return;
    }

    const resourceType = req.resourceType();
    const url = req.url().toLowerCase();

    // Block unnecessary resources for faster loading
    const shouldBlock =
      // Resource types to block
      resourceType === "stylesheet" ||
      resourceType === "font" ||
      resourceType === "image" ||
      resourceType === "media" ||
      resourceType === "texttrack" ||
      resourceType === "eventsource" ||
      resourceType === "websocket" ||
      resourceType === "manifest" ||
      // File extensions to block
      url.endsWith(".css") ||
      url.endsWith(".woff") ||
      url.endsWith(".woff2") ||
      url.endsWith(".ttf") ||
      url.endsWith(".eot") ||
      url.endsWith(".otf") ||
      url.endsWith(".jpg") ||
      url.endsWith(".jpeg") ||
      url.endsWith(".png") ||
      url.endsWith(".gif") ||
      url.endsWith(".webp") ||
      url.endsWith(".svg") ||
      url.endsWith(".ico") ||
      url.endsWith(".mp4") ||
      url.endsWith(".webm") ||
      url.endsWith(".mp3") ||
      // Analytics and tracking to block
      url.includes("google-analytics") ||
      url.includes("googletagmanager") ||
      url.includes("analytics") ||
      url.includes("doubleclick") ||
      url.includes("facebook.com/tr") ||
      url.includes("connect.facebook") ||
      url.includes("facebook.com") ||
      url.includes("twitter.com") ||
      url.includes("ads.") ||
      url.includes("adservice") ||
      url.includes("tracking") ||
      url.includes("pixel") ||
      url.includes("beacon") ||
      url.includes("telemetry") ||
      // Social widgets
      url.includes("platform.twitter") ||
      url.includes("platform.linkedin") ||
      // Other unnecessary resources
      url.includes("recaptcha") ||
      url.includes("gstatic.com/recaptcha");

    try {
      if (shouldBlock) {
        req.abort();
      } else {
        req.continue();
      }
    } catch (error) {
      // Request was already handled, ignore
      console.log("Request already handled, skipping:", url);
    }
  });
};

// ============================================================
// STEALTH APPLY (Generic for any page)
// ============================================================

/**
 * Apply stealth techniques to a page to avoid bot detection
 * - Sets random user agent
 * - Sets random viewport (production only)
 * - Sets random HTTP headers
 * - Applies JavaScript stealth patches
 *
 * MUST be called BEFORE any navigation
 */
export const pageFingerprintRandomizer = async (page: Page): Promise<void> => {
  const isProduction = process.env.NODE_ENV === "production";

  // Set a random user agent
  const userAgent = randomUserAgentGenerator();
  await page.setUserAgent(userAgent);

  // Set random viewport ONLY in production (for more stealth)
  // In development, let the browser window size determine viewport
  if (isProduction) {
    const viewport = randomViewportGenerator();
    await page.setViewport(viewport);
  }

  // Set random HTTP headers
  const headers = randomHttpHeaders();
  await page.setExtraHTTPHeaders(headers);
};

// ============================================================
// PAGE STEALTHER (Combined: Stealth + Request Interception)
// ============================================================

/**
 * Full stealth setup for a page
 * Applies stealth techniques + request interception
 * Call this BEFORE any navigation
 */
export const pageStealther = async (page: Page): Promise<void> => {
  await pageFingerprintRandomizer(page);
  await pageResourcesRequestInterceptor(page);
  await pageBotStealthHandler(page);
};

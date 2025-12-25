import { LaunchOptions, Page } from "puppeteer";
import { config } from "dotenv";
config();

/**
 * Combined browser args for:
 * 1. Performance optimization (faster page loads)
 * 2. Stealth/Anti-detection (avoid bot detection)
 * 3. Resource efficiency (lower memory usage)
 */
export const optimisedBrowserArgs = [
  // === ESSENTIAL: Stability & Sandbox ===
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--no-zygote",

  // === STEALTH: Anti-Bot Detection ===
  "--disable-blink-features=AutomationControlled", // Hides navigator.webdriver
  "--disable-infobars", // Hides "Chrome is being controlled by automated software"
  "--disable-features=IsolateOrigins,site-per-process", // Helps with iframe detection

  // === PERFORMANCE: Speed Optimization ===
  "--disable-gpu",
  "--disable-dev-tools",
  "--disable-extensions",
  "--disable-default-apps",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-background-networking",
  "--disable-sync",
  "--disable-translate",
  "--disable-hang-monitor",
  "--disable-prompt-on-repost",
  "--disable-client-side-phishing-detection",
  "--disable-component-update",
  "--disable-domain-reliability",
  "--disable-features=TranslateUI",
  "--disable-ipc-flooding-protection",

  // === RESOURCE BLOCKING: Faster loads ===
  "--disable-remote-fonts",
  "--blink-settings=imagesEnabled=false",
  "--disable-images",

  // === WINDOW/DISPLAY ===
  "--start-maximized",
  "--hide-scrollbars",
  "--mute-audio",

  // === MEMORY OPTIMIZATION ===
  "--memory-pressure-off",
  "--max-old-space-size=4096",

  // === SSL/SECURITY (for testing only) ===
  "--ignore-certificate-errors",
  "--ignore-ssl-errors",
  "--allow-running-insecure-content",
];

export const getBrowserOptions = async (): Promise<LaunchOptions> => {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    headless: isProduction ? "shell" : false,
    defaultViewport: null,
    executablePath: isProduction ? "/usr/bin/chromium-browser" : undefined,
    args: optimisedBrowserArgs,
    timeout: 60000,
  };
};

/**
 * Apply stealth techniques to a page to avoid bot detection
 * Based on puppeteer-extra-plugin-stealth techniques
 */
export const applyStealthToPage = async (page: Page): Promise<void> => {
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
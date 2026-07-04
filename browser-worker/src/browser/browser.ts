import { existsSync } from "fs";
import { platform } from "os";
import { LaunchOptions } from "puppeteer-core";
import { config } from "dotenv";
import { DEFAULT_BROWSER_TIMEOUT, PROXY_CONFIG } from "./constants";
config();

const DEFAULT_CHROME_PATHS: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ],
};

/** Resolve a locally installed Chrome/Chromium binary (no Puppeteer download needed). */
export const resolveChromeExecutablePath = (): string | undefined => {
  const fromEnv =
    process.env.CHROME_EXECUTABLE_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }

  const candidates = DEFAULT_CHROME_PATHS[platform()] ?? [];
  return candidates.find((path) => existsSync(path));
};

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

type TGetBrowserOptionsProps = {
  customBrowserArgs?: LaunchOptions;
  /** Full proxy URL including credentials, e.g. http://user:pass@host:port */
  proxyUrl?: string;
};

export const getBrowserOptions = async (
  props?: TGetBrowserOptionsProps,
): Promise<LaunchOptions> => {
  const { customBrowserArgs, proxyUrl } = props ?? {};
  const isProduction = process.env.NODE_ENV === "production";
  const { PROTOCOL, HOSTNAME, PORT } = PROXY_CONFIG;

  const args = [...optimisedBrowserArgs];

  if (proxyUrl) {
    args.push(`--proxy-server=${proxyUrl}`);
  } else if (PROTOCOL && HOSTNAME && PORT) {
    args.push(`--proxy-server=${PROTOCOL}://${HOSTNAME}:${PORT}`);
  }

  args.push(...(customBrowserArgs?.args ?? []));

  let executablePath: string | undefined;
  let headless: LaunchOptions["headless"] = false;

  if (isProduction) {
    executablePath = "/usr/bin/chromium";
    headless = "shell";
  } else {
    executablePath = resolveChromeExecutablePath();
    if (!executablePath) {
      console.warn(
        "[browser] No local Chrome found. Install Google Chrome or set CHROME_EXECUTABLE_PATH. " +
          "Falling back to Puppeteer's bundled browser (run `npx puppeteer browsers install chrome`).",
      );
    }
  }

  return {
    headless,
    defaultViewport: null,
    ...(executablePath ? { executablePath } : {}),
    args,
    timeout: DEFAULT_BROWSER_TIMEOUT,
  };
};

export const getPuppeteer = async () => {
  const useSystemChrome =
    process.env.NODE_ENV === "production" || !!resolveChromeExecutablePath();

  if (useSystemChrome) {
    return (await import("puppeteer-core")).default;
  }
  return (await import("puppeteer")).default;
};

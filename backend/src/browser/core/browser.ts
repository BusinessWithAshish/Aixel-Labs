import { existsSync } from "fs";
import { platform } from "os";
import puppeteer, { LaunchOptions } from "puppeteer-core";
import { DEFAULT_BROWSER_TIMEOUT, PROXY_CONFIG } from "../../utils/constants";

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

/** Resolve the Chrome/Chromium installed on this machine; Puppeteer never downloads one here. */
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
  const { PROTOCOL, HOSTNAME, PORT } = PROXY_CONFIG;

  const args = [...optimisedBrowserArgs];

  if (proxyUrl) {
    args.push(`--proxy-server=${proxyUrl}`);
  } else if (PROTOCOL && HOSTNAME && PORT) {
    args.push(`--proxy-server=${PROTOCOL}://${HOSTNAME}:${PORT}`);
  }

  args.push(...(customBrowserArgs?.args ?? []));

  const executablePath = resolveChromeExecutablePath();
  if (!executablePath) {
    throw new Error(
      "[browser] No Chrome found. Install Google Chrome or set CHROME_EXECUTABLE_PATH.",
    );
  }

  return {
    headless: process.env.NODE_ENV === "production",
    defaultViewport: null,
    executablePath,
    args,
    timeout: DEFAULT_BROWSER_TIMEOUT,
  };
};

export const getPuppeteer = async () => puppeteer;

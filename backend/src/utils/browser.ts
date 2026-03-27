import { LaunchOptions } from "puppeteer-core";
import { config } from "dotenv";
import { DEFAULT_BROWSER_TIMEOUT, PROXY_CONFIG } from "./constants";
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

type TGetBrowserOptionsProps = {
  customBrowserArgs?: LaunchOptions;
};

export const getBrowserOptions = async (
  props?: TGetBrowserOptionsProps,
): Promise<LaunchOptions> => {
  const { customBrowserArgs } = props ?? {};
  const isProduction = process.env.NODE_ENV === "production";
  const { PROTOCOL, HOSTNAME, PORT } = PROXY_CONFIG;

  const args = [...optimisedBrowserArgs];
  if (PROTOCOL && HOSTNAME && PORT) {
    args.push(`--proxy-server=${PROTOCOL}://${HOSTNAME}:${PORT}`);
  }
  args.push(...(customBrowserArgs?.args ?? []));

  let executablePath: string | undefined = undefined;
  let headless: LaunchOptions["headless"] = false;

  if (isProduction) {
    const chromium = (await import("@sparticuz/chromium")).default;
    chromium.setGraphicsMode = false;
    executablePath = await chromium.executablePath();
    headless = "shell";
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
  if (process.env.NODE_ENV === "production") {
    return (await import("puppeteer-core")).default;
  }
  return (await import("puppeteer")).default;
};

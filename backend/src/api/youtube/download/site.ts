/**
 * YouTube download through a third-party downloader website, driven in a
 * headed Chrome on the VPS's X display.
 *
 * Why: the InnerTube path pulled every byte of the video through the metered
 * Evomi residential proxy (YouTube walls the VPS's datacenter IP) — one long
 * podcast cost >1.3 GB of it. A downloader site fetches from YouTube on its
 * own servers; the VPS only receives the finished file from the site's CDN,
 * on its own IP. Zero proxy bytes.
 *
 * Why a real browser rather than the sites' APIs: the sites guard their
 * conversion calls with in-page tokens (loader.to attaches a proof-of-work
 * token from /js/shared/pow-token.js). Filling the form and letting the
 * page's own JS run means none of that has to be reverse-engineered or
 * forged. Headed on the Xvfb display like the chatgpt and gemini modules, so
 * a run can be watched through noVNC.
 *
 * What we deliberately do NOT do is click the site's Download button: both
 * sites wire it to an ad pop-under, and a trusted click opens an ad tab
 * instead of the file (seen live, 2026-09-21). We read the finished file's
 * URL off the page and navigate to it, and Chrome's download manager writes
 * it into the target folder (`Browser.setDownloadBehavior`). The form's own
 * submit buttons are clicked from JS — not a user gesture, so Chrome's popup
 * blocker eats most of their ad popups, and any that get through are closed
 * as they open.
 *
 * Each call gets a throwaway Chrome profile and lets Chrome pick its own CDP
 * port (`--remote-debugging-port=0` → `DevToolsActivePort`), so concurrent
 * downloads never share a profile lock and ad cookies never accumulate.
 */

import { spawn, execFile, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";
import WebSocket from "ws";

import { assertBrowserRuntime } from "../../../config";
import { YOUTUBE_VIDEO_URL } from "../constants";
import {
  YOUTUBE_DOWNLOAD_ERROR_MESSAGES,
  YOUTUBE_DOWNLOAD_MEDIA,
  YOUTUBE_DOWNLOAD_TIMEOUT_MS,
  YOUTUBE_SITE_DOWNLOAD,
} from "./constants";
import { YoutubeDownloadError } from "./errors";
import type { YOUTUBE_DOWNLOAD_MEDIA_VALUE } from "./types";

const execFileAsync = promisify(execFile);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A downloader website, described by the page expressions that drive it.
 * Selectors verified live 2026-09-21 from the VPS's Frankfurt IP. Several
 * other sites were tried and dropped: y2mate and ytmp3 redirect German IPs to
 * a "Restricted" page, cobalt.tools has turned YouTube off on its public
 * instance, savefrom.net hands out googlevideo URLs signed to its own IP (403
 * from ours), and ssvid.net routes HD to its desktop app.
 */
type DownloadSite = {
  name: string;
  /** Landing page holding the URL form. */
  url: string;
  /** Page expression: true once the form can actually be submitted. */
  ready: string;
  /** The site's format value for each media kind. */
  format: Record<YOUTUBE_DOWNLOAD_MEDIA_VALUE, string>;
  /** Page expression: fill the form with the video URL and format, then start the conversion. */
  start: (youtubeUrl: string, format: string) => string;
  /** Page expression: the finished file's absolute URL, or null while converting. */
  fileUrl: string;
  /** Page expression: text that changes while the conversion is alive (its percentage). */
  progress: string;
  /** Page expression: the site's own failure message, or null. */
  failure: string;
};

/** Page function: set a form field and fire the events a site's own listeners may read it from. */
const setField = `((selector, value) => {
  const el = document.querySelector(selector);
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
})`;

const SITES: readonly DownloadSite[] = [
  {
    // Conversion is server-side and fast: a 19-min 1080p60 video was ready in
    // ~12 s. Its progress poll never gives up on a video it cannot fetch — it
    // sits at "100%" with no link forever — so the stall timer is what ends
    // that case.
    name: "loader.to",
    url: "https://en.loader.to/",
    ready: `!!document.querySelector("#link") && !document.querySelector("#load")?.disabled`,
    format: { video: "1080", audio: "m4a" },
    start: (youtubeUrl, format) => `(() => {
      ${setField}("#link", ${JSON.stringify(youtubeUrl)});
      ${setField}("#format", ${JSON.stringify(format)});
      document.querySelector("#load").click();
      return true;
    })()`,
    fileUrl: `(() => {
      const a = document.querySelector('a[id$="_downloadLink"]');
      const href = a && a.getAttribute("href");
      return href && /^https?:\\/\\//.test(href) ? href : null;
    })()`,
    progress: `(document.querySelector('[id$="_progress"]') || {}).textContent || ""`,
    // Its failure branch blanks the link and writes the reason into the button.
    failure: `(() => {
      const a = document.querySelector('a[id$="_downloadLink"]');
      const b = document.querySelector('button[id$="_downloadButton"]');
      return a && a.getAttribute("href") === "" ? (b && b.textContent.trim()) || "conversion failed" : null;
    })()`,
  },
  {
    // Slower (the same video took ~100 s, sitting at 0% for the first ~55 s)
    // and it embeds every subtitle track plus a PNG cover as a second video
    // stream — the remux below strips both. The landing URL redirects to a
    // localized path; the form is the same. Its submit button ships disabled
    // and is only enabled once a probe to one of its conversion servers
    // answers, so a form that merely exists is not ready: clicking it early
    // does nothing.
    name: "notube",
    url: "https://notube.lol/",
    ready: `!!document.querySelector("#keyword") && document.querySelector("#submit-button")?.disabled === false`,
    format: { video: "mp4hd", audio: "m4a" },
    start: (youtubeUrl, format) => `(() => {
      ${setField}("#keyword", ${JSON.stringify(youtubeUrl)});
      ${setField}("#myDropdown", ${JSON.stringify(format)});
      document.querySelector("#submit-button").click();
      return true;
    })()`,
    fileUrl: `(() => {
      const a = document.querySelector("#downloadButton");
      return a && /download\\.php/.test(a.getAttribute("href") || "") ? a.href : null;
    })()`,
    progress: `(document.querySelector(".page-title h1") || {}).textContent || ""`,
    // Refusals are redirects: /plus?feature=duration|limitation|unlimited
    // (the free tier's length cap and quotas) or /downloads?...&error=N.
    failure: `/\\/plus\\b|[?&]error=/.test(location.href) ? location.pathname + location.search : null`,
  },
];

type CdpMessage = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message?: string; code?: number };
};

/** Minimal CDP connection that also delivers events (downloads, dialogs, popups). */
class Cdp {
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  private listeners = new Map<string, Set<(params: Record<string, unknown>) => void>>();

  private constructor(private ws: WebSocket) {
    ws.on("message", (raw) => {
      let msg: CdpMessage;
      try {
        msg = JSON.parse(String(raw)) as CdpMessage;
      } catch {
        return;
      }
      if (msg.method) {
        for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params ?? {});
        return;
      }
      const wait = msg.id == null ? undefined : this.pending.get(msg.id);
      if (!wait) return;
      clearTimeout(wait.timer);
      this.pending.delete(msg.id!);
      if (msg.error) wait.reject(new Error(msg.error.message || `CDP error ${msg.error.code}`));
      else wait.resolve(msg.result ?? {});
    });
    ws.on("close", () => this.failPending(new Error("CDP connection closed")));
  }

  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url, { handshakeTimeout: YOUTUBE_SITE_DOWNLOAD.CDP_TIMEOUT_MS });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    return new Cdp(ws);
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs: number = YOUTUBE_SITE_DOWNLOAD.CDP_TIMEOUT_MS,
  ): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Subscribe to a CDP event; returns the unsubscribe. */
  on(method: string, fn: (params: Record<string, unknown>) => void): () => void {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method)!.add(fn);
    return () => this.listeners.get(method)?.delete(fn);
  }

  async js(expression: string): Promise<unknown> {
    const res = await this.send("Runtime.evaluate", { expression, returnByValue: true });
    if (res.exceptionDetails) {
      const desc = (res.result as { description?: string } | undefined)?.description;
      throw new Error(`page JS error: ${desc || "unknown"}`);
    }
    return (res.result as { value?: unknown } | undefined)?.value;
  }

  close(): void {
    this.failPending(new Error("CDP connection closed"));
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }

  private failPending(err: Error): void {
    for (const [, wait] of this.pending) {
      clearTimeout(wait.timer);
      wait.reject(err);
    }
    this.pending.clear();
  }
}

type Chrome = { proc: ChildProcess; profileDir: string; port: string; browser: Cdp };

async function launchChrome(): Promise<Chrome> {
  const profileDir = await mkdtemp(join(tmpdir(), "yt-site-download-"));
  const proc = spawn(
    YOUTUBE_SITE_DOWNLOAD.CHROME_BIN,
    [
      "--remote-debugging-port=0",
      "--remote-debugging-address=127.0.0.1",
      "--remote-allow-origins=*",
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-session-crashed-bubble",
      "--no-sandbox",
      "--mute-audio",
      "--window-size=1440,900",
      "about:blank",
    ],
    { stdio: "ignore", env: { ...process.env, DISPLAY: YOUTUBE_SITE_DOWNLOAD.DISPLAY } },
  );
  const early: { error: Error | null } = { error: null };
  proc.once("exit", (code, signal) => {
    early.error = new Error(`Chrome exited early (code=${code}, signal=${signal})`);
  });
  proc.once("error", (err) => {
    early.error = err;
  });

  try {
    const deadline = Date.now() + YOUTUBE_SITE_DOWNLOAD.LAUNCH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (early.error) throw early.error;
      const active = await readFile(join(profileDir, "DevToolsActivePort"), "utf8").catch(() => "");
      const [port, path] = active.trim().split("\n");
      if (port && path) {
        const browser = await Cdp.connect(`ws://127.0.0.1:${port}${path}`);
        return { proc, profileDir, port, browser };
      }
      await sleep(300);
    }
    throw new Error(`Chrome did not open its DevTools port within ${YOUTUBE_SITE_DOWNLOAD.LAUNCH_TIMEOUT_MS}ms`);
  } catch (err) {
    proc.kill("SIGKILL");
    await rm(profileDir, { recursive: true, force: true });
    throw err;
  }
}

async function closeChrome(chrome: Chrome): Promise<void> {
  const { proc } = chrome;
  const running = () => proc.exitCode === null && proc.signalCode === null;
  if (running()) {
    const gone = new Promise<void>((resolve) => proc.once("exit", () => resolve()));
    await chrome.browser.send("Browser.close", {}, 5_000).catch(() => {});
    await Promise.race([gone, sleep(5_000)]);
    if (running()) proc.kill("SIGKILL");
  }
  chrome.browser.close();
  await rm(chrome.profileDir, { recursive: true, force: true });
}

async function openTab(chrome: Chrome): Promise<{ tab: Cdp; targetId: string }> {
  const { targetId } = (await chrome.browser.send("Target.createTarget", { url: "about:blank" })) as {
    targetId: string;
  };
  const tab = await Cdp.connect(`ws://127.0.0.1:${chrome.port}/devtools/page/${targetId}`);
  return { tab, targetId };
}

/** Evaluate a page expression, treating a navigation in flight as "not yet" (but a dead browser as dead). */
async function peek(tab: Cdp, expression: string): Promise<unknown> {
  try {
    return await tab.js(expression);
  } catch (err) {
    if (err instanceof Error && err.message.includes("connection closed")) throw err;
    return null;
  }
}

/** Load the site, start the conversion, and wait for the finished file's URL. */
async function convertOnSite(
  tab: Cdp,
  site: DownloadSite,
  youtubeUrl: string,
  media: YOUTUBE_DOWNLOAD_MEDIA_VALUE,
): Promise<string> {
  // A site that reports failure with alert() would freeze every later
  // evaluate until the dialog closes — accept it and keep its text.
  const said: { dialog: string | null } = { dialog: null };
  tab.on("Page.javascriptDialogOpening", (params) => {
    said.dialog = String(params.message ?? "dialog");
    void tab.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
  });
  await tab.send("Page.enable");
  await tab.send("Page.navigate", { url: site.url });

  const readyBy = Date.now() + YOUTUBE_SITE_DOWNLOAD.PAGE_READY_TIMEOUT_MS;
  while (!(await peek(tab, site.ready))) {
    if (Date.now() > readyBy) throw new Error("its form never became ready");
    await sleep(YOUTUBE_SITE_DOWNLOAD.POLL_MS);
  }
  await tab.js(site.start(youtubeUrl, site.format[media]));

  const state = `({ url: ${site.fileUrl}, progress: ${site.progress}, failure: ${site.failure} })`;
  const giveUpAt = Date.now() + YOUTUBE_SITE_DOWNLOAD.CONVERT_TIMEOUT_MS;
  let progress = "";
  let changedAt = Date.now();
  while (Date.now() < giveUpAt) {
    await sleep(YOUTUBE_SITE_DOWNLOAD.POLL_MS);
    if (said.dialog) throw new Error(`site said: ${said.dialog}`);
    const now = (await peek(tab, state)) as { url?: string | null; progress?: string; failure?: string | null } | null;
    if (!now) continue;
    if (now.url) return now.url;
    if (now.failure) throw new Error(`site said: ${now.failure}`);
    if (now.progress !== progress) {
      progress = now.progress ?? "";
      changedAt = Date.now();
    } else if (Date.now() - changedAt > YOUTUBE_SITE_DOWNLOAD.CONVERT_STALL_MS) {
      throw new Error(`conversion stalled at ${progress || "0%"}`);
    }
  }
  throw new Error("conversion timed out");
}

/**
 * Navigate the tab to the finished file and let Chrome's download manager
 * write it into `dir`, named by the download's GUID. Resolves with that path
 * once Chrome reports it complete; a download that stops moving is cancelled.
 */
async function saveWithChrome(chrome: Chrome, tab: Cdp, fileUrl: string, dir: string): Promise<string> {
  await chrome.browser.send("Browser.setDownloadBehavior", {
    behavior: "allowAndName",
    downloadPath: dir,
    eventsEnabled: true,
  });
  const dl: { guid: string | null; received: number; movedAt: number; done: boolean; error: string | null } = {
    guid: null,
    received: -1,
    movedAt: Date.now(),
    done: false,
    error: null,
  };
  const unsubscribe = [
    chrome.browser.on("Browser.downloadWillBegin", (p) => {
      dl.guid ??= String(p.guid);
    }),
    chrome.browser.on("Browser.downloadProgress", (p) => {
      if (p.guid !== dl.guid) return;
      if (p.state === "completed") dl.done = true;
      else if (p.state === "canceled") dl.error = "Chrome cancelled the download";
      else if (Number(p.receivedBytes) !== dl.received) {
        dl.received = Number(p.receivedBytes);
        dl.movedAt = Date.now();
      }
    }),
  ];

  try {
    // Navigating to an attachment aborts the navigation and starts a download;
    // the navigate call's own result is irrelevant.
    await tab.send("Page.navigate", { url: fileUrl }).catch(() => {});
    const startBy = Date.now() + YOUTUBE_SITE_DOWNLOAD.DOWNLOAD_START_TIMEOUT_MS;
    for (;;) {
      await sleep(500);
      if (dl.done && dl.guid) return join(dir, dl.guid);
      if (dl.error) throw new Error(dl.error);
      if (!dl.guid && Date.now() > startBy) throw new Error("file link did not start a download");
      if (dl.guid && Date.now() - dl.movedAt > YOUTUBE_SITE_DOWNLOAD.DOWNLOAD_STALL_MS) {
        throw new Error(`download stalled at ${dl.received} bytes`);
      }
    }
  } catch (err) {
    if (dl.guid) {
      await chrome.browser.send("Browser.cancelDownload", { guid: dl.guid }).catch(() => {});
      // In flight the file is `<guid>.crdownload`; renamed to `<guid>` on completion.
      await rm(join(dir, dl.guid), { force: true });
      await rm(join(dir, `${dl.guid}.crdownload`), { force: true });
    }
    throw err;
  } finally {
    for (const off of unsubscribe) off();
  }
}

/**
 * Rewrite the site's file as exactly one video + one audio stream (audio only
 * for m4a), stream-copied. Normalizes what the sites add around the media —
 * noTube's dozens of subtitle tracks and a PNG cover that would otherwise be
 * the file's second "video" stream (`0:V` skips cover art), and the video's
 * chapters, which the mp4 muxer would write back as an extra text track — and
 * doubles as validation: a site that served an HTML error page instead of
 * media fails here. Returns the duration ffmpeg read.
 */
async function remux(
  inPath: string,
  outPath: string,
  media: YOUTUBE_DOWNLOAD_MEDIA_VALUE,
): Promise<number> {
  if (!ffmpegPath) throw new Error(YOUTUBE_DOWNLOAD_ERROR_MESSAGES.REMUX_FAILED);
  const streams =
    media === YOUTUBE_DOWNLOAD_MEDIA.AUDIO ? ["-map", "0:a:0", "-vn"] : ["-map", "0:V:0", "-map", "0:a:0"];
  const partPath = `${outPath}.part`;
  let stderr = "";
  try {
    ({ stderr } = await execFileAsync(
      ffmpegPath,
      [
        "-hide_banner",
        "-y",
        "-i",
        inPath,
        ...streams,
        "-map_chapters",
        "-1",
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        partPath,
      ],
      { maxBuffer: 10 * 1024 * 1024, timeout: YOUTUBE_DOWNLOAD_TIMEOUT_MS },
    ));
  } catch (err) {
    await rm(partPath, { force: true });
    const detail = (err as { stderr?: string }).stderr?.trim().split("\n").pop() ?? String(err);
    throw new Error(`${YOUTUBE_DOWNLOAD_ERROR_MESSAGES.REMUX_FAILED}: ${detail}`);
  }
  await rename(partPath, outPath);
  const hms = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  return hms ? Math.round(Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])) : 0;
}

/**
 * Download `videoId` through the first downloader site that delivers it, and
 * write it to `outPath` (mp4 for video, m4a for audio). Sites are tried in
 * order in one throwaway Chrome; a site failing at any step — including
 * handing over a file that is not media — moves on to the next. Returns the
 * file's duration in seconds.
 */
export async function downloadYoutubeViaSite(
  videoId: string,
  media: YOUTUBE_DOWNLOAD_MEDIA_VALUE,
  outPath: string,
  dir: string,
): Promise<number> {
  assertBrowserRuntime(YOUTUBE_DOWNLOAD_ERROR_MESSAGES.NOT_VPS, YOUTUBE_SITE_DOWNLOAD.DISPLAY);
  const youtubeUrl = YOUTUBE_VIDEO_URL(videoId);
  const chrome = await launchChrome();
  // Ad popups that slip past the popup blocker: close each as it opens, so
  // nothing plays or piles up on the shared VNC display.
  await chrome.browser.send("Target.setDiscoverTargets", { discover: true });
  chrome.browser.on("Target.targetCreated", (p) => {
    const info = p.targetInfo as { targetId?: string; type?: string; openerId?: string } | undefined;
    if (info?.type === "page" && info.openerId && info.targetId) {
      void chrome.browser.send("Target.closeTarget", { targetId: info.targetId }).catch(() => {});
    }
  });

  const failures: string[] = [];
  try {
    for (const site of SITES) {
      const { tab, targetId } = await openTab(chrome);
      let savedPath: string | null = null;
      try {
        const fileUrl = await convertOnSite(tab, site, youtubeUrl, media);
        savedPath = await saveWithChrome(chrome, tab, fileUrl, dir);
        return await remux(savedPath, outPath, media);
      } catch (err) {
        failures.push(`${site.name}: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (savedPath) await rm(savedPath, { force: true });
        tab.close();
        await chrome.browser.send("Target.closeTarget", { targetId }).catch(() => {});
      }
    }
  } finally {
    await closeChrome(chrome);
  }
  throw new YoutubeDownloadError(
    `${YOUTUBE_DOWNLOAD_ERROR_MESSAGES.ALL_SITES_FAILED} — ${failures.join("; ")}`,
    502,
  );
}

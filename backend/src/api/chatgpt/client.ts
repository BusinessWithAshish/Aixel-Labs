/**
 * Orchestration: preflight → ChatGPT generate via CDP → stage public JPEG.
 * Port of sova/skills/chatgpt/{preflight,generate}.py + media staging.
 */
import { randomBytes } from "node:crypto";
import { promises as fs, constants as fsConstants } from "node:fs";
import { basename } from "node:path";

import sharp from "sharp";
import { fetch } from "undici";

import { assertBrowserRuntime } from "../../config";
import {
  closeChatGptChrome,
  launchChatGptChrome,
  openNewTab,
  type ChromeHandle,
  type CdpTab,
} from "./cdp";
import { CHATGPT, CHATGPT_ERROR_MESSAGES } from "./constants";
import type {
  CHATGPT_HEALTH_RESPONSE,
  CHATGPT_REQUEST_PARSED,
  CHATGPT_RESPONSE,
} from "./types";

let busy = false;

export function isChatGptBusy(): boolean {
  return busy;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkChromeBinary(): Promise<{ ok: boolean; detail: string }> {
  try {
    await fs.access(CHATGPT.CHROME_BIN, fsConstants.X_OK);
    return { ok: true, detail: CHATGPT.CHROME_BIN };
  } catch {
    return { ok: false, detail: `not found or not executable: ${CHATGPT.CHROME_BIN}` };
  }
}

async function checkProfileDir(): Promise<{ ok: boolean; detail: string }> {
  try {
    await fs.access(CHATGPT.PROFILE_DIR);
    return { ok: true, detail: CHATGPT.PROFILE_DIR };
  } catch {
    return { ok: false, detail: `profile directory missing: ${CHATGPT.PROFILE_DIR}` };
  }
}

/** Real end-to-end check: spawns Chrome, verifies the session, closes it. Slower (a few seconds) but honest. */
async function checkBrowserSpawnAndLogin(): Promise<{ ok: boolean; detail: string }> {
  let chrome: ChromeHandle | undefined;
  let tab: CdpTab | undefined;
  try {
    chrome = await launchChatGptChrome();
    tab = await openNewTab(CHATGPT.CDP_HTTP, "https://chatgpt.com");
    // openNewTab's navigation is fire-and-forget (the target may still be on
    // about:blank when it returns) — wait for the real document before
    // evaluating, same reason openChat() polls for the composer.
    for (let i = 0; i < 30; i++) {
      const loaded = await tab.js("document.readyState === 'complete' && location.hostname.includes('chatgpt.com')");
      if (loaded) break;
      await sleep(500);
    }
    const ok = await tab.js(
      `(async () => {
        const r = await fetch('/api/auth/session', {credentials:'include'});
        const s = await r.json();
        return !!s.accessToken;
      })()`,
      { timeoutMs: 30_000, awaitPromise: true },
    );
    if (ok) return { ok: true, detail: "browser launches and session is authenticated" };
    return {
      ok: false,
      detail:
        "browser launches but ChatGPT session is logged out — sign in via VNC into the profile dir, or copy in a logged-in profile",
    };
  } catch (err) {
    return {
      ok: false,
      detail: `browser launch/check failed: ${err instanceof Error ? err.message : err}`,
    };
  } finally {
    tab?.close();
    if (chrome) await closeChatGptChrome(chrome);
  }
}

export async function runChatGptHealth(): Promise<CHATGPT_HEALTH_RESPONSE> {
  assertBrowserRuntime(CHATGPT_ERROR_MESSAGES.NOT_VPS, CHATGPT.DISPLAY);
  const checks: CHATGPT_HEALTH_RESPONSE["checks"] = [];

  const staticRunners: [string, () => Promise<{ ok: boolean; detail: string }>][] = [
    ["chrome binary", checkChromeBinary],
    ["profile directory", checkProfileDir],
  ];
  for (const [name, fn] of staticRunners) {
    const result = await fn();
    checks.push({ name, ok: result.ok, detail: result.detail });
    if (!result.ok) return { ready: false, checks };
  }

  if (busy) {
    checks.push({
      name: "browser",
      ok: true,
      detail: "skipped — a generate call is already in progress",
    });
    return { ready: true, checks };
  }

  busy = true;
  try {
    const result = await checkBrowserSpawnAndLogin();
    checks.push({ name: "browser", ok: result.ok, detail: result.detail });
    return { ready: result.ok, checks };
  } finally {
    busy = false;
  }
}

async function chatgptApiGet(
  tab: CdpTab,
  path: string,
  timeoutMs = 120_000,
): Promise<unknown> {
  const out = (await tab.js(
    `(async () => {
      const s = await (await fetch('/api/auth/session', {credentials:'include'})).json();
      if (!s.accessToken) return '0|no access token in /api/auth/session';
      const r = await fetch(${JSON.stringify(path)}, {credentials:'include',
        headers:{'Authorization':'Bearer ' + s.accessToken}});
      return r.status + '|' + (await r.text());
    })()`,
    { timeoutMs, awaitPromise: true },
  )) as string;
  const status = out.slice(0, out.indexOf("|"));
  const body = out.slice(out.indexOf("|") + 1);
  if (status !== "200") {
    throw new Error(`GET ${path} -> HTTP ${status}: ${body.slice(0, 300)}`);
  }
  return JSON.parse(body);
}

async function openChat(tab: CdpTab, url: string): Promise<void> {
  await tab.send("Page.navigate", { url });
  for (let i = 0; i < CHATGPT.COMPOSER_WAIT_SEC; i++) {
    await sleep(1000);
    const ready = await tab.js(
      `!!document.querySelector(${JSON.stringify(CHATGPT.COMPOSER_SELECTOR)})`,
    );
    if (ready) {
      await sleep(2000);
      return;
    }
  }
  throw new Error(
    `composer never appeared at ${url} after ${CHATGPT.COMPOSER_WAIT_SEC}s ` +
      `(selector ${CHATGPT.COMPOSER_SELECTOR}). The page may be logged in but ` +
      `the composer selector is stale (ChatGPT changed its DOM), or the ` +
      `${CHATGPT.PROFILE_DIR} session is logged out — check via VNC on ${CHATGPT.DISPLAY}.`,
  );
}

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** The real type of an attachment. Everything used to go up labelled PNG, which mislabels every JPEG avatar or reference frame. */
function imageMime(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "image/png";
  return IMAGE_MIME_BY_EXT[path.slice(dot).toLowerCase()] ?? "image/png";
}

/** Attaches every path in one DataTransfer so all images land on the same message. */
async function attachImages(tab: CdpTab, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const files = await Promise.all(
    paths.map(async (p) => ({
      name: basename(p),
      type: imageMime(p),
      b64: (await fs.readFile(p)).toString("base64"),
    })),
  );
  const result = await tab.js(
    `(() => {
      const files = ${JSON.stringify(files)};
      const dt = new DataTransfer();
      for (const f of files) {
        const bin = atob(f.b64);
        const arr = new Uint8Array(bin.length);
        for (let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
        dt.items.add(new File([arr], f.name, {type: f.type}));
      }
      const input = [...document.querySelectorAll('input[type=file]')]
                      .find(i => (i.accept||'').includes('image'));
      if (!input) return 'no file input';
      input.files = dt.files;
      input.dispatchEvent(new Event('change', {bubbles:true}));
      return 'ok';
    })()`,
  );
  if (result !== "ok") {
    throw new Error(`attach_images failed: ${String(result)}`);
  }
  await sleep(CHATGPT.ATTACH_SETTLE_MS);
}

async function sendPrompt(tab: CdpTab, prompt: string): Promise<void> {
  await tab.js(
    `document.querySelector(${JSON.stringify(CHATGPT.COMPOSER_SELECTOR)}).focus()`,
  );
  await sleep(300);
  await tab.send("Input.insertText", { text: prompt });
  await sleep(1000);
  const text = await tab.js(
    `document.querySelector(${JSON.stringify(CHATGPT.COMPOSER_SELECTOR)}).innerText`,
  );
  if (!String(text || "").trim()) {
    throw new Error("composer stayed empty after insertText");
  }
  // A REAL mouse event, not element.click(). The untrusted click is ignored by
  // the app while still reporting success, which suppressed the Enter fallback
  // below and left the turn unsent. Same defect was proven and fixed in the
  // gemini module on 2026-09-21.
  const box = (await tab.js(`(() => {
    const b = document.querySelector(${JSON.stringify(CHATGPT.SEND_BUTTON_SELECTOR)});
    if (!b || b.disabled) return '';
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    if (!r.width || !r.height) return '';
    return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  })()`)) as string;
  let clicked = false;
  if (box) {
    const { x, y } = JSON.parse(box) as { x: number; y: number };
    for (const type of ["mousePressed", "mouseReleased"] as const) {
      await tab.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    }
    await sleep(1200);
    // Trust the composer, not the click: text still sitting there means it never sent.
    const left = await tab.js(
      `(() => { const e = document.querySelector(${JSON.stringify(CHATGPT.COMPOSER_SELECTOR)}); return e ? (e.innerText || '').trim().length : 0; })()`,
    );
    clicked = Number(left ?? 0) === 0;
  }
  if (!clicked) {
    for (const type of ["keyDown", "keyUp"] as const) {
      await tab.send("Input.dispatchKeyEvent", {
        type,
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      });
    }
  }
  await sleep(3000);
}

/**
 * The conversation's id AND the URL it actually lives at. A conversation started
 * inside a project lives at /g/g-p-<project>/c/<id>; returning a bare
 * /c/<id> loses which project it belonged to, so the real href is kept.
 */
async function conversationRef(
  tab: CdpTab,
): Promise<{ cid: string; url: string }> {
  const js = `(() => {
    const href = location.href || '';
    const m = href.match(/\\/c\\/([0-9a-fA-F-]{8,})/);
    return m ? (m[1] + '|' + href.split('?')[0]) : '';
  })()`;
  for (let i = 0; i < 60; i++) {
    const out = await tab.js(js);
    if (out) {
      const s = String(out);
      const pipe = s.indexOf("|");
      const cid = s.slice(0, pipe);
      return { cid, url: s.slice(pipe + 1) || `https://chatgpt.com/c/${cid}` };
    }
    await sleep(1000);
  }
  throw new Error("conversation id never appeared in the URL");
}

async function waitUntilDone(
  tab: CdpTab,
  cid: string,
  timeoutSec: number,
): Promise<void> {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    const statusPayload = (await chatgptApiGet(
      tab,
      `/backend-api/conversation/${cid}/stream_status`,
    )) as { status?: string };
    if (statusPayload.status !== "IS_STREAMING") return;
    await sleep(CHATGPT.STREAM_POLL_MS);
  }
  throw new Error(`still streaming after ${timeoutSec}s`);
}

type ImagePart = {
  asset_pointer?: string;
  content_type?: string;
  width?: number;
  height?: number;
  mime_type?: string;
  size_bytes?: number;
  metadata?: { generation?: Record<string, unknown> };
};

type ConvoResult = { text?: string; imagePart?: ImagePart };

/** Walks the conversation for the latest assistant text AND/OR the latest generated image — either or both may be present. */
async function findResult(tab: CdpTab, cid: string): Promise<ConvoResult> {
  const convo = (await chatgptApiGet(
    tab,
    `/backend-api/conversation/${cid}`,
  )) as {
    mapping?: Record<
      string,
      {
        message?: {
          author?: { role?: string };
          content?: {
            content_type?: string;
            parts?: unknown[];
          };
          create_time?: number;
        };
      }
    >;
  };

  let bestImage: ImagePart | null = null;
  let bestImageTime = -Infinity;
  let bestText: string | null = null;
  let bestTextTime = -Infinity;

  for (const node of Object.values(convo.mapping || {})) {
    const msg = node.message;
    if (!msg) continue;
    const role = msg.author?.role;
    const time = msg.create_time ?? 0;
    const content = msg.content;

    if (role === "tool" && content?.content_type === "multimodal_text") {
      for (const part of content.parts || []) {
        if (
          part &&
          typeof part === "object" &&
          (part as ImagePart).content_type === "image_asset_pointer" &&
          time >= bestImageTime
        ) {
          bestImage = part as ImagePart;
          bestImageTime = time;
        }
      }
    }

    if (role === "assistant" && content?.content_type === "text") {
      const joined = (content.parts || [])
        .filter((p): p is string => typeof p === "string")
        .join("\n")
        .trim();
      if (joined && time >= bestTextTime) {
        bestText = joined;
        bestTextTime = time;
      }
    }
  }

  return {
    text: bestText ?? undefined,
    imagePart: bestImage ?? undefined,
  };
}

async function downloadImage(
  tab: CdpTab,
  fileId: string,
): Promise<{ mime: string; bytes: Buffer }> {
  const info = (await chatgptApiGet(
    tab,
    `/backend-api/files/download/${fileId}`,
  )) as { status?: string; download_url?: string };
  if (info.status !== "success" || !info.download_url) {
    throw new Error(`files/download said: ${JSON.stringify(info)}`);
  }
  const payload = (await tab.js(
    `(async () => {
      const r = await fetch(${JSON.stringify(info.download_url)}, {credentials:'include'});
      if (!r.ok) return 'ERR:' + r.status;
      const b = await r.blob();
      const bytes = new Uint8Array(await b.arrayBuffer());
      let s = ''; const chunk = 0x8000;
      for (let i=0;i<bytes.length;i+=chunk)
        s += String.fromCharCode.apply(null, bytes.subarray(i,i+chunk));
      return b.type + '|' + btoa(s);
    })()`,
    {
      timeoutMs: CHATGPT.CDP_DOWNLOAD_TIMEOUT_MS,
      awaitPromise: true,
    },
  )) as string;
  if (payload.startsWith("ERR:")) {
    throw new Error(`in-page fetch of the image failed: HTTP ${payload.slice(4)}`);
  }
  const pipe = payload.indexOf("|");
  const mime = payload.slice(0, pipe);
  const b64 = payload.slice(pipe + 1);
  return { mime, bytes: Buffer.from(b64, "base64") };
}

async function stagePublicJpeg(pngBytes: Buffer): Promise<string> {
  await fs.mkdir(CHATGPT.MEDIA_ROOT, { recursive: true });
  const name = `${randomBytes(24).toString("base64url")}.jpg`;
  const dest = `${CHATGPT.MEDIA_ROOT}/${name}`;
  await sharp(pngBytes).jpeg({ quality: 95 }).toFile(dest);
  return `${CHATGPT.MEDIA_PUBLIC_BASE}/${name}`;
}

function buildPrompt(req: CHATGPT_REQUEST_PARSED): string {
  if (req.mode === "revise" && req.revise_notes?.trim()) {
    return `${req.prompt.trim()}\n\nREVISION NOTES FROM HUMAN:\n${req.revise_notes.trim()}`;
  }
  return req.prompt.trim();
}

export async function generateChatGpt(
  req: CHATGPT_REQUEST_PARSED,
): Promise<CHATGPT_RESPONSE> {
  assertBrowserRuntime(CHATGPT_ERROR_MESSAGES.NOT_VPS, CHATGPT.DISPLAY);
  if (busy) {
    const err = new Error(CHATGPT_ERROR_MESSAGES.BUSY);
    (err as Error & { statusCode?: number }).statusCode = 409;
    throw err;
  }

  busy = true;
  let chrome: ChromeHandle | undefined;
  let tab: CdpTab | undefined;
  try {
    const staticChecks = await Promise.all([checkChromeBinary(), checkProfileDir()]);
    const failedStatic = staticChecks.find((c) => !c.ok);
    if (failedStatic) {
      throw new Error(`${CHATGPT_ERROR_MESSAGES.PREFLIGHT}: ${failedStatic.detail}`);
    }

    chrome = await launchChatGptChrome();
    tab = await openNewTab(CHATGPT.CDP_HTTP);
    // Where the turn happens, in priority order: the conversation being
    // revised, else the project asked for, else a plain chat with no project
    // context at all.
    const openUrl =
      req.mode === "revise" && req.conversation_url
        ? req.conversation_url
        : (req.project_url ?? CHATGPT.NEW_CHAT_URL);
    await openChat(tab, openUrl);

    // Nothing is attached unless the caller asked for it. The brand logo is
    // one organisation's mark and is opt-in for that reason.
    const images = [...(req.images ?? [])];
    if (req.attach_brand_logo) images.push(CHATGPT.LOGO_PATH);
    await attachImages(tab, images);
    const prompt = buildPrompt(req);
    await sendPrompt(tab, prompt);
    const { cid, url: conversationUrl } = await conversationRef(tab);
    await waitUntilDone(
      tab,
      cid,
      req.timeout_seconds ?? CHATGPT.DEFAULT_STREAM_TIMEOUT_SEC,
    );
    const result = await findResult(tab, cid);

    let mediaUrl: string | undefined;
    if (result.imagePart) {
      const pointer = result.imagePart.asset_pointer || "";
      const fileId = pointer.includes("://")
        ? pointer.split("://").slice(1).join("://")
        : pointer;
      if (fileId) {
        const { bytes } = await downloadImage(tab, fileId);
        mediaUrl = await stagePublicJpeg(bytes);
      }
    }

    if (!mediaUrl && !result.text) {
      throw new Error(CHATGPT_ERROR_MESSAGES.NO_RESULT);
    }

    return {
      text: result.text,
      media_url: mediaUrl,
      conversation_url: conversationUrl,
    };
  } finally {
    tab?.close();
    if (chrome) await closeChatGptChrome(chrome);
    busy = false;
  }
}

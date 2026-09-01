/**
 * Orchestration: preflight → ChatGPT generate via CDP → stage public JPEG.
 * Port of sova/skills/chatgpt/{preflight,generate}.py + media staging.
 */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

import { assertVpsRuntime } from "../../config";
import { attachChatGptTab, listCdpTargets, type CdpTab } from "./cdp";
import { CHATGPT, CHATGPT_ERROR_MESSAGES } from "./constants";
import type {
  CHATGPT_HEALTH_RESPONSE,
  CHATGPT_REQUEST_PARSED,
  CHATGPT_RESPONSE,
  CHATGPT_STAGE_REQUEST_PARSED,
  CHATGPT_STAGE_RESPONSE,
} from "./types";

const execFileAsync = promisify(execFile);

let busy = false;

export function isChatGptBusy(): boolean {
  return busy;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkServices(): Promise<{ ok: boolean; detail: string }> {
  const dead: string[] = [];
  for (const svc of CHATGPT.SYSTEMD_SERVICES) {
    try {
      const { stdout } = await execFileAsync("systemctl", ["is-active", svc], {
        encoding: "utf8",
      });
      if (stdout.trim() !== "active") dead.push(svc);
    } catch {
      dead.push(svc);
    }
  }
  if (dead.length) {
    return {
      ok: false,
      detail: `not running: ${dead.join(", ")}. sudo systemctl restart ${dead.join(" ")}`,
    };
  }
  return { ok: true, detail: "all five systemd units active" };
}

async function checkPort(): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${CHATGPT.CDP_HTTP}/json/version`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, detail: `CDP version HTTP ${res.status}` };
    return { ok: true, detail: "CDP port open" };
  } catch (err) {
    return {
      ok: false,
      detail: `port refused (${err instanceof Error ? err.message : err})`,
    };
  }
}

async function checkBrowser(): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${CHATGPT.CDP_HTTP}/json/version`, {
      signal: AbortSignal.timeout(5000),
    });
    const v = (await res.json()) as { Browser?: string };
    return { ok: true, detail: `browser ${v.Browser || "unknown"}` };
  } catch (err) {
    return {
      ok: false,
      detail: `CDP did not answer: ${err instanceof Error ? err.message : err}`,
    };
  }
}

async function checkChatGptTab(): Promise<{ ok: boolean; detail: string }> {
  try {
    const tabs = await listCdpTargets();
    const pages = tabs.filter((t) => t.type === "page");
    if (pages.some((t) => (t.url || "").includes("chatgpt.com"))) {
      return { ok: true, detail: "ChatGPT tab open" };
    }
    return {
      ok: false,
      detail: `no ChatGPT tab open (${pages.length} other page(s)). Open VNC and navigate to chatgpt.com.`,
    };
  } catch (err) {
    return {
      ok: false,
      detail: `could not list tabs: ${err instanceof Error ? err.message : err}`,
    };
  }
}

async function checkLoggedIn(): Promise<{ ok: boolean; detail: string }> {
  let tab: CdpTab | undefined;
  try {
    tab = await attachChatGptTab();
    const ok = await tab.js(
      `(async () => {
        const r = await fetch('/api/auth/session', {credentials:'include'});
        const s = await r.json();
        return !!s.accessToken;
      })()`,
      { timeoutMs: 30_000, awaitPromise: true },
    );
    if (ok) return { ok: true, detail: "ChatGPT session authenticated" };
    return {
      ok: false,
      detail: "ChatGPT is open but logged out. Sign in via VNC.",
    };
  } catch (err) {
    return {
      ok: false,
      detail: `could not verify the session: ${err instanceof Error ? err.message : err}`,
    };
  } finally {
    tab?.close();
  }
}

export async function runChatGptHealth(): Promise<CHATGPT_HEALTH_RESPONSE> {
  assertVpsRuntime(CHATGPT_ERROR_MESSAGES.NOT_VPS);
  const checks: CHATGPT_HEALTH_RESPONSE["checks"] = [];
  const runners: [string, () => Promise<{ ok: boolean; detail: string }>][] = [
    ["services", checkServices],
    ["port", checkPort],
    ["browser", checkBrowser],
    ["chatgpt tab", checkChatGptTab],
    ["session", checkLoggedIn],
  ];
  for (const [name, fn] of runners) {
    const result = await fn();
    checks.push({ name, ok: result.ok, detail: result.detail });
    if (!result.ok) {
      return { ready: false, checks };
    }
  }
  return { ready: true, checks };
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
      "!!document.querySelector('#prompt-textarea')",
    );
    if (ready) {
      await sleep(2000);
      return;
    }
  }
  throw new Error(`composer never appeared at ${url} — still logged in?`);
}

/** Attaches every path in one DataTransfer so all images land on the same message. */
async function attachImages(tab: CdpTab, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const files = await Promise.all(
    paths.map(async (p) => ({
      name: basename(p),
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
        dt.items.add(new File([arr], f.name, {type:"image/png"}));
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
  await sleep(CHATGPT.LOGO_SETTLE_MS);
}

async function sendPrompt(tab: CdpTab, prompt: string): Promise<void> {
  await tab.js("document.querySelector('#prompt-textarea').focus()");
  await sleep(300);
  await tab.send("Input.insertText", { text: prompt });
  await sleep(1000);
  const text = await tab.js(
    "document.querySelector('#prompt-textarea').innerText",
  );
  if (!String(text || "").trim()) {
    throw new Error("composer stayed empty after insertText");
  }
  const clicked = await tab.js(`(() => {
    const b = document.querySelector('#composer-submit-button')
      || document.querySelector('button[data-testid="send-button"]')
      || document.querySelector('button[aria-label="Send prompt"]');
    if (!b || b.disabled) return false;
    b.click();
    return true;
  })()`);
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

async function conversationId(tab: CdpTab): Promise<string> {
  const js = `(() => {
    const href = location.href || '';
    const m = href.match(/\\/c\\/([0-9a-fA-F-]{8,})/);
    return m ? m[1] : '';
  })()`;
  for (let i = 0; i < 60; i++) {
    const cid = await tab.js(js);
    if (cid) return String(cid);
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
  assertVpsRuntime(CHATGPT_ERROR_MESSAGES.NOT_VPS);
  if (busy) {
    const err = new Error(CHATGPT_ERROR_MESSAGES.BUSY);
    (err as Error & { statusCode?: number }).statusCode = 409;
    throw err;
  }

  busy = true;
  let tab: CdpTab | undefined;
  try {
    const health = await runChatGptHealth();
    if (!health.ready) {
      const failed = health.checks.find((c) => !c.ok);
      throw new Error(
        `${CHATGPT_ERROR_MESSAGES.PREFLIGHT}: ${failed?.name} — ${failed?.detail}`,
      );
    }

    tab = await attachChatGptTab();
    const openUrl =
      req.mode === "revise" && req.conversation_url
        ? req.conversation_url
        : req.project_url;
    await openChat(tab, openUrl);

    const images = req.images ?? [CHATGPT.LOGO_PATH];
    await attachImages(tab, images);
    const prompt = buildPrompt(req);
    await sendPrompt(tab, prompt);
    const cid = await conversationId(tab);
    await waitUntilDone(
      tab,
      cid,
      CHATGPT.DEFAULT_STREAM_TIMEOUT_SEC,
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
      conversation_url: `https://chatgpt.com/c/${cid}`,
    };
  } finally {
    tab?.close();
    busy = false;
  }
}

const STAGE_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Downloads a public image URL (e.g. an Instagram post image) to a private
 * local file so it can be viewed with the Read tool and/or passed into a
 * later generate() call's images[]. Not CDP-driven — a plain server-side
 * fetch, so it does not touch the shared ChatGPT tab/session.
 */
export async function stageChatGptReferenceImage(
  req: CHATGPT_STAGE_REQUEST_PARSED,
): Promise<CHATGPT_STAGE_RESPONSE> {
  assertVpsRuntime(CHATGPT_ERROR_MESSAGES.NOT_VPS);
  const res = await fetch(req.url, {
    signal: AbortSignal.timeout(CHATGPT.STAGE_FETCH_TIMEOUT_MS),
  }).catch(() => null);
  if (!res || !res.ok) {
    throw new Error(CHATGPT_ERROR_MESSAGES.STAGE_FETCH_FAILED);
  }

  const contentType = (res.headers.get("content-type") || "").split(";")[0]!.trim();
  const extension = STAGE_EXTENSION_BY_CONTENT_TYPE[contentType];
  if (!extension) {
    throw new Error(CHATGPT_ERROR_MESSAGES.STAGE_NOT_IMAGE);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > CHATGPT.STAGE_MAX_BYTES) {
    throw new Error(CHATGPT_ERROR_MESSAGES.STAGE_TOO_LARGE);
  }

  await fs.mkdir(CHATGPT.STAGE_ROOT, { recursive: true });
  const name = `${randomBytes(16).toString("hex")}.${extension}`;
  const dest = `${CHATGPT.STAGE_ROOT}/${name}`;
  await fs.writeFile(dest, buf);

  return { path: dest, content_type: contentType, size_bytes: buf.byteLength };
}

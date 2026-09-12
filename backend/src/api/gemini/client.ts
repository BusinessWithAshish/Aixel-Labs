/**
 * Orchestration for one Gemini web turn: launch the module's own headful
 * Chrome → open (or resume) a gemini.google.com chat → attach any input
 * images/videos → submit the prompt via the real composer → read back the
 * assistant text, generated image(s) and/or video → stage media to public
 * disk. Text/image/video in, text/image/video out.
 *
 * The browser is Gemini's own instance (separate profile + CDP port from the
 * chatgpt module), so this never contends with a chatgpt call. `busy`
 * serializes Gemini's own calls so two spawns never race for its profile dir.
 */
import { randomBytes } from "node:crypto";
import { promises as fs, constants as fsConstants } from "node:fs";
import { basename, extname } from "node:path";

import {
  closeGeminiChrome,
  ensureGeminiProfileSeeded,
  launchGeminiChrome,
  openNewTab,
  type CdpTab,
  type ChromeHandle,
} from "./cdp";
import { GEMINI, GEMINI_ERROR_MESSAGES } from "./constants";
import type {
  GEMINI_HEALTH_RESPONSE,
  GEMINI_MEDIA,
  GEMINI_REQUEST_PARSED,
  GEMINI_RESPONSE,
} from "./types";
import { assertBrowserRuntime } from "../../config";

let busy = false;

export function isGeminiBusy(): boolean {
  return busy;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const S = (v: string) => JSON.stringify(v); // safe embed of a selector/string into in-page JS

async function checkChromeBinary(): Promise<{ ok: boolean; detail: string }> {
  try {
    await fs.access(GEMINI.CHROME_BIN, fsConstants.X_OK);
    return { ok: true, detail: GEMINI.CHROME_BIN };
  } catch {
    return { ok: false, detail: `not found or not executable: ${GEMINI.CHROME_BIN}` };
  }
}

/** Navigate to the app (or a specific conversation) and wait for a logged-in composer. */
async function openChat(tab: CdpTab, url: string): Promise<void> {
  await tab.send("Page.navigate", { url });
  for (let i = 0; i < GEMINI.COMPOSER_WAIT_SEC; i++) {
    await sleep(1000);
    const ready = await tab
      .js(
        `document.readyState === 'complete' && !!(window.WIZ_global_data && window.WIZ_global_data.SNlM0e) && !!document.querySelector(${S(GEMINI.EDITOR_SELECTOR)})`,
      )
      .catch(() => false);
    if (ready) {
      await sleep(1500);
      return;
    }
  }
  // Distinguish logged-out from a slow load so the caller gets a useful error.
  const loggedIn = await tab
    .js(`!!(window.WIZ_global_data && window.WIZ_global_data.SNlM0e)`)
    .catch(() => false);
  throw new Error(loggedIn ? `composer never appeared at ${url}` : GEMINI_ERROR_MESSAGES.LOGGED_OUT);
}

function mimeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".mp4" || ext === ".mov" || ext === ".webm") return `video/${ext.slice(1)}`;
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

/** Open the "Upload and tools" menu, drop every attachment onto the file input, and wait for upload. */
async function attachFiles(tab: CdpTab, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const files = await Promise.all(
    paths.map(async (p) => ({
      name: basename(p),
      type: mimeFor(p),
      b64: (await fs.readFile(p)).toString("base64"),
    })),
  );

  const opened = await tab.js(
    `(() => { const b = document.querySelector(${S(GEMINI.UPLOAD_BUTTON_SELECTOR)}); if (!b) return false; b.click(); return true; })()`,
  );
  if (!opened) throw new Error("could not open the Upload and tools menu");
  await sleep(GEMINI.MENU_SETTLE_MS);

  const result = await tab.js(
    `(() => {
      const files = ${JSON.stringify(files)};
      const dt = new DataTransfer();
      for (const f of files) {
        const bin = atob(f.b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        dt.items.add(new File([arr], f.name, { type: f.type }));
      }
      const inp = [...document.querySelectorAll('input[type=file]')].pop();
      if (!inp) return 'no file input';
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    })()`,
  );
  if (result !== "ok") throw new Error(`attach failed: ${String(result)}`);
  // Videos are larger and take longer to finish uploading before send re-enables.
  const hasVideo = files.some((f) => f.type.startsWith("video/"));
  await sleep(GEMINI.UPLOAD_SETTLE_MS * (hasVideo ? 2 : 1));
  // Uploading video content pops a one-time "reminder about creating videos" modal.
  await dismissDialogs(tab);
}

/**
 * Dismiss a Gemini consent/reminder modal by clicking its affirmative button
 * (e.g. the "A reminder about creating videos" dialog shown the first time you
 * upload video content — it blocks send until agreed). Scoped to dialog
 * containers and exact button labels so it can never misclick a page control.
 * Returns the label it clicked, or "".
 */
async function dismissDialogs(tab: CdpTab): Promise<string> {
  return String(
    (await tab
      .js(
        `(() => {
          const scopes = [...document.querySelectorAll('[role=dialog], mat-dialog-container, .cdk-dialog-container, .cdk-overlay-container')];
          const labels = /^(agree|i agree|got it|continue|accept)$/i;
          for (const sc of scopes) {
            const b = [...sc.querySelectorAll('button, [role=button]')].find(x => labels.test((x.innerText || '').trim()));
            if (b) { b.click(); return (b.innerText || '').trim(); }
          }
          return '';
        })()`,
      )
      .catch(() => "")) || "",
  );
}

async function clickSend(tab: CdpTab): Promise<boolean> {
  return Boolean(
    await tab.js(
      `(() => { const b = document.querySelector(${S(GEMINI.SEND_SELECTOR)}); if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return false; b.click(); return true; })()`,
    ),
  );
}

async function sendPrompt(tab: CdpTab, prompt: string): Promise<void> {
  await dismissDialogs(tab); // a modal from a prior upload can block the composer
  await tab.js(`document.querySelector(${S(GEMINI.EDITOR_SELECTOR)}).focus()`);
  await sleep(300);
  await tab.send("Input.insertText", { text: prompt });
  await sleep(1000);
  const text = await tab.js(`document.querySelector(${S(GEMINI.EDITOR_SELECTOR)}).innerText`);
  if (!String(text || "").trim()) throw new Error("composer stayed empty after insertText");

  // Send can be intercepted by a consent modal (video uploads) — click, clear
  // any dialog, and retry a couple of times before falling back to Enter.
  let submitted = false;
  for (let attempt = 0; attempt < 3 && !submitted; attempt++) {
    submitted = await clickSend(tab);
    await sleep(1000);
    const dialog = await dismissDialogs(tab);
    if (dialog) {
      await sleep(800);
      submitted = await clickSend(tab); // the click that Agree unblocked
    }
  }
  if (!submitted) {
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
  await sleep(2500);
}

type TurnState = {
  text: string;
  imgs: number;
  vids: number;
  stop: boolean;
  videoGen: boolean;
  blocked: boolean;
  loggedOut: boolean;
};

const TURN_STATE_JS = `(() => {
  const resp = document.querySelectorAll(${S(GEMINI.RESPONSE_SELECTOR)});
  const last = resp.length ? resp[resp.length - 1] : null;
  const text = last ? (last.innerText || '').trim() : '';
  const imgs = last ? [...last.querySelectorAll('img')].filter(i => i.naturalWidth > 200 && /generat/i.test(i.alt || '')).length : 0;
  const vids = [...document.querySelectorAll('video')].filter(v => v.src || v.querySelector('source')).length;
  const stop = !!document.querySelector(${S(GEMINI.STOP_SELECTOR)});
  const body = document.body ? document.body.innerText : '';
  const videoGen = /Generating your video|creating your video|could take a few minutes/i.test(body);
  const blocked = /unusual traffic|verify you|something went wrong|try again later/i.test(body);
  const loggedOut = !(window.WIZ_global_data && window.WIZ_global_data.SNlM0e);
  return { text, imgs, vids, stop, videoGen, blocked, loggedOut };
})()`;

/** Wait for a text/image turn to finish, or detect that Gemini has started an async video. */
async function waitForTurn(
  tab: CdpTab,
  timeoutSec: number,
): Promise<TurnState> {
  const started = Date.now();
  let last: TurnState = {
    text: "",
    imgs: 0,
    vids: 0,
    stop: false,
    videoGen: false,
    blocked: false,
    loggedOut: false,
  };
  const deadline = started + timeoutSec * 1000;
  while (Date.now() < deadline) {
    await sleep(GEMINI.TURN_POLL_MS);
    last = (await tab.js(TURN_STATE_JS)) as TurnState;
    if (last.loggedOut) throw new Error(GEMINI_ERROR_MESSAGES.LOGGED_OUT);
    if (last.videoGen || last.vids > 0) return last; // hand off to video polling
    const elapsed = Date.now() - started;
    if (!last.stop && elapsed > 4000 && (last.text || last.imgs > 0)) return last;
  }
  return last;
}

/** Poll a conversation (reloading it) until the finished <video> appears. */
async function pollForVideo(tab: CdpTab, url: string, timeoutSec: number): Promise<void> {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    const vids = (await tab
      .js(
        `[...document.querySelectorAll('video')].filter(v => v.src || v.querySelector('source')).length`,
      )
      .catch(() => 0)) as number;
    if (vids > 0) return;
    await sleep(GEMINI.VIDEO_POLL_MS);
    await openChat(tab, url).catch(() => {});
  }
  throw new Error(`video still not ready after ${timeoutSec}s`);
}

function stageName(ext: string): { dest: string; url: string } {
  const name = `${randomBytes(24).toString("base64url")}.${ext}`;
  return { dest: `${GEMINI.MEDIA_ROOT}/${name}`, url: `${GEMINI.MEDIA_PUBLIC_BASE}/${name}` };
}

/** Read generated images out via an in-page canvas (blob:/lh3 URLs can't be fetched directly). */
async function extractImages(tab: CdpTab): Promise<string[]> {
  const b64s = (await tab.js(
    `(() => {
      const resp = document.querySelectorAll(${S(GEMINI.RESPONSE_SELECTOR)});
      const last = resp.length ? resp[resp.length - 1] : null;
      if (!last) return [];
      const imgs = [...last.querySelectorAll('img')].filter(i => i.naturalWidth > 200 && /generat/i.test(i.alt || ''));
      return imgs.map(img => {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        cv.getContext('2d').drawImage(img, 0, 0);
        return cv.toDataURL('image/png').split(',')[1];
      });
    })()`,
  )) as string[];
  await fs.mkdir(GEMINI.MEDIA_ROOT, { recursive: true });
  const urls: string[] = [];
  for (const b64 of b64s || []) {
    if (!b64) continue;
    const { dest, url } = stageName("png");
    await fs.writeFile(dest, Buffer.from(b64, "base64"));
    urls.push(url);
  }
  return urls;
}

/** Read the finished video out via an in-page credentialed fetch of its src. */
async function extractVideo(tab: CdpTab): Promise<string | null> {
  const out = (await tab.js(
    `(async () => {
      const v = [...document.querySelectorAll('video')].find(v => v.src || v.querySelector('source'));
      if (!v) return null;
      const src = v.src || v.querySelector('source').src;
      const r = await fetch(src, { credentials: 'include' });
      if (!r.ok) return { error: 'HTTP ' + r.status };
      const b = await r.blob();
      const buf = new Uint8Array(await b.arrayBuffer());
      let s = ''; const c = 0x8000;
      for (let i = 0; i < buf.length; i += c) s += String.fromCharCode.apply(null, buf.subarray(i, i + c));
      return { type: b.type, b64: btoa(s) };
    })()`,
    { timeoutMs: GEMINI.CDP_MEDIA_FETCH_TIMEOUT_MS, awaitPromise: true },
  )) as { type?: string; b64?: string; error?: string } | null;
  if (!out || out.error || !out.b64) return null;
  await fs.mkdir(GEMINI.MEDIA_ROOT, { recursive: true });
  const { dest, url } = stageName("mp4");
  await fs.writeFile(dest, Buffer.from(out.b64, "base64"));
  return url;
}

async function conversationId(tab: CdpTab): Promise<string> {
  const href = String(await tab.js("location.href").catch(() => "")) || "";
  const m = href.match(/\/app\/([0-9a-fA-F]+)/);
  return m ? m[1] : "";
}

async function modelLabel(tab: CdpTab): Promise<string | undefined> {
  const label = await tab
    .js(
      `(() => { const el = document.querySelector('[data-test-id*="model" i], [class*="model-name" i]'); const t = el ? (el.innerText || '').trim() : ''; return t && t.length < 40 ? t : ''; })()`,
    )
    .catch(() => "");
  return label ? String(label) : undefined;
}

export async function generateGemini(req: GEMINI_REQUEST_PARSED): Promise<GEMINI_RESPONSE> {
  assertBrowserRuntime(GEMINI_ERROR_MESSAGES.NOT_VPS, GEMINI.DISPLAY);
  if (busy) {
    const err = new Error(GEMINI_ERROR_MESSAGES.BUSY);
    (err as Error & { statusCode?: number }).statusCode = 409;
    throw err;
  }

  // Validate attachment paths before spending a browser launch on them.
  const attachments = [...(req.images ?? []), ...(req.videos ?? [])];
  for (const p of attachments) {
    if (!(await fs.access(p).then(() => true).catch(() => false))) {
      const err = new Error(`${GEMINI_ERROR_MESSAGES.MISSING_FILE}: ${p}`);
      (err as Error & { statusCode?: number }).statusCode = 400;
      throw err;
    }
  }

  busy = true;
  let chrome: ChromeHandle | undefined;
  let tab: CdpTab | undefined;
  try {
    const bin = await checkChromeBinary();
    if (!bin.ok) throw new Error(`${GEMINI_ERROR_MESSAGES.PREFLIGHT}: ${bin.detail}`);

    chrome = await launchGeminiChrome();
    tab = await openNewTab(GEMINI.CDP_HTTP);

    const openUrl =
      req.mode === "resume" && req.conversation_id
        ? `${GEMINI.APP_URL}/${req.conversation_id}`
        : GEMINI.APP_URL;
    await openChat(tab, openUrl);

    await attachFiles(tab, attachments);
    await sendPrompt(tab, req.prompt);

    const turn = await waitForTurn(tab, req.timeout_seconds);
    if (turn.blocked) throw new Error("Gemini showed a block/verification screen — session may be flagged");

    const cid = await conversationId(tab);
    const convoUrl = cid ? `${GEMINI.APP_URL}/${cid}` : openUrl;

    // Video is async: the first turn only says "Generating…". Poll for it when
    // Gemini signalled a video, or the caller explicitly expects one.
    const wantVideo = req.expect === "video" || turn.videoGen;
    if (wantVideo && turn.vids === 0) {
      await pollForVideo(tab, convoUrl, GEMINI.VIDEO_TIMEOUT_SEC);
    }

    const media: GEMINI_MEDIA[] = [];
    for (const url of await extractImages(tab)) media.push({ kind: "image", url });
    const videoUrl = wantVideo || (await tab.js(`!!document.querySelector('video')`).catch(() => false))
      ? await extractVideo(tab)
      : null;
    if (videoUrl) media.push({ kind: "video", url: videoUrl });

    // Re-read final text (a video conversation's caption settles after the poll).
    const finalText = String(
      (await tab
        .js(
          `(() => { const r = document.querySelectorAll(${S(GEMINI.RESPONSE_SELECTOR)}); const l = r.length ? r[r.length - 1] : null; return l ? (l.innerText || '').trim() : ''; })()`,
        )
        .catch(() => turn.text)) || "",
    );

    if (!finalText && media.length === 0) throw new Error(GEMINI_ERROR_MESSAGES.NO_RESULT);

    return {
      text: finalText || undefined,
      media,
      model: await modelLabel(tab),
      conversation_id: cid,
      conversation_url: convoUrl,
    };
  } finally {
    tab?.close();
    if (chrome) await closeGeminiChrome(chrome);
    busy = false;
  }
}

/** Static checks (binary, profile seed) + one real spawn + login check. */
export async function runGeminiHealth(): Promise<GEMINI_HEALTH_RESPONSE> {
  assertBrowserRuntime(GEMINI_ERROR_MESSAGES.NOT_VPS, GEMINI.DISPLAY);
  const checks: GEMINI_HEALTH_RESPONSE["checks"] = [];

  const bin = await checkChromeBinary();
  checks.push({ name: "chrome binary", ok: bin.ok, detail: bin.detail });
  if (!bin.ok) return { ready: false, checks };

  try {
    await ensureGeminiProfileSeeded();
    checks.push({ name: "profile", ok: true, detail: GEMINI.PROFILE_DIR });
  } catch (err) {
    checks.push({
      name: "profile",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    return { ready: false, checks };
  }

  if (busy) {
    checks.push({ name: "browser", ok: true, detail: "skipped — a generate call is in progress" });
    return { ready: true, checks };
  }

  busy = true;
  let chrome: ChromeHandle | undefined;
  let tab: CdpTab | undefined;
  try {
    chrome = await launchGeminiChrome();
    tab = await openNewTab(GEMINI.CDP_HTTP);
    await openChat(tab, GEMINI.APP_URL);
    checks.push({ name: "browser", ok: true, detail: "launches and gemini.google.com is signed in" });
    return { ready: true, checks };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push({ name: "browser", ok: false, detail: msg });
    return { ready: false, checks };
  } finally {
    tab?.close();
    if (chrome) await closeGeminiChrome(chrome);
    busy = false;
  }
}

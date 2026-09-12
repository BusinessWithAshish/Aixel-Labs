import { AIXEL_MEDIA } from "../../media";

/**
 * Gemini via the VPS headful Chrome — text/image/video in, text/image/video out,
 * on the logged-in gemini.google.com session (the flat Google AI subscription,
 * not the metered Gemini API).
 *
 * Runs in its OWN Chrome instance (separate profile copy + separate CDP port)
 * so it never contends with the `chatgpt` module's browser — the two modules
 * spawn independent browsers against independent profile dirs and can run at
 * the same time. The Gemini profile is seeded once from an existing
 * logged-in Chrome profile (SEED_PROFILE_DIR); login then persists in
 * PROFILE_DIR across spawns exactly like `chatgpt`.
 *
 * WHY DOM-SUBMIT INSTEAD OF A FORGED REQUEST
 * Gemini's own page JS builds every StreamGenerate request, including a fresh
 * ~1.5KB per-request anti-abuse token. We type into the composer and click
 * send so what Google receives is byte-for-byte a real click; we only READ the
 * result back (assistant text from the DOM, generated images via an in-page
 * canvas, generated video via an in-page fetch). We never fabricate the
 * request or its token.
 */

export const GEMINI_ROUTES = {
  GENERATE: "/",
  HEALTH: "/health",
} as const;

export const GEMINI_EXPECT = ["auto", "text", "image", "video"] as const;
export const GEMINI_MODES = ["new", "resume"] as const;

export const GEMINI_FIELD_DESCRIPTIONS = {
  prompt:
    "Full prompt — a chat question, an image-generation brief, a video brief, or an instruction over attached media. For a video ask, phrase it as a video (e.g. 'Create a short video: …') so Gemini routes it to Veo.",
  mode: "'new' opens a fresh Gemini chat; 'resume' continues an existing conversation_id.",
  conversation_id:
    "Required when mode=resume. The id from a prior response (the /app/<id> segment) — used to continue that conversation (e.g. iterate on a generated image or extend a video).",
  images:
    "Absolute local file paths attached as real input images, in order (e.g. a reference photo, a frame to edit). Omit or pass [] for none. To use a remote image, download it first with `media` op=fetch (imageOnly: true) and pass the returned path here.",
  videos:
    "Absolute local file paths attached as real input videos, in order (e.g. a clip to describe, summarise, or use as a reference). Omit or pass [] for none. To use a remote video, download it first with `media` op=fetch and pass the returned path here.",
  expect:
    "What the turn should produce, controlling how long we wait: 'auto' (default — detect text/image, and poll for video if Gemini says it's generating one), 'text', 'image', or 'video' (force the long async video poll). Use 'video' when you know the prompt asks for a video.",
  timeout_seconds:
    "Overall cap for the turn. Default 300s for text/image; a video turn is allowed up to VIDEO cap regardless (Veo takes minutes).",
} as const;

export const GEMINI = {
  /** Separate CDP port from chatgpt's 9222 — independent browser instance. */
  CDP_HTTP: process.env.GEMINI_CDP_HTTP || "http://127.0.0.1:9333",
  CHROME_BIN: process.env.GEMINI_CHROME_BIN || "/usr/bin/google-chrome-stable",
  /**
   * Gemini's own persistent profile dir (cookies + gemini.google.com login),
   * distinct from chatgpt's. Seeded once from SEED_PROFILE_DIR if absent, then
   * reused across spawns. Log in once via VNC against this dir (or let the
   * seed copy carry an existing Google login over) and it survives restarts.
   */
  PROFILE_DIR:
    process.env.GEMINI_PROFILE_DIR || "/home/ubuntu/browser-vnc/chrome-gemini",
  /**
   * Source profile to seed PROFILE_DIR from on first run — the same
   * already-logged-in Chrome profile chatgpt uses. Only `Default` + `Local
   * State` are copied (cookies live there); the copy is a one-time snapshot,
   * after which the Gemini profile is independent.
   */
  SEED_PROFILE_DIR:
    process.env.GEMINI_SEED_PROFILE_DIR ||
    process.env.CHATGPT_PROFILE_DIR ||
    "/home/ubuntu/browser-vnc/chrome-official",
  /** Same Xvfb display chatgpt uses — headful is required (Cloudflare walls headless). */
  DISPLAY: process.env.GEMINI_DISPLAY || process.env.CHATGPT_DISPLAY || ":99",
  APP_URL: "https://gemini.google.com/app",

  // Selectors — verified live 2026-09-12 against gemini.google.com.
  EDITOR_SELECTOR: 'rich-textarea .ql-editor, div[contenteditable="true"][role="textbox"]',
  SEND_SELECTOR: 'button.send-button, button[aria-label*="Send" i]',
  STOP_SELECTOR: 'button[aria-label*="Stop" i]',
  UPLOAD_BUTTON_SELECTOR: 'button[aria-label*="Upload and tools" i], button[aria-label*="upload" i]',
  RESPONSE_SELECTOR: "model-response, message-content",

  // Timing
  COMPOSER_WAIT_SEC: 90,
  DEFAULT_TURN_TIMEOUT_SEC: 300,
  VIDEO_TIMEOUT_SEC: 12 * 60,
  TURN_POLL_MS: 1500,
  VIDEO_POLL_MS: 15_000,
  UPLOAD_SETTLE_MS: 10_000,
  MENU_SETTLE_MS: 1800,

  // CDP
  CDP_CONNECT_TIMEOUT_MS: 30_000,
  CDP_EVAL_TIMEOUT_MS: 60_000,
  CDP_MEDIA_FETCH_TIMEOUT_MS: 240_000,
  CDP_MAX_PAYLOAD_BYTES: 200 * 1024 * 1024,
  CDP_LAUNCH_TIMEOUT_MS: 20_000,
  CDP_LAUNCH_POLL_MS: 300,

  MEDIA_ROOT: AIXEL_MEDIA.PUBLIC,
  MEDIA_PUBLIC_BASE: AIXEL_MEDIA.PUBLIC_BASE_URL,
} as const;

export const GEMINI_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid request parameters",
  BUSY: "A Gemini call is already running — retry shortly",
  PREFLIGHT: "Gemini browser preflight failed",
  GENERIC: "Gemini call failed",
  LOGGED_OUT:
    "Gemini session is logged out — sign in via VNC into the Gemini profile dir, or re-seed it from a logged-in profile",
  NO_RESULT: "Gemini produced neither text nor media — it may have refused",
  MISSING_FILE: "An attached file path does not exist",
  NOT_VPS:
    "Gemini calls need a headful Chrome with an X display (the VPS's Xvfb) — no X display is available on this host",
} as const;

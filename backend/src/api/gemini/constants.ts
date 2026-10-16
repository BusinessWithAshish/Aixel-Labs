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
/** `revise` is `resume` under the name the `chatgpt` module uses, so a caller written for one works on the other. */
export const GEMINI_MODES = ["new", "resume", "revise"] as const;

export const GEMINI_FIELD_DESCRIPTIONS = {
  prompt:
    "Full prompt — a chat question, an image-generation brief, a video brief, or an instruction over attached media. For a video ask, phrase it as a video (e.g. 'Create a short video: …') so Gemini routes it to Veo.",
  project_url:
    "OPTIONAL. A Gemini notebook URL (https://gemini.google.com/notebook/<id>) — Gemini's equivalent of a ChatGPT Project: saved instructions, source files (logos, brand docs) and memory across its chats. With mode=new the chat is started INSIDE that notebook, so its instructions and sources shape the turn without being attached or restated. A Gem URL (https://gemini.google.com/gem/<id>) works the same way. Omit it for a plain Gemini chat with no project context. Ignored when continuing a conversation — a chat keeps the notebook it was started in.",
  mode: "'new' starts a chat (in project_url when given, else a plain chat). 'resume' or 'revise' (same thing) continues an existing conversation with its full context — the way to iterate on an image it already made. Works the same for a notebook chat and a plain one.",
  conversation_id:
    "The id from a prior response (the /app/<id> segment). mode=resume|revise needs this or conversation_url.",
  conversation_url:
    "The conversation_url from a prior response (https://gemini.google.com/app/<id>). Alternative to conversation_id for mode=resume|revise.",
  revise_notes:
    "Human revise feedback; appended to the prompt when continuing a conversation.",
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
    process.env.GEMINI_PROFILE_DIR || "/home/ubuntu/browser-vnc/gemini",
  /**
   * Source profile to seed PROFILE_DIR from on first run — the same
   * already-logged-in Chrome profile chatgpt uses. Only `Default` + `Local
   * State` are copied (cookies live there); the copy is a one-time snapshot,
   * after which the Gemini profile is independent.
   */
  SEED_PROFILE_DIR:
    process.env.GEMINI_SEED_PROFILE_DIR ||
    process.env.CHATGPT_PROFILE_DIR ||
    "/home/ubuntu/browser-vnc/BWA",
  /** Same Xvfb display chatgpt uses — headful is required (Cloudflare walls headless). */
  DISPLAY: process.env.GEMINI_DISPLAY || process.env.CHATGPT_DISPLAY || ":99",
  APP_URL: "https://gemini.google.com/app",
  /** A notebook (project) or a Gem — the only pages besides APP_URL a new chat may start from. */
  PROJECT_URL_RE: /^https:\/\/gemini\.google\.com\/(notebook|gem)\/[A-Za-z0-9_-]+\/?$/,
  /** A conversation, whether it was started in a notebook or not. */
  CONVERSATION_URL_RE: /^https:\/\/gemini\.google\.com\/app\/([0-9a-fA-F]+)/,

  // Selectors — verified live 2026-09-12 against gemini.google.com.
  EDITOR_SELECTOR: 'rich-textarea .ql-editor, div[contenteditable="true"][role="textbox"]',
  SEND_SELECTOR: 'button.send-button, button[aria-label*="Send" i]',
  STOP_SELECTOR: 'button[aria-label*="Stop" i]',
  UPLOAD_BUTTON_SELECTOR: 'button[aria-label*="Upload and tools" i], button[aria-label*="upload" i]',
  RESPONSE_SELECTOR: "model-response, message-content",
  /** One element per assistant turn — counted to tell a new answer from one already on the page. */
  TURN_SELECTOR: "model-response",

  // Timing
  COMPOSER_WAIT_SEC: 90,
  DEFAULT_TURN_TIMEOUT_SEC: 300,
  VIDEO_TIMEOUT_SEC: 12 * 60,
  TURN_POLL_MS: 1500,
  VIDEO_POLL_MS: 15_000,
  UPLOAD_SETTLE_MS: 10_000,
  /**
   * Held after a finished turn, before the browser is torn down. Chrome was
   * being closed the instant the image appeared, and those conversations never
   * reached the account's history — every later resume opened a blank chat.
   */
  PERSIST_SETTLE_MS: 6000,
  /** Consecutive signed-out reads (TURN_POLL_MS apart) before a turn is declared logged out. */
  LOGGED_OUT_POLLS: 8,
  /** How long a new chat gets to move from its start page to its own /app/<id> URL. */
  CONVERSATION_ID_WAIT_MS: 20_000,
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
  CONVERSATION_NOT_FOUND:
    "That Gemini conversation does not exist on this account (it opened a blank chat instead) — it was never saved or has been deleted. Start again with mode=new",
  NOT_VPS:
    "Gemini calls need a headful Chrome with an X display (the VPS's Xvfb) — no X display is available on this host",
} as const;

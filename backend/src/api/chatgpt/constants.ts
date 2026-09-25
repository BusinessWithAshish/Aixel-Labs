import { AIXEL_MEDIA } from "../../media";

/**
 * ChatGPT image generation via the VPS headful Chrome (CDP) + logged-in session.
 * Caller owns project_url + prompt; API owns logo attach, CDP, and public media staging.
 */

export const CHATGPT_ROUTES = {
  GENERATE: "/",
  HEALTH: "/health",
} as const;

export const CHATGPT_FIELD_DESCRIPTIONS = {
  project_url:
    "ChatGPT Project URL (https://chatgpt.com/g/g-p-…/project). Brand style lives in the project.",
  prompt:
    "Full prompt — a chat question, an image-generation brief, or both. Caller builds this from soul/memory/skills.",
  mode: "'new' opens the project; 'revise' continues an existing conversation_url.",
  conversation_url:
    "Required when mode=revise. ChatGPT /c/… URL from a prior successful call.",
  revise_notes: "Human revise feedback; appended into the prompt when mode=revise.",
  images:
    "Absolute local file paths to attach to the message, in order, as real input images (e.g. the brand logo, reference posts to emulate). Omit to use the server default (just the brand logo); pass [] to attach nothing. To use a remote image (e.g. a competitor's post) as a reference, first download it with `media` op=fetch (imageOnly: true) and pass the returned path here — this module has no downloader of its own.",
} as const;

export const CHATGPT = {
  CDP_HTTP: process.env.CHATGPT_CDP_HTTP || "http://127.0.0.1:9222",
  /** Chrome binary spawned fresh per call — see cdp.ts launchChatGptChrome(). */
  CHROME_BIN: process.env.CHATGPT_CHROME_BIN || "/usr/bin/google-chrome-stable",
  /**
   * Persistent profile dir (cookies + ChatGPT login) reused across spawns.
   * Same directory the old always-on VNC Chrome used — logging in once via
   * VNC (or copying a logged-in profile here) keeps working across restarts
   * because only the profile *directory* needs to persist, not the process.
   */
  PROFILE_DIR: process.env.CHATGPT_PROFILE_DIR || "/home/ubuntu/browser-vnc/chrome-official",
  /**
   * X11 display to render into. MUST be headed, not `--headless=new` —
   * verified live 2026-09-07: chatgpt.com's Cloudflare check waves through
   * a headed browser using these exact cookies but walls a headless one
   * behind a "Just a moment…" interstitial, even with a valid session.
   * Reuses the Xvfb the aixel-xvfb systemd unit already runs (originally for
   * the always-on VNC Chrome) — no new display server needed.
   */
  DISPLAY: process.env.CHATGPT_DISPLAY || ":99",
  LOGO_PATH:
    process.env.CHATGPT_LOGO_PATH ||
    "/home/ubuntu/AIXEL-LABS-ORG/brand/assets/aixellabs-lockup.png",
  MEDIA_ROOT: AIXEL_MEDIA.PUBLIC,
  MEDIA_PUBLIC_BASE: AIXEL_MEDIA.PUBLIC_BASE_URL,
  /** Soft upper bound for waiting on ChatGPT stream; CDP/session errors fail sooner. */
  DEFAULT_STREAM_TIMEOUT_SEC: 30 * 60,
  COMPOSER_WAIT_SEC: 90,
  /**
   * ChatGPT's prompt input. Migrated from `#prompt-textarea` to a ProseMirror
   * contenteditable div (aria-label "Ask ChatGPT") around 2026-09; both are
   * listed so a UI rollback still matches. `querySelector` returns whichever is
   * present. A stale value here reads as "composer never appeared" even though
   * the page is logged in — that was the 2026-09-24 breakage.
   */
  COMPOSER_SELECTOR: "#prompt-textarea, .ProseMirror",
  /**
   * The composer's send button. Was `#composer-submit-button` /
   * `[data-testid=send-button]` / aria-label "Send prompt"; the current UI uses
   * aria-label "Send". All are listed for resilience.
   */
  SEND_BUTTON_SELECTOR:
    'button[aria-label=Send], #composer-submit-button, button[data-testid=send-button], button[aria-label="Send prompt"]',
  LOGO_SETTLE_MS: 8000,
  STREAM_POLL_MS: 5000,
  CDP_CONNECT_TIMEOUT_MS: 30_000,
  CDP_EVAL_TIMEOUT_MS: 60_000,
  CDP_DOWNLOAD_TIMEOUT_MS: 240_000,
  CDP_MAX_PAYLOAD_BYTES: 200 * 1024 * 1024,
  /** How long a freshly spawned Chrome gets to open its CDP port. */
  CDP_LAUNCH_TIMEOUT_MS: 20_000,
  CDP_LAUNCH_POLL_MS: 300,
} as const;

export const CHATGPT_MODES = ["new", "revise"] as const;

export const CHATGPT_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid request parameters",
  BUSY: "A ChatGPT call is already running — retry shortly",
  PREFLIGHT: "ChatGPT browser preflight failed",
  GENERIC: "ChatGPT call failed",
  NO_RESULT: "ChatGPT produced neither text nor an image — it may have refused",
  NOT_VPS:
    "ChatGPT calls need a headful Chrome with an X display (the VPS's Xvfb) — no X display is available on this host",
} as const;

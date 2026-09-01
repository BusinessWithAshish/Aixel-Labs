import { AIXEL_MEDIA } from "../../media";

/**
 * ChatGPT image generation via the VPS headful Chrome (CDP) + logged-in session.
 * Caller owns project_url + prompt; API owns logo attach, CDP, and public media staging.
 */

export const CHATGPT_ROUTES = {
  GENERATE: "/",
  HEALTH: "/health",
  STAGE: "/stage",
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
    "Absolute local file paths to attach to the message, in order, as real input images (e.g. the brand logo, reference posts to emulate). Omit to use the server default (just the brand logo); pass [] to attach nothing.",
  stage_url:
    "Public image URL to download and stage as a local file (e.g. an Instagram post's image) — the returned path can then be viewed with the Read tool and/or passed in a later call's images[].",
} as const;

export const CHATGPT = {
  CDP_HTTP: process.env.CHATGPT_CDP_HTTP || "http://localhost:9222",
  LOGO_PATH:
    process.env.CHATGPT_LOGO_PATH ||
    "/home/ubuntu/AIXEL-LABS-ORG/brand/assets/aixellabs-lockup.png",
  MEDIA_ROOT: process.env.CHATGPT_MEDIA_ROOT || AIXEL_MEDIA.PUBLIC,
  MEDIA_PUBLIC_BASE:
    process.env.CHATGPT_MEDIA_PUBLIC_BASE || AIXEL_MEDIA.PUBLIC_BASE_URL,
  /** Downloaded reference images (research finds, not generated output) — private, not web-served. */
  STAGE_ROOT: process.env.CHATGPT_STAGE_ROOT || "/home/ubuntu/media/refs",
  STAGE_MAX_BYTES: 15 * 1024 * 1024,
  STAGE_FETCH_TIMEOUT_MS: 30_000,
  STAGE_ALLOWED_CONTENT_TYPES: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ] as const,
  SYSTEMD_SERVICES: [
    "aixel-xvfb",
    "aixel-fluxbox",
    "aixel-x11vnc",
    "aixel-novnc",
    "aixel-chromium",
  ] as const,
  /** Soft upper bound for waiting on ChatGPT stream; CDP/session errors fail sooner. */
  DEFAULT_STREAM_TIMEOUT_SEC: 30 * 60,
  COMPOSER_WAIT_SEC: 90,
  LOGO_SETTLE_MS: 8000,
  STREAM_POLL_MS: 5000,
  CDP_CONNECT_TIMEOUT_MS: 30_000,
  CDP_EVAL_TIMEOUT_MS: 60_000,
  CDP_DOWNLOAD_TIMEOUT_MS: 240_000,
  CDP_MAX_PAYLOAD_BYTES: 200 * 1024 * 1024,
} as const;

export const CHATGPT_MODES = ["new", "revise"] as const;

export const CHATGPT_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid request parameters",
  BUSY: "A ChatGPT call is already running — retry shortly",
  PREFLIGHT: "ChatGPT browser preflight failed",
  GENERIC: "ChatGPT call failed",
  NO_RESULT: "ChatGPT produced neither text nor an image — it may have refused",
  STAGE_FETCH_FAILED: "Could not download the image at that URL",
  STAGE_NOT_IMAGE: "URL did not return an image content-type",
  STAGE_TOO_LARGE: "Image exceeded the size limit",
  NOT_VPS:
    "ChatGPT calls require the VPS Chrome/CDP stack — set AIXEL_VPS=1 on the one host that runs it",
} as const;

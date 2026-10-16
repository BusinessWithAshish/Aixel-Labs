import { z } from "zod";

import { withStatusCode } from "../../config";
import { AIXEL_MEDIA } from "../../media";

/**
 * ChatGPT image generation via the VPS headful Chrome (CDP) + logged-in session.
 * Caller owns project_url + prompt; API owns logo attach, CDP, and public media staging.
 */

export const CHATGPT_ROUTES = {
  GENERATE: "/",
  HEALTH: "/health",
  IMAGE: "/image",
} as const;

export const CHATGPT_FIELD_DESCRIPTIONS = {
  project_url:
    "OPTIONAL. ChatGPT Project URL (https://chatgpt.com/g/g-p-…/project) — use one when a project's saved instructions should shape the turn (house style, a brand, a persona). Omit it and the chat opens in the account's \"General chats\" project when it has one (keeps tool traffic out of the owner's own sidebar), otherwise in a plain chat.",
  prompt:
    "Full prompt — a chat question, an image-generation brief, or both. Caller builds this from soul/memory/skills.",
  mode: "'new' opens the project; 'revise' continues an existing conversation_url.",
  conversation_url:
    "Required when mode=revise. ChatGPT /c/… URL from a prior successful call.",
  revise_notes: "Human revise feedback; appended into the prompt when mode=revise.",
  images:
    "Absolute local file paths to attach to the message, in order, as real input images (e.g. a logo, reference posts to emulate). Omit or pass [] to attach nothing. To use a remote image (e.g. a competitor's post) as a reference, first download it with `media` op=fetch (imageOnly: true) and pass the returned path here — this module has no downloader of its own.",
  account:
    "OPTIONAL. Which signed-in ChatGPT account to use, by name (e.g. \"work\", \"personal\"). Omit for the server's default account. A project_url or conversation_url only opens in the account it belongs to. An unknown name is rejected with the list of known ones.",
  attach_brand_logo:
    "Also attach the server's configured brand logo (CHATGPT_LOGO_PATH) to this message. Default false. Only for callers that actually want that brand on the output — it is a specific organisation's mark, not a generic asset.",
  timeout_seconds:
    "Overall cap for waiting on the ChatGPT stream, in seconds. Defaults to the server's own cap. A turn that hangs holds the single-call lock for this long, so lower it for short text turns.",
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
  PROFILE_DIR: process.env.CHATGPT_PROFILE_DIR || "/home/ubuntu/browser-vnc/chatgpt",
  /**
   * X11 display to render into. MUST be headed, not `--headless=new` —
   * verified live 2026-09-07: chatgpt.com's Cloudflare check waves through
   * a headed browser using these exact cookies but walls a headless one
   * behind a "Just a moment…" interstitial, even with a valid session.
   * Reuses the Xvfb the aixel-xvfb systemd unit already runs (originally for
   * the always-on VNC Chrome) — no new display server needed.
   */
  DISPLAY: process.env.CHATGPT_DISPLAY || ":99",
  /**
   * Opt-in only, via `attach_brand_logo: true`. This is one organisation's
   * mark — it is deliberately NOT attached by default, because a caller that
   * did not ask for it (another brand, a standalone channel) would silently
   * get someone else's branding baked into the image.
   */
  LOGO_PATH:
    process.env.CHATGPT_LOGO_PATH ||
    "/home/ubuntu/AIXEL-LABS-ORG/brand/assets/aixellabs-lockup.png",
  /** Plain chat, used when no project_url is given. */
  NEW_CHAT_URL: "https://chatgpt.com/",
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
  /** Let attachments finish uploading before the prompt is sent. */
  ATTACH_SETTLE_MS: 8000,
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

/**
 * The same ChatGPT subscription reached through the Codex CLI instead of a
 * browser tab — for an account that cannot be signed into the VPS Chrome.
 *
 * The CLI keeps its own login in `HOME` (a CODEX_HOME separate from any
 * developer's `~/.codex`), signed in once with `codex login --device-auth`.
 * Image generation there draws on the plan's included Codex usage, not on the
 * in-app image cap the browser path hits and not on metered API credits.
 */
export const CHATGPT_CODEX = {
  BIN: process.env.CHATGPT_CODEX_BIN || "/home/ubuntu/.local/bin/codex",
  HOME: process.env.CHATGPT_CODEX_HOME || "/home/ubuntu/.codex-chatgpt",
  /** An empty directory the CLI runs in, so it has no repository to wander into. */
  WORKDIR: `${AIXEL_MEDIA.PRIVATE}/codex-work`,
  DEFAULT_TIMEOUT_SEC: 10 * 60,
  /**
   * Goes in front of every prompt. Codex is a coding agent: left alone it will
   * write an SVG or a script that draws the picture. This pins it to the one
   * tool wanted and to a one-line answer.
   */
  PREAMBLE:
    "Use your built-in image generation tool to produce exactly ONE image for the request below. " +
    "Do not write code, do not create or edit files, do not run shell commands, and do not describe the image instead of generating it. " +
    "When the image exists, reply with one short line saying what you made.",
  REVISE_PREAMBLE:
    "Revise the image you generated earlier in this session, using your built-in image generation tool, and produce exactly ONE new image. " +
    "Change only what is asked and keep everything else as it was. Do not write code, files or shell commands. Reply with one short line.",
} as const;

export const CHATGPT_CODEX_FIELD_DESCRIPTIONS = {
  prompt:
    "What to generate (mode=new) or what to change (mode=revise). Describe the picture; the server already tells the CLI to use its image tool and nothing else.",
  mode: "'new' starts a session; 'revise' continues `session_id`, where the earlier image still is, so the change keeps everything not mentioned.",
  session_id: "Required when mode=revise. The session_id a prior call returned.",
  revise_notes: "Human revise feedback; appended to the prompt when mode=revise.",
  images:
    "Absolute local file paths attached as real input images, in order — a reference to follow, or an image to edit. Omit for none. For a remote image, download it first with `media` op=fetch (imageOnly: true).",
  account:
    "OPTIONAL. Which ChatGPT account's Codex CLI login to use, by name — the same names op=ask takes. Omit for the server's default account. A session_id only resumes in the account that made it.",
  instructions_file:
    "OPTIONAL. Absolute path of a text/markdown file of standing instructions (a brand's palette, type, never-list) put in front of the prompt on mode=new — this path's stand-in for a ChatGPT Project, which the CLI cannot open. A session keeps them, so mode=revise does not need it again.",
  timeout_seconds: "Cap on the whole turn, in seconds. Default 600.",
} as const;

export const CHATGPT_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid request parameters",
  BUSY: "A ChatGPT call is already running — retry shortly",
  PREFLIGHT: "ChatGPT browser preflight failed",
  GENERIC: "ChatGPT call failed",
  NO_RESULT: "ChatGPT produced neither text nor an image — it may have refused",
  NOT_VPS:
    "ChatGPT calls need a headful Chrome with an X display (the VPS's Xvfb) — no X display is available on this host",
  CODEX_BUSY: "A Codex image call is already running — retry shortly",
  CODEX_NOT_INSTALLED: "The Codex CLI is not installed at the configured path",
  CODEX_SIGNED_OUT:
    "The Codex CLI is not signed in. On the VPS run: CODEX_HOME=<the configured home> codex login --device-auth, and approve the code with the ChatGPT account to use",
  CODEX_NO_IMAGE: "Codex finished without generating an image",
  CODEX_NOT_VPS:
    "Codex image calls need the VPS's persistent disk (CLI login + generated images) — refused on Vercel",
} as const;

/** Account names as callers pass them in `account`, and the keys of CHATGPT_ACCOUNTS. */
export const CHATGPT_ACCOUNT_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * One signed-in ChatGPT account, reachable two ways. Every op takes `account`
 * and looks its routes up here, so adding a login is one entry — never a new
 * op or a new env var per route.
 *
 * - `profile_dir`: the Chrome profile holding the chatgpt.com login (op=ask).
 * - `codex_home`: the Codex CLI login folder for the same account (op=image);
 *   absent when the CLI was never signed in for it.
 * - `general_project_url`: that account's "General chats" project. A new chat
 *   that names no project_url opens there instead of the account's main
 *   sidebar, so tool traffic never lands in the owner's own chat history.
 *   Absent = no such project yet, and a project-less chat is a plain chat.
 */
const CHATGPT_ACCOUNT_SCHEMA = z.object({
  profile_dir: z.string().min(1),
  codex_home: z.string().min(1).optional(),
  general_project_url: z.string().url().optional(),
});

export type CHATGPT_ACCOUNT = z.infer<typeof CHATGPT_ACCOUNT_SCHEMA>;

const CHATGPT_ACCOUNTS_SCHEMA = z
  .record(z.string().regex(CHATGPT_ACCOUNT_NAME_REGEX), CHATGPT_ACCOUNT_SCHEMA)
  .refine((accounts) => Object.keys(accounts).length > 0, "at least one account");

/** Used when CHATGPT_ACCOUNTS is unset: the configured profile + Codex home, no project. */
const CHATGPT_BUILTIN_ACCOUNTS: Record<string, CHATGPT_ACCOUNT> = {
  default: { profile_dir: CHATGPT.PROFILE_DIR, codex_home: CHATGPT_CODEX.HOME },
};

function loadChatGptAccounts(): Record<string, CHATGPT_ACCOUNT> {
  const raw = process.env.CHATGPT_ACCOUNTS;
  if (!raw) return CHATGPT_BUILTIN_ACCOUNTS;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    /* not JSON: reported below as an invalid map */
  }
  const result = CHATGPT_ACCOUNTS_SCHEMA.safeParse(json);
  if (result.success) return result.data;
  // A malformed override must not take the tool down, but must not pass silently either.
  console.warn(`CHATGPT_ACCOUNTS is not a valid account map, using the built-in "default": ${result.error.message}`);
  return CHATGPT_BUILTIN_ACCOUNTS;
}

/** Override whole with CHATGPT_ACCOUNTS (JSON: { "<name>": { profile_dir, codex_home?, general_project_url? } }). */
export const CHATGPT_ACCOUNTS: Record<string, CHATGPT_ACCOUNT> = loadChatGptAccounts();

/** Used when a call names no account. */
export const CHATGPT_DEFAULT_ACCOUNT = process.env.CHATGPT_DEFAULT_ACCOUNT || "default";

export function resolveChatGptAccount(name?: string | null): { name: string; account: CHATGPT_ACCOUNT } {
  const key = name || CHATGPT_DEFAULT_ACCOUNT;
  const account = CHATGPT_ACCOUNTS[key];
  if (!account) {
    throw withStatusCode(
      `Unknown ChatGPT account "${key}". Known accounts: ${Object.keys(CHATGPT_ACCOUNTS).join(", ")}`,
      400,
    );
  }
  return { name: key, account };
}

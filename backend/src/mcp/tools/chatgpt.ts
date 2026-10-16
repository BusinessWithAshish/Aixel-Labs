import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { generateChatGpt } from "../../api/chatgpt/client";
import { generateCodexImage } from "../../api/chatgpt/codex";
import { CHATGPT_CODEX_IMAGE_SCHEMA, CHATGPT_REQUEST_SCHEMA } from "../../api/chatgpt/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const CHATGPT_OPS: Record<string, DomainOp> = {
  ask: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: CHATGPT_REQUEST_SCHEMA,
      run: generateChatGpt,
    },
  },
  image: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: CHATGPT_CODEX_IMAGE_SCHEMA,
      run: generateCodexImage,
    },
  },
};

const CHATGPT_DESCRIPTION = `ChatGPT via the VPS's already-logged-in browser session — text-to-text, text-to-image, and text/image-to-text/image, whatever ChatGPT actually produces for the turn (runs on the existing subscription, not metered API credits). Needs a headful-browser host, and not just by convention: enabled only where an X display is present (auto-detected, refused on Vercel — no env flag to set), and every op then checks the Chrome binary and profile dir actually exist and fails fast with a specific reason before ever trying to spawn a browser.

Call with { op, input }.

Ops:
- ask — one ChatGPT turn. input: prompt, mode ("new" | "revise"), project_url? (a ChatGPT Project URL — use one when a project's saved instructions should shape the turn; OMIT it for a general chat with no project instructions), conversation_url? (required when mode=revise, continues that conversation — works with or without a project), revise_notes?, images? (absolute local file paths attached as real input images, in order; omit or pass [] for none — to use a remote image as a reference, download it first with \`media\` op=fetch, imageOnly: true, then pass the returned path here), account? (which signed-in ChatGPT account, by name, e.g. \"literallyashish\" or \"BWA\"; omit for the server default — a project or conversation URL only opens in its own account; with no project_url a new chat opens in that account's \"General chats\" project when it has one), attach_brand_logo? (default false — also attaches the server's configured brand logo; that is one organisation's mark, so leave it off unless you want that brand on the output), timeout_seconds? (cap on waiting for the stream; a hung turn holds the single-call lock this long). Returns text and/or media_url depending on what ChatGPT actually produced, plus conversation_url — pass that back as conversation_url with mode="revise" to continue the same thread next time — a plain chat turn returns only text; an image turn returns media_url (often with a short text caption too). Neither present means the model produced nothing usable (refused, empty turn), not a transport failure. Synchronous and slow for image turns (can take several minutes) — only one call runs at a time, concurrent calls fail with a busy error.

- image — one image from the ChatGPT subscription through the Codex CLI, NO browser: for an account that is not (or cannot be) signed into the VPS Chrome, and unaffected by the browser account's in-app image limit. It draws on a separate, small monthly Codex allowance (measured on a Go plan: about 2% of a 30-day window per image, roughly 45 images a month), so prefer op=ask wherever the account is signed in to the browser. input: prompt, account? (same names as op=ask; omit for the server default), mode ("new" | "revise"), session_id? (required when mode=revise — the one a prior call returned; the session still holds the earlier image, so a revision changes only what is asked), revise_notes?, images? (absolute local paths attached as input images — a reference, or an image to edit), instructions_file? (absolute path of a file of standing instructions put in front of the prompt on mode=new — the stand-in for a Project, which the CLI cannot open), timeout_seconds? (default 600). Returns { media_url, session_id, text? }. Always an image: a turn that produced none fails with what the CLI said (usage limit, refusal, signed out). It draws on the plan's included Codex usage, and an image costs several times a normal turn. One call at a time; it does not block or wait for \`ask\`.

Staging a reference image used to be a second op here (stage_image) — removed, it was a plain HTTP download with no ChatGPT-specific logic at all (weaker than \`media\` op=fetch's own downloader, too: no gated-CDN fallback). Use \`media\` op=fetch instead.`;

export function registerChatgptTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "chatgpt",
    description: CHATGPT_DESCRIPTION,
    ops: CHATGPT_OPS,
  });
}

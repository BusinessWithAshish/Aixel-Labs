import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { generateChatGpt } from "../../api/chatgpt/client";
import { CHATGPT_REQUEST_SCHEMA } from "../../api/chatgpt/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const CHATGPT_OPS: Record<string, DomainOp> = {
  ask: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: CHATGPT_REQUEST_SCHEMA,
      run: generateChatGpt,
    },
  },
};

const CHATGPT_DESCRIPTION = `ChatGPT via the VPS's already-logged-in browser session — text-to-text, text-to-image, and text/image-to-text/image, whatever ChatGPT actually produces for the turn (runs on the existing subscription, not metered API credits). Needs a headful-browser host, and not just by convention: enabled only where an X display is present (auto-detected, refused on Vercel — no env flag to set), and every op then checks the Chrome binary and profile dir actually exist and fails fast with a specific reason before ever trying to spawn a browser.

Call with { op, input }.

Ops:
- ask — one ChatGPT turn. input: project_url (ChatGPT Project URL — brand style lives in the project), prompt, mode ("new" | "revise"), conversation_url? (required when mode=revise, continues that conversation), revise_notes?, images? (absolute local file paths attached as real input images, in order — e.g. brand logo, reference posts to emulate; omit for the server default of just the brand logo, pass [] for none — to use a remote image as a reference, download it first with \`media\` op=fetch, imageOnly: true, then pass the returned path here). Returns text and/or media_url depending on what ChatGPT actually produced — a plain chat turn returns only text; an image turn returns media_url (often with a short text caption too). Neither present means the model produced nothing usable (refused, empty turn), not a transport failure. Synchronous and slow for image turns (can take several minutes) — only one call runs at a time, concurrent calls fail with a busy error.

Staging a reference image used to be a second op here (stage_image) — removed, it was a plain HTTP download with no ChatGPT-specific logic at all (weaker than \`media\` op=fetch's own downloader, too: no gated-CDN fallback). Use \`media\` op=fetch instead.`;

export function registerChatgptTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "chatgpt",
    description: CHATGPT_DESCRIPTION,
    ops: CHATGPT_OPS,
  });
}

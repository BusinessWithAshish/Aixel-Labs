import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { generateChatGpt, stageChatGptReferenceImage } from "../../api/chatgpt/client";
import {
  CHATGPT_REQUEST_SCHEMA,
  CHATGPT_STAGE_REQUEST_SCHEMA,
} from "../../api/chatgpt/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const CHATGPT_OPS: Record<string, DomainOp> = {
  generate: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: CHATGPT_REQUEST_SCHEMA,
      run: generateChatGpt,
    },
  },
  stage_image: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: CHATGPT_STAGE_REQUEST_SCHEMA,
      run: stageChatGptReferenceImage,
    },
  },
};

const CHATGPT_DESCRIPTION = `ChatGPT via the VPS's already-logged-in browser session (plain chat, image generation, or both — runs on the existing subscription, not metered API credits) plus a helper for staging reference images. VPS only — every op fails fast (no browser, no CDP) unless AIXEL_VPS=1 is set on this host.

Call with { op, input }.

Ops:
- generate — one ChatGPT turn. input: project_url (ChatGPT Project URL — brand style lives in the project), prompt, mode ("new" | "revise"), conversation_url? (required when mode=revise, continues that conversation), revise_notes?, images? (absolute local file paths attached as real input images, in order — e.g. brand logo, reference posts to emulate; omit for the server default of just the brand logo, pass [] for none). Returns text and/or media_url depending on what ChatGPT actually produced — a plain chat turn returns only text; an image turn returns media_url (often with a short text caption too). Neither present means the model produced nothing usable (refused, empty turn), not a transport failure. Synchronous and slow for image turns (can take several minutes) — only one call runs at a time, concurrent calls fail with a busy error.
- stage_image — download a public image URL (e.g. an Instagram post's image) to a local file. input: url. Returns { path, content_type, size_bytes }. Use the Read tool on the returned path to actually view the image (this tool does not describe it), and pass that same path in a later generate call's images[] to use it as a reference. Fast, does not touch the shared browser session.`;

export function registerChatgptTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "chatgpt",
    description: CHATGPT_DESCRIPTION,
    ops: CHATGPT_OPS,
  });
}

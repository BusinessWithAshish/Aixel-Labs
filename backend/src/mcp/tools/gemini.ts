import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { generateGemini } from "../../api/gemini/client";
import { GEMINI_REQUEST_SCHEMA } from "../../api/gemini/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const GEMINI_OPS: Record<string, DomainOp> = {
  ask: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: GEMINI_REQUEST_SCHEMA,
      run: generateGemini,
    },
  },
};

const GEMINI_DESCRIPTION = `Gemini via the VPS's already-logged-in browser session — text, image, and video, in and out (runs on the flat Google AI subscription, not the metered Gemini API). Text-to-text/image/video, and image/video-in for description, editing, or as a generation reference — whatever the turn produces. Runs in its own browser instance, independent of the chatgpt tool, so the two never block each other. Needs a headful-browser host (auto-detected from an X display; refused on Vercel or anywhere without one, with a specific reason) — no env flag to set.

Call with { op, input }.

Ops:
- ask — one Gemini turn. input: prompt, project_url? (a Gemini notebook URL, https://gemini.google.com/notebook/<id> — the equivalent of a ChatGPT Project: its saved instructions, source files and memory shape the turn, so a brand's logo and house style need not be attached or restated; omit for a plain chat), mode ("new" | "resume" | "revise" — "new" starts a chat, inside project_url when given; "resume"/"revise" are the same thing and continue an existing conversation with its full context, which is how to iterate on an image it already made — works for notebook chats and plain chats alike), conversation_id? / conversation_url? (one is required when continuing — both come back from every call), revise_notes? (human feedback, appended to the prompt when continuing), images? (absolute local file paths attached as real input images), videos? (absolute local file paths attached as real input videos — to describe/summarise a clip or use it as a reference; for a remote file, download it first with \`media\` op=fetch and pass the returned path), expect ("auto" | "text" | "image" | "video"; default auto — use "video" when the prompt asks for a video so the long async Veo poll runs), timeout_seconds? (default 300s; a video turn is allowed longer). Returns { text?, media: [{ kind: "image"|"video", url }], model?, conversation_id, conversation_url, project_url? }. Continuing a conversation the account no longer holds fails with a clear error rather than starting an unrelated chat. Generated media is staged to public URLs. Video is asynchronous and can take several minutes; a pure image/video turn may return no text. Synchronous and one-at-a-time — a concurrent call fails with a busy error.

To generate a video, phrase the prompt as a video brief (e.g. "Create a short video: …"). To use a competitor's image/clip as a reference, download it first with \`media\` op=fetch, then pass the returned path in images/videos.`;

export function registerGeminiTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "gemini",
    description: GEMINI_DESCRIPTION,
    ops: GEMINI_OPS,
  });
}

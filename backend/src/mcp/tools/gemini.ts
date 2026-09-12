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
- ask — one Gemini turn. input: prompt, mode ("new" | "resume"), conversation_id? (required when mode=resume — the /app/<id> id from a prior response; continue a chat to iterate on an image or extend a video), images? (absolute local file paths attached as real input images), videos? (absolute local file paths attached as real input videos — to describe/summarise a clip or use it as a reference; for a remote file, download it first with \`media\` op=fetch and pass the returned path), expect ("auto" | "text" | "image" | "video"; default auto — use "video" when the prompt asks for a video so the long async Veo poll runs), timeout_seconds? (default 300s; a video turn is allowed longer). Returns { text?, media: [{ kind: "image"|"video", url }], model?, conversation_id, conversation_url }. Generated media is staged to public URLs. Video is asynchronous and can take several minutes; a pure image/video turn may return no text. Synchronous and one-at-a-time — a concurrent call fails with a busy error.

To generate a video, phrase the prompt as a video brief (e.g. "Create a short video: …"). To use a competitor's image/clip as a reference, download it first with \`media\` op=fetch, then pass the returned path in images/videos.`;

export function registerGeminiTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "gemini",
    description: GEMINI_DESCRIPTION,
    ops: GEMINI_OPS,
  });
}

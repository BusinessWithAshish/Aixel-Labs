import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { transcribe } from "../../api/transcription/client";
import { TRANSCRIPTION_REQUEST_SCHEMA } from "../../api/transcription/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const TRANSCRIPTION_OPS: Record<string, DomainOp> = {
  transcribe: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: TRANSCRIPTION_REQUEST_SCHEMA, run: transcribe },
  },
};

const TRANSCRIPTION_DESCRIPTION = `Groq Whisper transcription. Raw only.

Call with { op, layer?, input }. layer must be omitted or raw.

Ops:
- transcribe (raw) — mediaSource (local path or URL) → txt|json|srt|vtt. input: mediaSource, format?, language?, model?

No summarization. Local paths need a host filesystem; URLs are downloaded then transcribed.`;

export function registerTranscriptionTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "transcription",
    description: TRANSCRIPTION_DESCRIPTION,
    ops: TRANSCRIPTION_OPS,
  });
}

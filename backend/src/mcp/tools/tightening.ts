import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { tightenVideo } from "../../api/tightening/client";
import { TIGHTENING_REQUEST_SCHEMA } from "../../api/tightening/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const TIGHTENING_OPS: Record<string, DomainOp> = {
  tighten: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: TIGHTENING_REQUEST_SCHEMA, run: tightenVideo },
  },
};

const TIGHTENING_DESCRIPTION = `Remove silences and filler words from a whole video. Raw only. Not clip selection.

Call with { op, layer?, input }. layer must be omitted or raw. Needs ffmpeg on the host; re-encodes the full source.

Ops:
- tighten (raw) — videoSource (path or URL) → one tightened mp4. input: videoSource, silenceThresholdDb?, minSilenceSeconds?, keepPaddingSeconds?, removeFillers?, fillerWords?, language?`;

export function registerTighteningTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "tightening",
    description: TIGHTENING_DESCRIPTION,
    ops: TIGHTENING_OPS,
  });
}

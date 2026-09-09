import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { rankBySpeech } from "../../api/segment/by-speech/rank";
import { BY_SPEECH_REQUEST_SCHEMA } from "../../api/segment/by-speech/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const SEGMENT_OPS: Record<string, DomainOp> = {
  by_speech: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: BY_SPEECH_REQUEST_SCHEMA, run: rankBySpeech },
  },
};

const SEGMENT_DESCRIPTION = `Decides WHAT to cut — ranks a diarized transcript into short-form clip candidates. Raw only.
Call with { op, layer?, input }. layer must be omitted or raw. Pairs with the \`video\` tool: diarize -> segment -> cut.
Ops:
- by_speech (raw) — speech-driven ranking (hook/body/button rubric, standalone-clip scoring, tone-aware). Needs a diarized transcript from \`video\` op=diarize. Returns candidates shaped for \`video\` op=cut's \`clips\` field. input: diarized, provider ('claude'|'gemini', REQUIRED — no default, see cost/quota tradeoffs below), model?, minCandidates?, maxCandidates?, minClipSeconds?, maxClipSeconds?, channelContext?, audienceSignals?
  provider='gemini': schema-constrained JSON output, thin free-tier daily quota — can run dry on frequent unattended runs.
  provider='claude': flat-rate local Claude Code subscription, no native schema constraint (validated + retried up to 3 attempts on the same session), shares the org-wide 40-session/day delegation budget.
Not yet built: by_scene (ffmpeg scene-change detection, no AI call) and by_vision (sampled frames -> vision model) for non-speech content — see api/segment/moments/README.md.`;

export function registerSegmentTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "segment",
    description: SEGMENT_DESCRIPTION,
    ops: SEGMENT_OPS,
  });
}

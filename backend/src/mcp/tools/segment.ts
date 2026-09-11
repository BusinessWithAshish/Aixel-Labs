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
Call with { op, layer?, input }. layer must be omitted or raw. Pairs with \`youtube\`/\`media\` op=diarize before it and \`media\` op=cut after it: diarize -> segment -> cut.
Ops:
- by_speech (raw) — speech-driven ranking (hook/body/button rubric, standalone-clip scoring, tone-aware). Needs a diarized transcript from \`youtube\` or \`media\` op=diarize — pass that op's \`transcriptPath\` as diarizedPath (preferred: the transcript stays server-side) or the transcript object as diarized; exactly one. Returns candidates shaped for \`media\` op=cut's \`clips\` field. input: diarizedPath | diarized, provider ('claude'|'gemini', REQUIRED — no default, see cost/quota tradeoffs below), model?, minCandidates?, maxCandidates?, minClipSeconds?, maxClipSeconds?, channelContext? (string, max 2000 chars), audienceSignals? (ARRAY of strings, max 50 — one formatted line per signal, e.g. "12:31-12:45: 14 comments timestamp this moment"; never an object)
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

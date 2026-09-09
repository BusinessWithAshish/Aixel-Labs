import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { fetchMedia } from "../../api/media/fetch/fetch";
import { MEDIA_FETCH_REQUEST_SCHEMA } from "../../api/media/fetch/schemas";
import { transcribe } from "../../api/media/transcribe/client";
import { MEDIA_TRANSCRIBE_REQUEST_SCHEMA } from "../../api/media/transcribe/schemas";
import { diarizeFromSource } from "../../api/media/diarize/audio";
import { MEDIA_DIARIZE_REQUEST_SCHEMA } from "../../api/media/diarize/schemas";
import { cutClipsFromVideo } from "../../api/media/cut/cut";
import { MEDIA_CUT_REQUEST_SCHEMA } from "../../api/media/cut/schemas";
import { condenseVideo } from "../../api/media/condense/client";
import { MEDIA_CONDENSE_REQUEST_SCHEMA } from "../../api/media/condense/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const MEDIA_OPS: Record<string, DomainOp> = {
  fetch: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: MEDIA_FETCH_REQUEST_SCHEMA, run: fetchMedia },
  },
  transcribe: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: MEDIA_TRANSCRIBE_REQUEST_SCHEMA, run: transcribe },
  },
  diarize: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: MEDIA_DIARIZE_REQUEST_SCHEMA,
      run: (input) => diarizeFromSource(input.audioSource, input.model),
    },
  },
  cut: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: MEDIA_CUT_REQUEST_SCHEMA,
      run: (input) =>
        cutClipsFromVideo(
          input.videoSource,
          input.clips,
          input.diarized,
          input.aspectRatio,
        ),
    },
  },
  condense: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: MEDIA_CONDENSE_REQUEST_SCHEMA, run: condenseVideo },
  },
};

const MEDIA_DESCRIPTION = `Generic media primitives — content-agnostic, no pipeline baked in. Raw only.
Call with { op, layer?, input }. layer must be omitted or raw. Needs ffmpeg on the host; ops writing files need persistent local disk (refused on Vercel).
Never touches YouTube-specific code — a YouTube link is just a URL here, and will fail as one. Getting a YouTube video onto local disk, or reading its own captions, is the \`youtube\` tool's job (op=video_download, op=diarize); hand this tool the resulting local path or transcript.
Any source field otherwise accepts a local filesystem path or a publicly-reachable media URL.
Ops:
- fetch (raw) — resolve a source to a local file. input: source -> { path }
- transcribe (raw) — speech to text via Groq Whisper -> txt|json|srt|vtt. No speaker labels — use diarize for that. input: mediaSource, format?, language?, model?
- diarize (raw) — speaker-labelled transcript via Gemini audio. Costs real money/quota — for a YouTube source, try \`youtube\` op=diarize (free, captions-based) first; only fall back here if that fails or there are no captions. input: audioSource, model?
- cut (raw) — a video plus time ranges -> clip files. Ranges may come from anywhere (segment.by_speech, a human, another system). input: videoSource, clips[{start,end,label?}], diarized?, aspectRatio?
- condense (raw) — remove silences and filler words from a whole video -> one shorter mp4. Not clip selection. input: videoSource, silenceThresholdDb?, minSilenceSeconds?, keepPaddingSeconds?, removeFillers?, fillerWords?, language?
Composition is the caller's job: diarize -> segment -> cut is a podcast clipper, fetch -> cut is a manual trim. No op assumes what the media is.`;

export function registerMediaTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "media",
    description: MEDIA_DESCRIPTION,
    ops: MEDIA_OPS,
  });
}

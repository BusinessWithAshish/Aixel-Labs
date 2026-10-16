import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { fetchMedia } from "../../api/media/fetch/fetch";
import { MEDIA_FETCH_REQUEST_SCHEMA } from "../../api/media/fetch/schemas";
import { transcribe } from "../../api/media/transcribe/client";
import { MEDIA_TRANSCRIBE_REQUEST_SCHEMA } from "../../api/media/transcribe/schemas";
import { diarizeFromSource } from "../../api/media/diarize/audio";
import { MEDIA_DIARIZE_REQUEST_SCHEMA } from "../../api/media/diarize/schemas";
import { withTranscriptFile } from "../../api/media/diarize/transcript-store";
import { cutClipsFromVideo } from "../../api/media/cut/cut";
import { MEDIA_CUT_REQUEST_SCHEMA } from "../../api/media/cut/schemas";
import { condenseVideo } from "../../api/media/condense/client";
import { MEDIA_CONDENSE_REQUEST_SCHEMA } from "../../api/media/condense/schemas";
import { captionVideo } from "../../api/media/caption/caption";
import { MEDIA_CAPTION_REQUEST_SCHEMA } from "../../api/media/caption/schemas";
import { applyEffects } from "../../api/media/effects/effects";
import { MEDIA_EFFECTS_REQUEST_SCHEMA } from "../../api/media/effects/schemas";
import { shareMedia } from "../../api/media/share/share";
import { MEDIA_SHARE_REQUEST_SCHEMA } from "../../api/media/share/schemas";
import { narrate } from "../../api/media/narrate/narrate";
import { MEDIA_NARRATE_REQUEST_SCHEMA } from "../../api/media/narrate/schemas";
import { assembleRecap } from "../../api/media/assemble/assemble";
import { MEDIA_ASSEMBLE_REQUEST_SCHEMA } from "../../api/media/assemble/schemas";
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
      run: async (input) =>
        withTranscriptFile(
          await diarizeFromSource(input.mediaSource, input.model, input.channel),
          "media",
          input.includeTranscript,
        ),
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
          input.reframe,
          input.boundaries,
          input.language,
          input.logo,
          input.maxSeconds,
          input.channel,
          input.paddingSeconds,
        ),
    },
  },
  condense: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: MEDIA_CONDENSE_REQUEST_SCHEMA, run: condenseVideo },
  },
  caption: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: MEDIA_CAPTION_REQUEST_SCHEMA, run: captionVideo },
  },
  effects: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: MEDIA_EFFECTS_REQUEST_SCHEMA, run: applyEffects },
  },
  share: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: MEDIA_SHARE_REQUEST_SCHEMA, run: shareMedia },
  },
  narrate: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: MEDIA_NARRATE_REQUEST_SCHEMA, run: narrate },
  },
  assemble: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: MEDIA_ASSEMBLE_REQUEST_SCHEMA, run: assembleRecap },
  },
};

const MEDIA_DESCRIPTION = `Generic media primitives — content-agnostic, no pipeline baked in. Raw only.
Call with { op, layer?, input }; layer omitted or raw. Needs ffmpeg; ops that write files need persistent disk (refused on Vercel). A source field takes a local path or a public media URL. A YouTube link works only in \`cut\` — otherwise get the file or captions with the \`youtube\` tool first.
Ops (the exact inputs are in INPUT SHAPES below):
- fetch — resolve a source to a local file -> { path, contentType?, sizeBytes? }. \`imageOnly\` stages a reference image for a later \`chatgpt\`/\`claude\` call.
- transcribe — Groq Whisper -> txt|json|srt|vtt, no speaker labels (use diarize). \`srt\` gives segment times at a fraction of \`json\`'s size (json carries token arrays); \`words: true\` + json for per-word times. Pass \`language\` for anything not plainly English ('hi' for Hinglish).
- diarize — speaker-labelled transcript via Gemini audio; spends quota, so for a YouTube source try \`youtube\` op=diarize (free, captions) first. Always returns transcriptPath.
- cut — a video or audio source plus time ranges -> clips of the same type. A YouTube URL is pulled range by range. reframe: center (default) | speaker (follows whoever talks; ~50 s CPU per clip; falls back to center, reported per clip) | blur (whole frame over a blurred fill — film footage). boundaries: exact | natural (edges re-placed on the clip's own speech; pass language) | moment. paddingSeconds defaults to 0.35; 0 for a beat of a longer edit. \`logo\` removes a creator's burned-in logo from the SOURCE before cropping — the only correct place for it; reported once as \`logo\`.
- caption — burn subtitles into an already-cut clip -> { captionedPath, subtitlePath, cueCount, timing, … }. With no \`subtitles\` it transcribes the clip itself, so times are already clip-relative; pass \`subtitles\` only for verbatim wording. \`timing: "aligned"\` needs Roman-script words (script "roman", a listener, or English); anything else comes with timingFallbackReason. Defaults suit a 9:16 Short; \`burn: false\` writes only the .srt.
- effects — grade, hide a region, add your own mark, change speed: one decode, one encode, order grade -> hide -> logo; audio untouched unless \`speed\`. Run before caption. A still image (png/jpg/webp) takes grade and logo only and returns a PNG. \`preview: true\` renders no video: a contact sheet per frame through every grade preset, for a human to pick by eye. \`hide: "auto"\` always writes proofPath — look at it before trusting the result. A creator's logo belongs on \`cut\`, not here.
- condense — remove silences and filler words from a whole source -> one shorter file. Not clip selection.
- share — private media file -> public URL { url, publicPath, bytes, retentionDays } for services that fetch by URL (Composio, Instagram). Only paths under the private media root; \`format: "jpeg"\` for Instagram stills.
- narrate — text -> WAV + words + phrases (+ sentences with gemini). kokoro (default): unlimited, ONE sentence per call. gemini: better Hindi/English but 10 calls a day, so the WHOLE script in one call; fall back to kokoro when its key pool is exhausted. Cut one clip per phrase of its footageSeconds and the picture changes where the words do.
- assemble — narrated sentences + one clip per phrase -> one mp4 whose picture and narration end together, plus subtitlesPath. Caption it with that file as \`subtitles\`, never by transcribing synthetic speech; sentencePauseSeconds 0 for gemini sentences.
Composition is the caller's job: diarize -> segment -> cut is a podcast clipper, fetch -> cut a manual trim.`;

export function registerMediaTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "media",
    description: MEDIA_DESCRIPTION,
    ops: MEDIA_OPS,
  });
}

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
import { shareMedia } from "../../api/media/share/share";
import { MEDIA_SHARE_REQUEST_SCHEMA } from "../../api/media/share/schemas";
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
        withTranscriptFile(await diarizeFromSource(input.mediaSource, input.model), "media", input.includeTranscript),
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
  caption: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: MEDIA_CAPTION_REQUEST_SCHEMA, run: captionVideo },
  },
  share: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: MEDIA_SHARE_REQUEST_SCHEMA, run: shareMedia },
  },
};

const MEDIA_DESCRIPTION = `Generic media primitives — content-agnostic, no pipeline baked in. Raw only.
Call with { op, layer?, input }. layer must be omitted or raw. Needs ffmpeg on the host; ops writing files need persistent local disk (refused on Vercel).
Never touches YouTube-specific code — a YouTube link is just a URL here, and will fail as one — with ONE exception: \`cut\` (below). For every other op, getting a YouTube video onto local disk, or reading its own captions, is the \`youtube\` tool's job (op=video_download, op=diarize); hand this tool the resulting local path or transcript.
Any source field otherwise accepts a local filesystem path or a publicly-reachable media URL.
Ops:
- fetch (raw) — resolve a source to a local file, optionally validated. input: source, imageOnly? (reject unless a real image content-type; use this to stage a reference image for a later \`chatgpt\`/\`claude\` call), maxBytes? -> { path, contentType?, sizeBytes? }
- transcribe (raw) — speech to text via Groq Whisper -> txt|json|srt|vtt. No speaker labels — use diarize for that. input: mediaSource, format?, language?, model?
- diarize (raw) — speaker-labelled transcript via Gemini audio. Costs real money/quota — for a YouTube source, try \`youtube\` op=diarize (free, captions-based) first; only fall back here if that fails or there are no captions. input: mediaSource, model?, includeTranscript? (false = return transcriptPath + summary instead of the inline transcript). Always returns transcriptPath.
- cut (raw) — a video OR audio source plus time ranges -> clip files of the same type (audio in -> audio clips, video in -> video clips; aspectRatio is ignored for audio). Ranges may come from anywhere (segment.by_speech, a human, another system). videoSource MAY be a YouTube URL and SHOULD be for YouTube sources: cut resolves the signed stream URLs itself and pulls ONLY the requested ranges (stream-direct) — a few MB per clip instead of the whole video. Never \`youtube\` op=video_download a video just to cut it: that downloads the entire file (often 1GB+) through the metered proxy, and cutting a download that is still in progress fails. input: videoSource, clips[{start,end,label?}], diarized?, aspectRatio?
- caption (raw) — burn readable subtitles into a video -> { captionedPath, subtitlePath, cueCount, source, language?, durationSeconds }. Normally called on an ALREADY-CUT clip with NO \`subtitles\`: it transcribes that clip's own audio, so timings are already relative to the clip and there is no re-timing step to get wrong. Only pass \`subtitles\` (SRT/VTT text or a path) when the wording must be verbatim. Long transcript segments are re-wrapped into short lines automatically. Defaults are tuned for a 9:16 Short — white bold text with a heavy outline, placed in the middle band because Shorts/Reels/TikTok chrome covers the bottom third. input: videoSource, subtitles?, language?, model?, style? {fontName,fontSize,primaryColour,outlineColour,outline,shadow,bold,uppercase,position:middle|lower-third|bottom,marginV}, wrap? {maxCharsPerLine,maxLinesPerCue}, burn? (false = write only the .srt sidecar, no re-encode)
- condense (raw) — remove silences and filler words from a whole video OR audio source -> one shorter file of the same type. Not clip selection. input: videoSource, silenceThresholdDb?, minSilenceSeconds?, keepPaddingSeconds?, removeFillers?, fillerWords?, language?
- share (raw) — give a private media file (a \`cut\`/\`caption\` output) a public URL for an external service that can only fetch by URL, e.g. a Composio upload -> { url, publicPath, bytes, retentionDays }. Unguessable name; public files are deleted after retentionDays. Only paths under the private media root are accepted. input: path
Composition is the caller's job: diarize -> segment -> cut is a podcast clipper, fetch -> cut is a manual trim. No op assumes what the media is.`;

export function registerMediaTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "media",
    description: MEDIA_DESCRIPTION,
    ops: MEDIA_OPS,
  });
}

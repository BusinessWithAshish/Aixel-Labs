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
          input.reframe,
          input.boundaries,
          input.language,
          input.logo,
          input.maxSeconds,
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
};

const MEDIA_DESCRIPTION = `Generic media primitives — content-agnostic, no pipeline baked in. Raw only.
Call with { op, layer?, input }. layer must be omitted or raw. Needs ffmpeg on the host; ops writing files need persistent local disk (refused on Vercel).
Never touches YouTube-specific code — a YouTube link is just a URL here, and will fail as one — with ONE exception: \`cut\` (below). For every other op, getting a YouTube video onto local disk, or reading its own captions, is the \`youtube\` tool's job (op=video_download, op=diarize); hand this tool the resulting local path or transcript.
Any source field otherwise accepts a local filesystem path or a publicly-reachable media URL.
Ops:
- fetch (raw) — resolve a source to a local file, optionally validated. input: source, imageOnly? (reject unless a real image content-type; use this to stage a reference image for a later \`chatgpt\`/\`claude\` call), maxBytes? -> { path, contentType?, sizeBytes? }
- transcribe (raw) — speech to text via Groq Whisper -> txt|json|srt|vtt. No speaker labels — use diarize for that. input: mediaSource, format?, language?, model?
- diarize (raw) — speaker-labelled transcript via Gemini audio. Costs real money/quota — for a YouTube source, try \`youtube\` op=diarize (free, captions-based) first; only fall back here if that fails or there are no captions. input: mediaSource, model?, includeTranscript? (false = return transcriptPath + summary instead of the inline transcript). Always returns transcriptPath.
- cut (raw) — a video OR audio source plus time ranges -> clip files of the same type (audio in -> audio clips, video in -> video clips; aspectRatio is ignored for audio). Ranges may come from anywhere (segment.by_speech, a human, another system). videoSource MAY be a YouTube URL and SHOULD be for YouTube sources: cut resolves the signed stream URLs itself and pulls ONLY the requested ranges (stream-direct) — a few MB per clip instead of the whole video. Never \`youtube\` op=video_download a video just to cut it: that downloads the entire file (often 1GB+, minutes), and cutting a download that is still in progress fails. input: videoSource, clips[{start,end,label?}], diarized?, aspectRatio?, reframe? ('center' default | 'speaker': follow whoever is talking — camera cuts + face tracking + LR-ASD lip-sync choose the face, crops cut on speech onsets; crosstalk, shared laughs and at least every 15 s show the whole frame over a blurred fill instead; about 50 s of CPU per clip; each clip gets reframe {mode, fallbackReason?, segments?, wideSegments?, planPath?} and falls back to the centre crop rather than failing), boundaries? ('exact' default | 'natural': re-place each clip's edges on its own audio — start on the phrase's first word, end after the thought's last word plus any laugh/applause until it quiets, never into the next sentence; moves edges a few seconds at most; one short Groq transcription per clip; each clip gets boundaries {mode, endReason: pause|reaction|unchanged, fallbackReason?} and cutStartSeconds/cutEndSeconds are the placed edges; short audio fade in/out), language? (ISO 639-1 spoken-language hint for 'natural' — pass it for anything not plainly English, e.g. 'hi' for Hinglish), logo? {regions:'auto'|[{x,y,width,height}] in SOURCE pixels, style?:fill|blur|pixelate, strength?}\n  - logo (on \`cut\`, NOT \`effects\`) — takes a burned-in logo out of the SOURCE before anything is cropped, so the reframe, the captions and every later step simply never see it. This is the only correct place for it: in the source frame a logo never moves, but in a clip already reframed to follow the speaker the same logo lands somewhere different from moment to moment, and covering it afterwards means tracking a moving target. 'auto' cuts one short unframed probe and finds it; explicit rectangles skip the probe and are better once a creator's mark is known, since it sits in the same place in everything they publish. style 'fill' (default) paints the region in the colour of the background around it — invisible on a plain set — and falls back to blur when that background is not flat enough. Reported once per call as \`logo\` {regions, covers[{region,style,surround,fellBackFrom}], detected?, filter?, note?}, never per clip.
- caption (raw) — burn readable subtitles into a video -> { captionedPath, subtitlePath, cueCount, source, language?, durationSeconds }. Normally called on an ALREADY-CUT clip with NO \`subtitles\`: it transcribes that clip's own audio, so timings are already relative to the clip and there is no re-timing step to get wrong. Only pass \`subtitles\` (SRT/VTT text or a path) when the wording must be verbatim. Long transcript segments are re-wrapped into short lines automatically. Defaults are tuned for a 9:16 Short — white bold text with a heavy outline, placed in the middle band because Shorts/Reels/TikTok chrome covers the bottom third. input: videoSource, subtitles?, language? (pass the spoken language, e.g. 'hi', so no words are dropped), model?, script? ('native' default | 'roman': rewrite non-Latin words in everyday Roman script, e.g. Hinglish 'kya scene hai'; pair with language), style? {preset:lines|chunks (chunks = 1–3 big uppercase words at a time, spoken word highlighted, sliding in, placed above-ui by default; needs transcription, not subtitles),fontName,fontSize,primaryColour,highlightColour,outlineColour,outline,shadow,bold,uppercase,position:middle|lower-third|bottom|above-ui (above-ui = just above the Reels/Shorts bottom UI),marginV}, wrap? {maxCharsPerLine,maxLinesPerCue}, burn? (false = write only the .srt sidecar, no re-encode)
- effects (raw) — treat a clip: colour grade, cover a region, composite your own mark. For a CREATOR'S LOGO prefer \`cut\`'s \`logo\` input instead — it runs before the crop, where the logo still holds still; \`effects.hide\` here is for a region you already know in an already-final clip. ONE decode and ONE encode however many of the three you ask for; audio is stream-copied untouched. Runs BEFORE caption (captions burn in white-with-outline and grading afterwards shifts their colour). Order inside the op is fixed: grade -> hide -> logo, so your own mark is never graded and never blurred. input: videoSource, grade?, hide?, logo?, preview?, at?  -> { outputPath, applied{preset,filters}, hide{regions,style,detected?,proofPath?,note?}, logo{file,position,widthPixels}, durationSeconds, width, height }
  - grade — {preset:neutral|punch|warm|cool|film|mono, contrast?, brightness?, saturation?, gamma?, temperature? (kelvin), sharpen?}. Every field but \`preset\` is an override applied on top of it. \`punch\` is a contrast look and \`warm\` a colour look — they are deliberately different in kind, not strength. \`film\` carries real temporal grain, so it encodes larger than the others.
  - preview — \`preview: true\` renders NO video. It grabs still frames and tiles the same frame through EVERY preset into one labelled contact sheet per frame -> { previews[{atSeconds, sheetPath}], tileOrder }. This is how a look gets picked: a grade is judged by eye on real footage, never from its numbers. Two frames by default (a third and two thirds in) because a grade reads differently on a bright scene and a dark one; \`at\` overrides with up to 5 timestamps in seconds. Send the sheets to a human and let them name a preset.
  - hide — {regions: "auto" | [{x,y,width,height}] (SOURCE pixels), style?: blur|pixelate, strength?}. Covers a creator's bug, a sponsor ident, a broadcaster watermark. "auto" finds overlays that are BOTH still across the clip AND structured — stillness alone selects the dark background of every locked-off podcast set — and always writes \`proofPath\`, a still with every candidate outlined in red. ALWAYS look at that proof before trusting a run; low-confidence candidates are reported in \`detected\` but left uncovered, and \`note\` is set when nothing was found. Explicit regions skip detection and are the better path once a creator's mark is known, since it sits in the same place in everything they publish. NOTE: on a clip already cut with \`reframe: "speaker"\` the source logo lands in DIFFERENT frame positions as the crop moves, so one region cannot cover it — hide on un-reframed footage, or pass every position.
  - logo — {file (local path, PNG with alpha normally), position?: top-left|top-right|bottom-left|bottom-right, scale? (fraction of frame width, default 0.14), opacity?, margin? (fraction of frame width)}. Composited last, so it keeps its own colour whatever the grade.
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

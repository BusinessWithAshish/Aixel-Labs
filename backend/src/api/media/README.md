# Media (`POST /media/*`)

Generic media primitives — resolve a source, transcribe it, diarize it, cut it,
condense it. **Nothing here assumes what the media is.** A podcast, a lecture, a
cartoon episode and a screen recording all take the same path; what differs is
only which ops a caller strings together and in what order.

That is deliberate. This module used to be `viral-clipper`, a podcast-shaped
pipeline with clip scoring welded into it. The scoring half was opinionated —
it only worked on speech — so it now lives parked in `../segment/moments/`, and
what is left here is the part that works on anything.

**Composition is the caller's job.** There is no `/pipeline` endpoint any more;
it was removed precisely because it baked one use case into the server. Compose
in a skill or a workflow instead:

```
fetch -> diarize -> (score somewhere) -> cut      # podcast clipper
fetch -> cut                                      # manual trim from known timestamps
fetch -> transcribe -> cut                        # subtitle-driven cutting
fetch -> condense                                 # strip dead air from a recording
```

`cut` in particular takes a video plus a list of `{start, end}` ranges and does
not care where the ranges came from — a model, a scorer, scene detection, or a
human typing timestamps.

## Why Gemini (not this backend's Claude/Groq surfaces)

YouTube captions are the cheap path when the video already has them —
`youtube` op=`diarize` reads them directly, not this module. ASR inserts `>>` at turn boundaries, and some
creators upload `Name: text` tracks. `>>` is not a speaker id — a 4-person
panel still only gets "someone new started talking." Named tracks map N
speakers directly. ASR tracks get a Gemini **text** pass over those turns
(no audio upload) so speaker_1..N stay stable. Pass `audioSource` when
captions are missing or you need voice-accurate ids. Consecutive lines of one
speaker merge into segments of at most `YOUTUBE_DIARIZE_MAX_SEGMENT_SECONDS`
(5 s) — without that cap, captions with no `>>` marks (most non-English ASR)
became one segment for the whole episode and a ranker had no timestamps to
cut on; at 10 s a payoff line and the next line still shared a segment.

Audio diarization needs **audio** input — a plain undivided transcript has
no speaker signal. Gemini's `generateContent` accepts audio directly and
has documented speaker-diarization support (see
`ai.google.dev/gemini-api/docs/audio`), so one Gemini call does
transcription + diarization together. Viral-moment scoring is a pure text
task afterward — reuses the same model so the two calls compose naturally in
`pipeline.ts`.

## Deployment

HTTP `/media/*` and the `media` MCP tool always register.
Chunked diarization can run 15–20+ minutes (see "Long episodes" below);
The audience-signal sources (comments/chapters) use InnerTube in the
youtube module (no external binary). Run this backend as a persistent process. **Hermes, on the same
host, calls the pipeline's internal URL directly** (e.g.
`http://localhost:<port>/media/...`) — no public URL, no Blob
upload/download round-trip.

## Storage: local disk, not Vercel Blob

This module reads and writes local files directly — **no Vercel Blob**,
which was only ever needed to hand a file between stateless serverless
invocations (a constraint that doesn't exist on a persistent VPS process)
and was capped at Vercel's 1GB free storage limit besides. `cutClipsFromVideo`
refuses to run at all on Vercel (`IS_VERCEL_RUNTIME`, checked in `cut/cut.ts`)
rather than silently writing to a `/tmp` that won't survive the invocation;
`diarize`/`viral-moments` are analysis-only and still run everywhere.

- **Input** (`audioSource` / `videoSource` on `/diarize`, `/fetch`,
  `/cut`) accepts either a local filesystem path (used in place, read
  directly off disk — the expected case when Hermes and this backend share
  the VPS's filesystem) or an http(s) URL (downloaded to a temp dir first,
  for the rare case where the only thing available is a remote link). See
  `resolveMediaSource`/`cleanupResolvedMediaSource` in `download.ts`.
- **Output** — `/cut` writes finished clips straight to
  `MEDIA_CUT_OUTPUT_DIR` (fixed at `{AIXEL_MEDIA_ROOT}/private/media-cuts`;
  unset root → `<cwd>/storage/private/media-cuts`) and returns each clip's
  local `clipPath` in the response instead of an uploaded URL. Repoint the
  whole tree by setting `AIXEL_MEDIA_ROOT` — this subpath isn't
  independently overridable, see `src/media.ts`; the directory is created
  automatically if missing. These paths are private working files — copy
  into `{AIXEL_MEDIA_ROOT}/public` only when a fetchable
  `https://hermes.aixellabs.in/media/…` URL is needed.

## Env

- `GEMINI_API_KEY_FREE` — **required**. Deliberately a separate key/env var
  from any other Gemini key in this project: each key must live in a Google
  Cloud project with **no billing account linked**, so it's Free tier by
  construction. Confirmed directly in AI Studio's usage dashboard
  (`aistudio.google.com/usage` → header reads "Free tier" for this key) —
  don't repoint this at a billed key without knowing that changes the cost
  model entirely (see the token-cost notes below).
  **Can be a comma-separated list of multiple free-tier keys**
  (`key1,key2,key3`) — see "Multi-key pool + retry" below. The pool NEVER
  falls back to `GEMINI_API_KEY` (the paid key) automatically; that's a
  deliberate boundary, not an oversight.
- `MEDIA_CUT_OUTPUT_DIR` / `MEDIA_CONDENSE_OUTPUT_DIR` / `MEDIA_FETCH_DIR` —
  not env vars despite the name; fixed subpaths of `AIXEL_MEDIA_ROOT`
  (`private/media-cuts`, `private/media-condense-output`,
  `private/media-fetched` — see `src/media.ts`). Repoint the whole media
  tree via `AIXEL_MEDIA_ROOT` if needed; these aren't independently
  overridable.
- `GROQ_API_KEY` — **required by `/transcribe`** (Groq Whisper). Unrelated to
  the Gemini keys above; `/diarize` and `/transcribe` are separate providers.
- **ffmpeg** — required by `/cut` (clip re-encode), `/condense` (full
  re-encode) and the YouTube download path when a YouTube URL is passed as
  the source. Comes from the `ffmpeg-static` npm dependency, so no
  system install is needed. The captions path and YouTube audience-signal
  sources use InnerTube directly and need no binary at all.

## Endpoints

Every `source` field accepts the same three things: a **local filesystem path**
(used in place, never copied), a **YouTube watch/share URL or video id**
(downloaded via InnerTube through the residential proxy), or any other
**publicly-reachable media URL** (streamed to a temp dir).

### `POST /media/fetch`

`{ source, imageOnly?, maxBytes? }` -> `{ path, contentType?, sizeBytes? }`.

A local path passes through untouched (no `contentType`/`sizeBytes` — nothing
to sniff); a remote URL downloads to `MEDIA_FETCH_DIR` (a fixed, persistent
folder, not a temp dir) — so there's nothing to track or clean up. Named with
a real extension when the content-type is recognized (currently the four
common image types; otherwise left unnamed, as always).

`imageOnly: true` rejects the download unless the response is a real image
content-type — this is what `chatgpt` op=stage_image used to do with its own,
separate, weaker implementation (plain `fetch()`, no gated-CDN fallback);
folded in here instead of staying duplicated. `maxBytes` rejects an
oversized download — checked against `Content-Length` up front when sent,
and against the real file size after writing either way (a backstop, not a
streaming cutoff — fine for reference-image sizes, not a hard cap for
arbitrary large media). Any caller staging a reference image for `chatgpt` or
`claude` uses `imageOnly: true` (and typically a `maxBytes` cap); a plain
media fetch leaves both off.

**Never touches YouTube** — a YouTube link is just a URL here and is rejected
(see below), not silently special-cased. Get a YouTube video onto local disk
via `youtube` op=`video_download` first, then pass this the resulting local
path.

`cut` and `diarize` resolve their own source internally into their own
scratch space, so `fetch` isn't a required first step for either — reach for
it when a workflow genuinely wants the bytes sitting on disk itself, e.g. to
transcribe and cut the same file without pulling it twice.

No duration/resolution/fps in the response either — deliberately. A full
probe would mean adding `ffprobe-static` as a second binary dependency for
fields nothing downstream needs (`cut`/`condense` read duration themselves
off the same ffmpeg banner `getMediaDurationSeconds` already parses;
aspect-ratio reframing works off ffmpeg's own `iw`/`ih` expressions, no
pre-known resolution required).

A source that returns `text/html` (or any `text/*`) instead of media bytes —
concretely, a YouTube watch page, since YouTube's actual video data isn't
reachable through a plain URL fetch — is rejected with a clear error rather
than silently saved as if it were a valid file. This is a generic
content-type check, not YouTube-awareness: it doesn't recognize YouTube's URL
shape, it just refuses to accept a webpage as media, which happens to make a
YouTube link fail here exactly as loudly as a non-YouTube link fails against
`youtube` op=`video_download` — symmetric, in both directions, with neither
side needing to know about the other's domain.

### `POST /media/transcribe`

`{ mediaSource, format?, language?, model? }` -> text in `txt` | `json` | `srt`
| `vtt`. Groq Whisper. Speech to words, no speaker attribution — use `/diarize`
when you need to know *who* spoke. Shares `fetch`'s source resolution (same
local-path-or-URL rules, same content-type guard, same TLS-fingerprint
fallback for sources that block a plain fetch) — it used to have its own
separate, slightly different downloader; that duplication is gone.

### `POST /media/diarize`

`{ audioSource, model? }` -> a `DIARIZED_TRANSCRIPT` (speakers + timestamped
segments). **Gemini audio only** — no `videoUrl` field. For a YouTube source,
try `youtube` op=`diarize` first (free, reads the video's own captions); only
reach for this when that fails or there's no source with captions available
at all — e.g. a video downloaded from somewhere else entirely, or a plain
local file with no platform behind it. This op has no fallback logic of its
own on purpose: which path costs money is a decision made explicitly by
whoever's calling it, never silently inside a retry. Long sources are chunked
— see below. Response has no `source` field any more (it always said
`"gemini_audio"` — dead weight once the captions path lived in a different
tool entirely; `youtube`'s diarize response carries no such field either).

### `POST /media/cut`

`{ videoSource, clips[{start,end,label?}], diarized?, aspectRatio?, reframe?, boundaries?, language? }` ->
`{ clips: CUT_CLIP_RESULT[] }`, one entry per requested range with the actual
boundaries used, the resolved `aspectRatio`, and the finished clip's local
`clipPath` (under `MEDIA_CUT_OUTPUT_DIR`).

Ranges may come from anywhere — `segment` op=`by_speech`, a human, another
system. Pass `diarized` (from either `media` or `youtube`'s diarize — same
shape) to snap each cut to the nearest real speech boundary so clips don't
start mid-word; omit it to cut at the raw timestamps plus fixed padding. A
range falling outside the source's real duration yields an `error` on that
entry rather than failing the whole call. Still the one op in this module
that keeps its own YouTube-specific handling (the stream-direct path below)
— not yet generalized, a deliberately parked follow-up.

#### Natural boundaries (`boundaries: "natural"`)

Transcript timestamps are seconds-coarse (YouTube captions) and a ranker's
`end` is an estimate, so an exact cut often stops mid-word or on the punchline's
last syllable with the laugh cut off. `natural` cuts the range with a few extra
seconds either side (`MEDIA_NATURAL_BOUNDARIES.WINDOW_*`), transcribes that
window with Groq word timings, measures its loudness, and re-places the edges
(`cut/natural-boundaries.ts`):

- **start** — the start of the word the requested start splits, or the nearest
  speech onset after a pause within ~1.5 s;
- **end** — every natural stop from 3 s before to 6 s after the requested end
  (a word followed by a pause, or a sentence-ending word / end of a Whisper
  phrase followed by at least a breath) is scored on how much it looks like an
  ending: quiet after it (capped at 2 s) plus the loud, word-free reaction
  after it (laughter, applause, up to 3.5 s), minus 0.15 per second before the
  requested end or 0.3 per second after it, plus 0.3 per word spoken between
  the requested end and a later stop (running through live speech is how a
  clip spills into the next thought). The best one wins and keeps its reaction until it quiets,
  never into the next word. Searching both ways matters: transcript timestamps
  are whole seconds, so a requested end usually sits 1–3 s after the real
  stop, and searching only later lands on a breath inside the next sentence.
  With no stop in reach the end stays at the end of the word it would split.
- **the last syllable** — Whisper's word ends are early (they snap to its own
  frame grid), so the end is not the word's timestamp: the audio is followed
  past it while it is still speech (`SPEECH_TAIL_*`, at most 0.6 s), and a
  laugh extends it further. Cutting on the raw timestamp clipped the final
  word on roughly half the clips of a batch.

Words Whisper likely invented — inside a no-speech or looping segment
(`dropUnreliableSpans`, shared with `caption`), or smeared over seconds
(music, applause) — are ignored. `cutStartSeconds` /
`cutEndSeconds` report the placed edges and `clips[].boundaries.endReason`
says which rule ended the clip (`pause` / `reaction` / `unchanged`). The trimmed
clip gets a 0.1 s audio fade in and 0.15 s fade out, so an ending under crowd
noise or an incoming voice lands softly instead of on a clipped syllable. The
fade-out is deliberately short: it has to sit inside the pad after the last
word, because a longer one fades the final syllable itself and the clip reads
as cut off mid-sentence even when every word is there. Pass
`language` (ISO 639-1) for anything not plainly English: auto-detection hears
short mixed Hindi-English windows as English and drops the Hindi words, which
then read as a word-free "reaction". If the audio cannot be analysed the
requested range is kept and
`boundaries.fallbackReason` says why. With `reframe: "speaker"` the trim
happens first, so the crop is planned on the final clip.

#### Speaker reframe (`reframe: "speaker"`)

Cropped clips (`aspectRatio` other than `original`) can follow whoever is talking
instead of the fixed centre crop. `cut` cuts the range unframed into a temp file,
spawns the Python worker in `backend/workers/reframe` (`python -m reframe`), and
renders the returned `plan.json` with a piecewise ffmpeg crop (`cut/reframe.ts`).
The worker plans only: camera cuts (PySceneDetect), faces (YuNet) and which face
is speaking (LR-ASD, lip motion matched to the audio — no captions needed).
Single-face shots follow the editor's own cut; multi-face shots cut on speech
onsets. Some stretches show the whole frame instead, fitted to the width over a
blurred copy of itself: shots with no usable face, crosstalk, a shared laugh, and at least every 15 s on an
existing cut, so a clip is never tight crops alone (`clips[].reframe.wideSegments`
counts them). About 50 s of CPU per clip.

Never fails a clip: worker missing, error or timeout renders the centre crop (a
clip with no usable face at all renders wide throughout) and sets `clips[].reframe.fallbackReason`. The plan is kept beside the clip
(`clip-….reframe.json`). Setup and models: `workers/reframe/README.md`
(`pnpm setup:reframe`).

### `POST /media/condense`

`{ videoSource, silenceThresholdDb?, minSilenceSeconds?, keepPaddingSeconds?,
removeFillers?, fillerWords?, language? }` -> one shorter mp4.

Removes silences and filler words from a whole video, re-encoding it end to
end. **This is not clip selection** — it shortens one video in place rather
than choosing excerpts from it. Not yet generalized to hand back the same
media type it was given (an audio-only input currently fails — its ffmpeg
step assumes both a video and an audio stream) — another parked follow-up.

### `POST /media/caption`

`{ videoSource, subtitles?, language?, model?, style?, wrap?, burn? }` ->
`{ captionedPath?, subtitlePath, cueCount, source, language?, durationSeconds }`.

Burns readable subtitles into a video. The normal call passes **only
`videoSource`**, pointing at an already-cut clip, and lets the op transcribe
that clip's own audio.

**Why transcribe the clip rather than reuse the episode's transcript.** A clip
cut from minute 35 of a podcast needs captions timed from *its* zero. Slicing
the episode transcript means re-timing every cue by the clip's start offset —
arithmetic that is easy to get subtly wrong and produces captions that drift
without ever failing loudly. Whisper on the clip returns timings that are
already relative to the clip, so the whole re-timing step ceases to exist. It
is also more accurate: 40 seconds of clip audio beats a slice of a two-hour
auto-caption track. `subtitles` (SRT/VTT text, or a path to a file) exists for
the case where wording must be verbatim; its timings are taken as-is and
assumed to be relative to *this* video.

**Line breaking is done here, not by the caller.** Whisper emits long unbroken
segments; they are re-wrapped to fit the frame, with cue timings taken from
real word timestamps (`wordTimestamps`) so a cue appears exactly on its first
spoken word rather than being apportioned by character count.

**Whisper's own warnings are respected.** Segments Whisper marks as likely
invented — compression ratio above 2.4 (it looped a phrase: "I was like, I was
like, …") or no-speech probability above 0.6 (words over music) — are left out
of the captions (`dropUnreliableSpans` in `transcribe/formatters.ts`, the same
filter natural boundaries uses). A short gap reads better than garbage on
screen.

**Presets.** `style.preset` picks how the words appear:

- `lines` (default) — the sentence cues described here.
- `chunks` — the short-form "1–3 words at a time" look: Anton, uppercase, heavy
  outline and soft shadow, the word being spoken recoloured
  (`style.highlightColour`, default yellow), each new chunk sliding up and
  fading in. Built straight from Groq's word timings (`buildWordChunks` in
  `cues.ts`, `chunksToAss` in `ass.ts`): a chunk closes at 3 words, 14
  characters, punctuation, or a pause over 0.6 s, and each word is one ASS
  event, so libass does all the animation. It defaults to position `above-ui`
  — text bottom at 31% of the frame height from the bottom (y=1320 on
  1080x1920), above the handle/caption/subscribe block Reels (~480px) and
  Shorts (~380px) draw, with 13% side margins clear of the action rail.
  Needs word timings, so supplied `subtitles` render as `lines`.

**Roman script (`script: "roman"`).** Whisper asked for Hindi writes
Devanagari, and asked for English translates or drops the Hindi — neither gives
the Hinglish people type ("bhai kya scene hai"). So the clip is transcribed in
its real language (`language: "hi"`), and one small Gemini text call
(`caption/transliterate.ts`, free-tier key pool) rewrites the word list one
word for one word: Hindi in everyday Roman spelling, English words spoken in
Hindi back to English spelling. Word count and timings don't change, so both
presets work as before. Latin-script words are untouched; on any failure
(error, word count mismatch) the native script is kept and
`scriptFallbackReason` says why.

Fonts the presets use ship in `backend/assets/fonts/` (Anton, SIL OFL — licence
in `assets/fonts/licenses/`, kept out of the font folder itself because libass
tries to load every file there) and reach libass through the `ass` filter's
`fontsdir`, so nothing is installed system-wide. Glyphs a font lacks (Devanagari in Anton) fall back
through fontconfig to an installed font such as Noto Sans Devanagari.

**Geometry, not guesses.** Font size defaults to a fraction of the frame
height, the vertical margin to a fraction of it too, and characters-per-line
is derived from the usable width and that font size. A fixed pixel default
overflows the frame the moment resolution or font size changes. Every one of
those is overridable: an explicit `style.fontSize` / `style.marginV` /
`wrap.maxCharsPerLine` is honoured verbatim in real source pixels.

**The output is ASS, not SRT + `force_style`.** An SRT carries no resolution,
so libass assumes a default script height of a few hundred pixels and scales
everything up to the real frame — turning `FontSize=48` into roughly 320px of
text on a 1920-tall video. Authoring ASS with `PlayResX/Y` set to the actual
frame makes every measurement mean what it says. The `.srt` sidecar is still
written and returned, since it is the portable artifact worth keeping; the
`.ass` is an implementation detail of the burn.

Defaults are tuned for a 9:16 Short — white bold text, heavy outline, placed
in the **middle band**, because Shorts/Reels/TikTok all overlay their own
chrome across the bottom third and bottom-anchored captions are the single
most common way a clip ships unreadable. `position: "lower-third" | "bottom"`
opt out.

`burn: false` writes only the `.srt` and skips the re-encode — for reviewing
or editing the text before committing to a render. Video is re-encoded
(pixels change); audio is stream-copied.

### `POST /media/share`

Also the `media` MCP tool's `share` op. Copies a file from under the private media root into `{root}/public` with a
random UUID name and returns `{ url, publicPath, bytes, retentionDays }`. For
services that can only fetch by URL — the YouTube publish step stages a clip
into Composio's sandbox from this URL. Paths outside the private root are
refused, so it cannot expose arbitrary host files. `/home/ubuntu/media/prune.sh`
deletes public files after 7 days.

## Stream-direct clip extraction (YouTube sources)

**Why.** The earlier `/cut` path downloaded the **entire source video** at
`quality: "best"` through the Evomi residential proxy before cutting clips
from the local file. A handful of test runs burned ~2 GB of paid Evomi
bandwidth (Evomi dashboard: dominated by `googlevideo.com` subdomains at
231 MB / 448 MB / 357 MB each) — this module used ~25% of what it
downloaded. Residential proxy bandwidth is the most expensive tier, so
pulling a full 4K source to extract a few 30-second clips is unsustainable.

**How.** For a YouTube `videoSource`, `cut/cut.ts` now calls
`resolveVideoSourceForCut` (`download.ts`), which fetches only the signed
googlevideo stream URLs (video + audio) via the proxied InnerTube API call
(KB, no media bytes) and returns them alongside the Evomi proxy URL.
`cutClipFromStream` (`cut/ffmpeg-cut.ts`) then runs ffmpeg with `-http_proxy`
set to Evomi, cutting each clip directly from the two stream URLs:

- ffmpeg issues HTTP **range requests** for only the clip segment, so the
  bytes transiting the residential proxy are ~`clip duration + 3s` per
  stream — not the whole source. A 3-clip job from a 10-min 4K source drops
  from ~300 MB-1 GB to ~30-60 MB of proxy bandwidth.
- **Seek**: fast-seek each input to `max(0, start - 3s)` (keyframe-snapped,
  range request), then accurate output-seek to the requested start and
  `-t` for duration — frame-accurate like the file path, without the
  full-source download. Re-encode (not stream-copy) keeps the same quality
  and carries the aspect-ratio filter.
- **IP / egress**: InnerTube (KB) stays on Evomi. googlevideo media is
  probed from this host: residential/local → ffmpeg fetches the CDN
  **directly** (no Evomi bytes); VPS datacenter → `403`, so ffmpeg still
  uses `-http_proxy` and only the clip range transits Evomi. Override with
  `YOUTUBE_MEDIA_VIA_PROXY=always|never`. The `ip=` param on stream URLs
  is not enforced across two residential IPs; datacenter IPs are blocked
  at googlevideo regardless of the signature.
- **Proxy auth bridge**: ffmpeg's `-http_proxy` parses credentials from the
  URL but does **not** send them as `Proxy-Authorization` on the `CONNECT`
  (confirmed by capturing ffmpeg's bytes), so Evomi rejects an unauthenticated
  CONNECT with `403`. `cut/cut.ts` starts a tiny local CONNECT bridge
  (`proxy-bridge.ts`) for the job **only when `proxyUrl` is set**: ffmpeg
  points `-http_proxy` at `http://127.0.0.1:<port>`, and the bridge
  re-issues each `CONNECT` to Evomi **with** the `Basic` auth header.
- **No proxy / local / direct media**: when Evomi isn't configured, or
  when the googlevideo probe succeeds, `proxyUrl` is `undefined` and
  ffmpeg fetches the stream URLs directly.

**Diarize path unchanged.** `/diarize` still downloads the full audio
(`resolveMediaSource` → `downloadYoutubeMedia({ media: "audio" })`) because
chunked diarization needs random access to segments across the whole
duration. Audio is ~10× smaller than video, so the cost is much lower; the
stream-direct optimization is scoped to the clip path (the bandwidth hog).

**The `/youtube/video/download` HTTP endpoint is also unchanged** — explicit
full downloads still work when a caller genuinely wants the whole file.

## Long episodes: root cause, fix, and what's still open

**The original problem (2026-08-11).** Diarization sent the whole episode's
audio in one `generateContent` call. On an 80-minute real episode, this hit
Gemini's `finishReason=MAX_TOKENS` — confirmed even with `maxOutputTokens`
explicitly raised to 65536 (the model's actual hard ceiling, confirmed via
Gemini's own docs — not something raising the number further can fix).
Before this was caught, the symptom was silent: the JSON still parsed as
valid (Gemini's decoder closes out open structures near the limit), the last
segment's text degenerated into a repeated-word loop, and roughly 61% of the
episode (49+ of 80 minutes) was simply missing from the transcript with no
error raised. `generateStructuredContent` now checks `finishReason` and
throws `GEMINI_TRUNCATED_RESPONSE` (with the usage breakdown attached)
instead of returning partial data as if it were complete. This also means
the previously-recorded "4h19m episode" validation was almost certainly
affected by the same silent truncation and was never actually checked for
full-duration coverage — retracted as unverified.

**Root cause, actually confirmed (2026-08-12).** Two things stack:
1. Gemini 3.x "thinking" tokens are billed AND counted against the *same*
   `maxOutputTokens` ceiling as the visible response — not a separate
   budget (confirmed via observed usage and independently documented, e.g.
   github.com/googleapis/python-genai#2062). `thinkingLevel: "minimal"` is
   the lowest settable level for Gemini 3.x flash models, but per Gemini's
   own docs, thinking **cannot be fully disabled** on Gemini 3 models — some
   "thought signature" tokens are always spent. Applying it to diarization
   anyway (it's strictly better than the default, free) was **not enough on
   its own**: re-tested on the same 80-minute episode with
   `thinkingLevel: "minimal"` set, it still hit `MAX_TOKENS`.
2. The real reason: chunked diarization of the same 80-minute episode (see
   below) showed `candidatesTokenCount` (the actual transcript content,
   nothing to do with thinking) totaling ~58,000 tokens across the full
   episode. A single call for the whole thing needs nearly all of that
   *plus* whatever "minimal" thinking still costs — leaving essentially no
   margin under the 65,536 ceiling. This isn't a tuning problem: an
   80-minute, two-speaker, conversational transcript is just inherently
   close to (or past) what one call can hold, regardless of thinking
   settings.

**The fix: chunked diarization (2026-08-12), implemented and validated for
coverage + speaker consistency.** Long audio (over
`VIDEO.CHUNK_THRESHOLD_SECONDS`, 18 min) is now split into sequential
`VIDEO.CHUNK_DURATION_SECONDS` (15 min) chunks, each diarized in its own
Gemini call — transparent to callers, `diarizeFromSource`'s signature is
unchanged, and short audio still takes the original single-call path with
zero behavior change. The hard part is speaker identity: each chunk is an
otherwise-isolated Gemini call with no memory of prior chunks, so naively
re-diarizing chunk 2 could label the same person "speaker_2" when chunk 1
called them "speaker_1". The fix: after each chunk, a short reference clip
(`VIDEO.REFERENCE_CLIP_SECONDS`, 7s) is extracted per known speaker from
their longest segment so far, and every subsequent chunk's prompt (see
`MEDIA_DIARIZATION_CONTINUATION_PROMPT_HEADER` in constants.ts) includes
those reference clips as extra audio parts, instructing Gemini to
voice-match against them and only mint a new id for a genuinely new speaker
— reusing Gemini's own audio understanding for the matching rather than a
text heuristic.

**Real-world test result (2026-08-12, full 80-minute episode, 6 chunks):**
full coverage confirmed — last segment ended at 1:20:12 against an actual
80:13 episode. Speaker identity held perfectly: `speaker_1`/`speaker_2`
throughout all 6 chunks, no spurious `speaker_3+` from failed voice-matching.
884 segments, 159 laugh markers. This is the core problem — solved and
verified, not theoretical.

**A second, real issue this surfaced: within-chunk timestamp drift.**
Diagnostic anomaly-checking on that same test found several chunk boundaries
where segment timestamps overlapped or jumped — e.g. one 900-second chunk's
own segments were internally timestamped by Gemini as running up to ~1200
seconds, a 33% overshoot. This is Gemini estimating elapsed time from
audio/content pacing, not a true frame-accurate clock — and it's likely a
**pre-existing limitation of the single-call path too**, just invisible
there because there was no ground-truth checkpoint to catch it against;
chunk boundaries incidentally created one. **Fix implemented (2026-08-12):**
since each chunk's true duration is known exactly (we cut it), segment
timestamps are rescaled proportionally whenever Gemini's own max reported
timestamp exceeds the chunk's real duration — compression only, never
stretched on undershoot, since a chunk legitimately having less speech near
its end (trailing silence) is a different, valid case a stretch would wrongly
"fix". This is a linear heuristic (assumes drift is roughly uniform across
the chunk), a real improvement, not a guaranteed-exact fix.

**Not yet re-validated with a full run.** Immediately after implementing the
drift-rescale fix, a second full 80-minute re-test hit a wall unrelated to
either fix: `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, hard limit
**20 `generateContent` requests/day** for `gemini-3.5-flash` on the free-tier
key. A day of testing (this session) had already used most of that budget,
and a single chunked 80-minute run costs ~6 requests on its own. The
type-checks and logic hold, but the drift-rescale fix specifically has not
been empirically re-confirmed on a full run yet — that's the next thing to
do once quota resets.

**New operational constraint worth knowing: the free tier's daily cap.**
This isn't a per-minute rate limit — it's a hard **20 requests/day**
ceiling, discovered because chunking's very success (making long episodes
possible) also multiplies request count per episode (~1 request per 15
minutes of audio). At 20/day, that's roughly **3 long (80min+) episodes per
day**, or a mix — e.g. a 20-minute episode (1 diarize + 1 viral-moments = 2
requests) leaves room for ~9 of those instead. This is a hard ceiling on the
free-tier key specifically (`GEMINI_API_KEY_FREE`); worth watching if this
pipeline sees real usage volume, since hitting it mid-pipeline now surfaces
as a clear `429 RESOURCE_EXHAUSTED` error (not a silent failure), but it
will still block further processing until the daily quota resets.

## Multi-key pool + retry (2026-08-12)

Given the 20/day ceiling above, `GEMINI_API_KEY_FREE` accepts a
**comma-separated list** of free-tier keys instead of just one — e.g.
`GEMINI_API_KEY_FREE=key1,key2` in `.env`. Every Gemini call in this module
(diarization's uploads + generateContent, viral-moments scoring) now runs
through `withGeminiKeyPoolRetry` (`gemini-client.ts`), which:

1. Tries the first key. On a **daily-quota-exhausted** error specifically
   (confirmed via Gemini's own structured error — `quotaId` containing
   `"PerDay"`, not just "any 429") it moves to the next key in the pool
   immediately — retrying the same key would be pointless, the quota won't
   reset for hours. This is the direct answer to "give it another key to
   raise the limit": the pool's effective daily ceiling is `20 × number of
   keys`, and it fails over automatically rather than needing a manual key
   swap mid-run.
2. On other retryable errors (5xx, a non-daily 429) it retries the **same**
   key up to `VIDEO.GEMINI_MAX_ATTEMPTS_PER_KEY` (3) times with
   exponential backoff (or Gemini's own suggested `retryDelay` when
   present), *before* moving to the next key — switching keys for a
   transient blip would waste another key's quota unnecessarily.
3. All uploads that make up one "unit of work" (a chunk's reference clips +
   main audio + the generateContent call referencing them) always use the
   **same** key within one attempt — a file uploaded with key A can't be
   referenced with key B, since they belong to different Google Cloud
   projects.
4. If every key is exhausted/fails, it throws one clear error naming how
   many keys were tried, rather than an opaque failure from whichever key
   happened to be last.

This module never falls back to `GEMINI_API_KEY` (the paid key) under any
circumstance — only `GEMINI_API_KEY_FREE`'s pool. That boundary is
deliberate, matching the "definitely not paying for this" premise the whole
module was built under; silently spending real money on a "just add another
key" request would violate that without consent.

**Also hardened in the same pass:**
- `waitForGeminiFileActive`'s ACTIVE-polling loop no longer crashes the
  whole operation on one transient network blip mid-poll — a failed poll
  attempt is now treated the same as "not active yet" and retried within
  the existing poll budget, instead of forcing a wasteful full re-upload via
  the outer key-pool retry.
- Gemini's parsed JSON response (both diarization and viral-moments) is now
  validated against a Zod schema (`DIARIZED_TRANSCRIPT_SCHEMA` /
  `GEMINI_VIRAL_MOMENTS_RESPONSE_VALIDATOR` in `schemas.ts`) immediately
  after parsing, instead of trusting it as an unchecked cast. We were
  bitten by exactly this class of bug once already (a diarized segment
  silently missing `end`, which crashed deep inside `cut/boundary-snap.ts` with
  a confusing error) — this fails clearly at the source instead.

**Validated (2026-08-12), two separate real runs.** First attempt (one key,
3-chunk ~38min run) hit the daily quota on chunk 2/3, and
`withGeminiKeyPoolRetry` behaved exactly as designed: identified it as
daily-quota-exhausted specifically (not just "any 429"), skipped pointless
same-key retries, and threw one clear error naming exactly which chunk
failed and why (`"chunk 2/3 (15:00) — tried 1 key(s): ..."`) instead of an
opaque crash. After the quota window cleared, the **same 3-chunk run
completed cleanly end to end**: full coverage (last segment ended at
exactly 38:00 against a 38-minute source), `speaker_1`/`speaker_2` held
consistently across all 3 chunks, 566 segments, and — the specific thing
being re-tested — **zero timestamp anomalies** from the drift-rescale fix
(vs. 66 observed on the pre-fix 80-minute/6-chunk run). The
fallback-to-a-second-key path specifically still hasn't been observed live
(only one key has been configured for any test so far) — that's the one
piece of this still unconfirmed by a real run. Also worth noting: quota
recovery didn't look like a clean once-a-day reset — hit the wall again
after only ~2 successful calls following what looked like a reset earlier
the same day, consistent with a rolling 24h window per request rather than
a fixed daily reset.

## Validated behavior (real episodes, 2026-08-10/11)

- 2/2 speaker accuracy (host vs. guest) on a 47-minute episode of *The
  Ranveer Show* and a 20-minute segment of *PGX (Prakhar Gupta) ft. Ravi
  Gupta* — both fully within the single-call ceiling above, both confirmed
  to cover their entire requested duration (last segment's `end` matched the
  source length).
- Segment granularity is **not fully deterministic** run-to-run on the same
  audio (63 vs. 93-94 segments observed across runs of the same 47-min
  episode) — correctness held every time, but if a caller needs stable
  segment counts, that's an open tuning item, not yet addressed.
- Viral-moment output consistently produced well-spread (no near-duplicate
  beats), diverse hook-type candidates with plausible, non-generic titles,
  and (2026-08-11, hook/body/button prompt) consistently respected the
  `maxClipSeconds` ceiling and produced literal, checkable `hook_line`
  quotes and coherent `ending_note` justifications on real content.
- `snapped: true` (the tighter segment-boundary snap in `cut/boundary-snap.ts`,
  vs. the looser fixed-padding fallback) was **not observed on either
  2026-08-10 test run** — every clip fell back to padding-only. It **was**
  observed for the first time on 2026-08-11, on 3 of 6 cut clips from the
  laughter-capture + genre-aware run — plausibly because the extra `[laughs]`
  markers shift where segment boundaries fall (a laugh is a natural
  conversational pause point), giving the LLM's chosen cut points more real
  boundaries to land near. Not confirmed as the actual causal mechanism, just
  the most likely explanation given the timing — still worth widening
  `BOUNDARY_SNAP_MAX_DISTANCE_SECONDS` if snap rate matters more than this.
- **Genre-aware scoring + laughter capture, validated on real content
  (2026-08-11)**: on the 20-minute *PGX ft. Ravi Gupta* segment (a comedy
  podcast), `podcast_tone` correctly came back `"comedy"` with an accurate,
  specific `podcast_tone_note`. 36 of 212 diarized segments got `[laughs]`
  markers (the diarization prompt no longer discards them), and the
  viral-moment candidates that scored highest were consistently the ones
  with `has_audible_laughter: true` at a real punchline — including the
  exact "friend had a baby" / "stork myth" beat a human reviewer had
  separately flagged as the best moment from an earlier (pre-fix) run of
  this same episode, which the pre-fix prompt had ranked well but not
  clearly above informative-but-not-funny candidates.
- **Audience signals correlated with the model's own top picks, not just
  noise (2026-08-11)**: real YouTube comment timestamps ("13:01 is the
  funniest thing I ever had 😂😂😂😂", "11:55 wife per gandi najar thi 😂😂😂😂")
  clustered right inside the model's own #1/#2 candidate range (11:33-13:16)
  picked independently from the transcript alone, and a separate comment at
  15:45 landed almost exactly on the #4 candidate's start (15:37). Small
  sample, not a rigorous validation, but a real, non-cherry-picked overlap
  worth noting.
- Run-to-run candidate selection is **not fully deterministic** either (same
  caveat as segment-count variance above) — a joke a human reviewer
  specifically called out as the best moment in one run wasn't among the
  top-8 candidates returned in a later run on the same audio with the same
  request, despite being clearly laugh-marked in the transcript both times.
  Likely LLM sampling variance in a densely-funny 20 minutes with more good
  candidates than the requested `maxCandidates`, not a scoring regression —
  not yet investigated further.
- Token cost is dominated by Gemini's "thinking" tokens, which bill at the
  **output** rate — see `constants.ts` for the prompts actually used; don't
  change the model without re-checking cost, since flash-tier "thinking"
  cost varies a lot by model generation.
- `aspectRatio` crop/scale math (2026-08-11) was verified against synthetic
  ffmpeg-generated test sources (both a 16:9 and a 9:16 source, all 4
  `aspectRatio` values), confirming correct output pixel dimensions for both
  the width-cropping and height-cropping branches of the filter, then
  confirmed again on real cut clips from real episode content (6/6 clips at
  exactly 1080x1920 for `"9:16"`). The hook/body/button prompt rewrite and
  the `hook_line`/`ending_note`/dynamic-duration fields have also now been
  scored against real transcripts on two separate episodes and held up.

## Layout

```
video/
  index.ts                  # routes: /fetch, /transcribe, /diarize, /cut, /condense, /caption + module public surface
  handler.ts                # re-exports the six per-op handlers
  create-handler.ts         # thin handler factory (zod validate -> service -> ALApiResponse)
  gemini-client.ts          # generic Gemini File API + generateContent(responseSchema) helpers
  source.ts                 # resolveMediaSource (download to local) + resolveVideoSourceForCut (YouTube stream-direct URLs, no full download)
  fetch/                    # POST /media/fetch — source -> local path
    fetch.ts / handler.ts / schemas.ts
  transcribe/               # POST /media/transcribe — Groq Whisper
    client.ts                  # resolve -> ffmpeg-normalize -> Groq -> format
    groq-client.ts / formatters.ts / ffmpeg.ts / download.ts
    handler.ts / schemas.ts / constants.ts / types.ts
  diarize/                  # POST /media/diarize — speaker labels, Gemini audio only
    audio.ts                   # Gemini audio path: single call OR chunked (long audio) with reference-clip voice matching
    captions.ts                # YouTube-captions path: named tracks direct, ASR `>>` turns via a Gemini text pass
    handler.ts / schemas.ts / constants.ts
  cut/                      # POST /media/cut — ffmpeg extraction
    cut.ts                     # orchestration: resolve source -> per-clip snap+cut -> write to MEDIA_CUT_OUTPUT_DIR
    ffmpeg-cut.ts              # single-clip re-encode + aspect-ratio filter + duration read + audio-chunk cutting
    boundary-snap.ts           # MM:SS parsing + segment-boundary snap-or-pad logic
    proxy-bridge.ts            # local CONNECT bridge: adds Evomi auth to ffmpeg's -http_proxy CONNECTs (stream-direct path)
    handler.ts / schemas.ts
  condense/                 # POST /media/condense — silence + filler removal
    client.ts / silence.ts / fillers.ts / ranges.ts / assemble.ts
    handler.ts / schemas.ts / constants.ts / types.ts
  caption/                  # POST /media/caption — burn-in subtitles
    caption.ts                 # orchestration: probe -> transcribe (or parse `subtitles`) -> .srt + .ass -> burn
    cues.ts                    # word-timed cue building, greedy line packing, SRT/VTT parsing + serialization
    ass.ts                     # ASS document with PlayResX/Y = real frame size (why font size is meaningful)
    ffmpeg-caption.ts          # the `ass` filter burn-in
    handler.ts / schemas.ts / types.ts
  types.ts / constants.ts   # DIARIZED_TRANSCRIPT SSOT, shared limits/errors/prompts
  README.md

../segment/moments/         # parked clip scorer — not mounted, not an MCP op (see its README)
../../mcp/tools/media.ts    # `media` MCP tool: fetch, transcribe, diarize, cut, condense, caption
../../config.ts             # ENDPOINTS.VIDEO mount (always registered)
../../utils/timestamp.ts    # shared MM:SS <-> seconds helpers (used here + youtube audience-signal formatters)
```

## Ownership boundaries

YouTube scraping lives in the `youtube` module, not here:

| Concern | Where to get it |
|---|---|
| Captions / transcript | `POST /youtube/video/transcript` · `youtube` MCP `op=transcript` |
| Comments (+ timestamp clusters) | `POST /youtube/video/comments` intel · `youtube` MCP `op=comments layer=intel` |
| Chapters | `POST /youtube/video/chapters` · `youtube` MCP `op=chapters` |
| Media download / stream URLs | `youtube/download/` (used internally by this module's `download.ts`) |
| Audience-signal formatters | `youtube/intelligence/audience-signals.ts` (`formatCommentTimestampClustersAsAudienceSignals` / `formatChaptersAsAudienceSignals`) |

The video module owns speaker labeling and cutting only (scoring is parked in `../segment/moments/`). Captions
diarize stays here (reading captions is a scrape; *labeling speakers* is a
a diarize concern) and already calls `fetchYoutubeVideoTranscript` — there is
exactly one captions implementation.

# Viral Clipper pipeline (`POST /viral-clipper/*`)

Turns a full podcast/video episode into ranked short-form clip candidates —
speaker diarization, then viral-moment scoring — via Gemini's audio
understanding + structured-output surface, then cuts the winning candidates
into actual clip files with `/cut`.

`/cut` is deliberately a **separate, generic endpoint** — it takes a video +
a list of `{start, end}` ranges and doesn't care which pipeline produced
them. Other future pipelines (non-podcast content, manually-picked
timestamps, etc.) can call it directly without going through `/diarize` or
`/viral-moments` at all. Merging `/cut` into `/pipeline` as one call is a
later decision, not made yet.

## Why Gemini (not this backend's Claude/Groq surfaces)

Diarization needs **audio** input — a text transcript alone has no speaker
signal, no matter how the prompt is written. Gemini's `generateContent`
accepts audio directly and has documented speaker-diarization support (see
`ai.google.dev/gemini-api/docs/audio`), so one Gemini call does
transcription + diarization together. Viral-moment scoring is a pure text
task afterward — reuses the same model so the two calls compose naturally in
`pipeline.ts`.

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
- `BLOB_READ_WRITE_TOKEN` — same Vercel Blob store the `transcription` module
  uses. **This store is private-only** — `access: 'public'` is rejected;
  uploads must use `access: 'private'`, and downloads send the token as a
  bearer header to match (see `download.ts`, and `scripts/viral-clipper-smoke.ts`
  for a working example).
- **`yt-dlp` binary** (system-level, not an npm dependency) — required by
  `/viral-clipper/youtube-comments` and `/viral-clipper/youtube-chapters` only (the
  core diarize/viral-moments/cut endpoints don't need it). No YouTube Data
  API key exists in this project, so both endpoints shell out to a system
  `yt-dlp` install instead — same public endpoints youtube.com itself uses,
  no quota/key required. **Production-readiness not yet verified**: unlike
  `ffmpeg` (bundled via the `ffmpeg-static` npm package, works anywhere Node
  runs), this backend has no `Dockerfile` of its own in the repo (only
  `browser-worker` does), which suggests it deploys via a Node buildpack —
  those don't install arbitrary system binaries like `yt-dlp`. Confirmed
  working locally (this machine has `yt-dlp` via Homebrew); whether it's
  present on the actual Cloud Run deploy target is unconfirmed. If not, these
  two endpoints will fail there until either the deploy adds `yt-dlp` or a
  bundled-binary npm alternative is adopted (no reliably-maintained one
  identified yet, unlike `ffmpeg-static`).

## Endpoints

### `POST /viral-clipper/diarize`

```jsonc
{ "blobUrl": "https://....private.blob.vercel-storage.com/....mp3", "model": "gemini-3.5-flash" /* optional */ }
```

Returns `ALApiResponse<VIRAL_CLIPPER_DIARIZE_RESPONSE>` — `{ transcript: DIARIZED_TRANSCRIPT, usage }`.

**Long audio is chunked automatically** — no request-shape difference. Audio
over `VIRAL_CLIPPER.CHUNK_THRESHOLD_SECONDS` (18 min) is transparently split into
sequential `VIRAL_CLIPPER.CHUNK_DURATION_SECONDS` (15 min) chunks internally;
`usage` is the sum across all chunk calls. See "Long episodes: root cause,
fix, and what's still open" below for how this actually works and its
current caveats.

### `POST /viral-clipper/viral-moments`

```jsonc
{
  "diarized": /* a DIARIZED_TRANSCRIPT, e.g. straight from /diarize's response */,
  "minCandidates": 8, "maxCandidates": 12,
  "minClipSeconds": 15, "maxClipSeconds": 60, // optional — see "Clip duration" below
  "channelContext": "The Ranveer Show — long-form Indian interview podcast, audience skews 18-30, business/self-improvement/pop-psychology", // optional
  "audienceSignals": ["13:17 — chapter: \"Hilarious bit on the singer - Kaka\"", "10:30 — 1 viewer mentioned this, 8 likes total (e.g. \"10:30 😂😂😂😂...\")"] // optional — see "Audience signals" below
}
```

Returns `ALApiResponse<VIRAL_CLIPPER_VIRAL_MOMENTS_RESPONSE>` — `{ candidates: VIRAL_MOMENT_CANDIDATE[], podcast_tone, podcast_tone_note, usage }`. Each candidate now also carries `hook_line` (the exact opening words the clip's `start` should align to), `ending_note` (why the clip's `end` is a real stopping point), and `has_audible_laughter` — see "Prompt structure" and "Genre-aware scoring" below.

**Clip duration** — `minClipSeconds`/`maxClipSeconds` default to 15/60 (Shorts/Reels length), enforced both in the prompt text and validated by `VIRAL_CLIPPER.MIN_CLIP_SECONDS`/`MAX_CLIP_SECONDS` (15/120 — the hard bounds a caller can request). Long-form source content naturally produces longer candidate beats; without an explicit ceiling the model tended toward ~90s clips. Pass a higher `maxClipSeconds` explicitly if you actually want longer YouTube-Shorts-style clips.

**`channelContext`** is optional free text describing the show/channel and its audience — it's injected into the prompt to weight which moments and `hook_type`s fit that specific audience (with an explicit "don't fabricate niche claims" guard). Omit it and the prompt still produces good generic results; it isn't required to get quality output, it's a tuning knob.

**`audienceSignals`** is an optional array of pre-formatted strings — real viewer/creator behavior on this exact episode (which moments viewers themselves called out as funny/memorable in comments, and/or the creator's own chapter titles) used to bias candidate selection toward moments already externally validated, not just what the model guesses. This endpoint doesn't fetch that data itself — call `/viral-clipper/youtube-comments` and/or `/viral-clipper/youtube-chapters` first (or their MCP equivalents) and pass their formatted output straight in (`formatCommentHighlightsAsAudienceSignals` / `formatChaptersAsAudienceSignals` from `youtube-comments.ts` / `youtube-chapters.ts` do the formatting for you). See "Audience signals" below for why this is a separate call rather than baked into `/viral-moments` itself.

### `POST /viral-clipper/pipeline`

Convenience endpoint — same request shape as `/diarize` plus the same
`minCandidates`/`maxCandidates`/`minClipSeconds`/`maxClipSeconds`/`channelContext`/`audienceSignals`
options as `/viral-moments` above — runs both steps and returns
`ALApiResponse<VIRAL_CLIPPER_PIPELINE_RESPONSE>` — transcript + candidates +
`podcast_tone`/`podcast_tone_note` + usage for both calls. This is the one a
caller normally wants; the split endpoints exist for re-scoring a transcript
you already have without paying for diarization again.

### `POST /viral-clipper/youtube-comments`

```jsonc
{ "videoUrl": "https://www.youtube.com/watch?v=...", "maxComments": 300 /* optional, default 300 */ }
```

Returns `ALApiResponse<VIRAL_CLIPPER_YOUTUBE_COMMENTS_RESPONSE>` — `{ videoTitle, commentsScanned, highlights: TIMESTAMP_MENTION_CLUSTER[] }`. Fetches the video's top comments via `yt-dlp` (no YouTube Data API key needed/available in this project), extracts `MM:SS`/`H:MM:SS` timestamp mentions from comment text with a regex, and clusters mentions within `VIRAL_CLIPPER.TIMESTAMP_CLUSTER_WINDOW_SECONDS` (10s) of each other — ranked by mention count (weighted) + total likes. Pure extraction + aggregation, **no LLM call**. Not every video has comments referencing timestamps; an empty `highlights` array is a valid, common result.

### `POST /viral-clipper/youtube-chapters`

```jsonc
{ "videoUrl": "https://www.youtube.com/watch?v=..." }
```

Returns `ALApiResponse<VIRAL_CLIPPER_YOUTUBE_CHAPTERS_RESPONSE>` — `{ videoTitle, chapters: CHAPTER_SIGNAL[] }`, the creator's own chapter markers if the video has any (via `yt-dlp`, same no-API-key approach). Most videos don't have chapters — an empty array is a valid result, not an error.

### `POST /viral-clipper/cut`

```jsonc
{
  "videoBlobUrl": "https://....private.blob.vercel-storage.com/....mp4", // the SOURCE VIDEO, not audio-only
  "clips": [{ "start": "17:25", "end": "18:14", "label": "trauma-jokes" }], // any {start,end} list — not tied to VIRAL_MOMENT_CANDIDATE's shape
  "diarized": /* optional DIARIZED_TRANSCRIPT — enables boundary-snapping, see below */,
  "aspectRatio": "9:16" // optional — "9:16" (default) | "16:9" | "1:1" | "original"
}
```

Returns `ALApiResponse<VIRAL_CLIPPER_CUT_RESPONSE>` — `{ clips: CUT_CLIP_RESULT[] }`, one entry per requested clip with the actual cut boundaries used, the resolved `aspectRatio`, and the uploaded clip's Blob URL.

**Output framing** — `aspectRatio` applies to every clip in the request (call `/cut` again for a different ratio on the same clips). `"9:16"` → 1080x1920 (Shorts/Reels/TikTok), `"16:9"` → 1920x1080 (YouTube/landscape), `"1:1"` → 1080x1080 (square), `"original"` → no reframing, just re-encode at the source's native resolution. Reframing is a **centered crop** to the target aspect ratio followed by a scale to the fixed output dimensions — see `buildAspectRatioFilter` in `ffmpeg-cut.ts` for the exact ffmpeg filter (the crop width/height are computed as ffmpeg expressions against the actual decoded frame, so no source-dimension probing step is needed). This is a fixed center-crop, not subject/face tracking — if the interesting content in a wide shot sits off-center, a center-crop can cut it out of frame; there's no automatic reframing-toward-the-speaker here.

Two independent problems, two independent fixes — see `boundary-snap.ts` and `ffmpeg-cut.ts`:

- **No glitches**: `ffmpeg-cut.ts` always re-encodes (`-c:v libx264 -c:a aac`, never `-c copy`). `-ss`/`-to` before `-i` is fast but only seeks to the nearest keyframe, which can be seconds off and cause black-frame/A-V-desync glitches at arbitrary cut points. Clips here are short (<=120s), so re-encoding costs a couple seconds and eliminates the problem entirely — no need for GOP-surgery tooling. Reframing (crop+scale) rides along on this same re-encode pass, no extra cost.
- **No words cut**: not a video-tool problem — ffmpeg has no idea where a word ends. If `diarized` is provided, `boundary-snap.ts` snaps each clip's start/end to the *nearest real speech-segment boundary* (only ever snapping start **backward** and end **forward**, so wanted content is never dropped) when that boundary is within `VIRAL_CLIPPER.BOUNDARY_SNAP_MAX_DISTANCE_SECONDS` (constants.ts) — cheap and safe. Beyond that distance (the suggested timestamp sits deep inside one long segment), snapping all the way back would make the clip unexpectedly long, so it falls back to the raw timestamp + `VIRAL_CLIPPER.CLIP_PADDING_SECONDS` padding instead. **This is a best-effort reduction, not a guarantee** — diarization segments are speaker-turn-level, not word-level, so a cut deep inside a long monologue segment can still land mid-sentence. Word-level timestamps (not currently produced anywhere in this pipeline) would be the real fix if this matters more than the current behavior allows.

## Prompt structure (hook / body / button)

`VIRAL_CLIPPER_VIRAL_MOMENTS_PROMPT_HEADER` (constants.ts) explicitly rubrics every
candidate as three parts, not just "an interesting moment":

1. **Hook** (first 1-3s) — the clip must open ON the hook line itself (a bold
   claim, sharp question, striking number, or the first word of real
   emotion), never on a wind-up. `hook_line` in the response is the model
   quoting the exact words the clip should open on — a cheap, directly
   checkable signal of whether the chosen `start` is actually the hook or a
   few seconds of dead air before it.
2. **Body** — the substance that pays off the hook.
3. **Button** (ending) — a real stopping point (punchline / resolved claim /
   natural pause), never a mid-sentence or filler-word cutoff. `ending_note`
   is the same kind of directly-checkable justification for `end`.

The base prompt is deliberately genre-generic (not hardcoded to specific
shows) so it performs well by default on any long-form interview/talk
content; `channelContext` (see above) is the supported way to tailor it
further without editing the prompt itself.

## Genre-aware scoring (comedy vs. informative)

**2026-08-11.** Early testing surfaced a real quality problem: on a comedy
podcast, the model consistently ranked well-told-but-not-funny informative
stretches (a coherent anecdote, a considered answer) above the moments that
actually made people laugh. The fix is two-part, not a scoring-weight tweak
alone:

1. **`diarize.ts`'s prompt now captures laughter instead of discarding it.**
   Previously, backchannel sounds *including laughter* were explicitly
   filtered out of the transcript as noise (rule 6, pre-2026-08-11). Laughter
   is now its own rule: inline `[speaker_1 laughs]` / `[speaker_2 laughs]` /
   `[both laugh]` markers are inserted at the exact point they happen, at
   near-zero extra token cost (no new segment, just a few characters). This
   is the ground-truth signal everything below depends on — without it,
   "was this actually funny" is unanswerable from a transcript alone.
2. **`viral-moments.ts`'s prompt reads that signal and reasons about genre
   first.** Before picking candidates, the prompt has the model classify the
   episode as `comedy` / `informative` / `mixed` from how often and how
   genuinely the laugh markers fire (not just topic), returned as
   `podcast_tone` + `podcast_tone_note`. On a comedy/mixed episode, a moment
   with real laughter landing at the punchline is instructed to generally
   outscore an equally "interesting" but laugh-free stretch — being
   coherent or informative is explicitly called out as NOT the same as being
   clip-worthy on a comedy-driven show. Each candidate also gets
   `has_audible_laughter: boolean`, which the model must read directly off a
   `[laughs]` marker in range, not infer — a cheap, checkable signal for
   whether a "funny" candidate is actually backed by a real laugh in the
   audio.

This is dynamic per-episode (no hardcoded show list) — a serious/informative
episode is scored on insight/emotion/conflict as before, laughter or not.

## Audience signals (YouTube comments + chapters)

**2026-08-11.** `youtube-comments.ts` and `youtube-chapters.ts` add a second,
independent signal source: what real viewers and the creator themselves
already flagged as notable on this exact episode, via `yt-dlp` (no YouTube
Data API key exists in this project — see the Env section's caveat on
production availability). Comments frequently call out a moment directly
("12:34 lol", "the part at 15:20 killed me") — `youtube-comments.ts` extracts
those timestamp mentions and clusters/ranks them by mention count + likes.
Chapter titles are the creator's own labeling of each section, often naming
the funny/notable bit directly.

**Deliberately a separate call, not auto-fetched inside `/viral-moments` or
`/pipeline`**: the video URL a caller has and the Blob-hosted audio/video
`/diarize`/`/cut` operate on aren't guaranteed to be the same source (Blob
URLs could come from anywhere), and not every caller wants the extra
yt-dlp round-trip or has an actual YouTube URL at all. Fetch
`/viral-clipper/youtube-comments` and/or `/viral-clipper/youtube-chapters` (or their
MCP equivalents, `viral_clipper_get_youtube_comment_highlights` /
`viral_clipper_get_youtube_chapters`) yourself, format with the exported
`formatCommentHighlightsAsAudienceSignals` / `formatChaptersAsAudienceSignals`
helpers, and pass the result as `audienceSignals` to `/viral-moments` or
`/pipeline`. The prompt treats this as a strong prior, not proof — it raises
a nearby candidate's priority, it doesn't override the hook/body/button and
standalone-clip requirements.

## Pipeline

1. `download.ts` — fetch the blob URL to a temp file (bearer token attached,
   no TLS-fallback dance like `transcription/download.ts` has — this is
   always our own Blob URL, never an adversarial third-party source).
2. `gemini-client.ts` → `uploadFileToGemini` + `waitForGeminiFileActive` —
   Gemini's resumable File API upload, polled until `state: "ACTIVE"`
   (required before the file can be referenced in `generateContent`).
3. `diarize.ts` — `generateContent` with the audio file + the diarization
   prompt from `constants.ts`, constrained to `GEMINI_DIARIZATION_RESPONSE_SCHEMA`.
4. `viral-moments.ts` — flattens the diarized transcript into
   `[MM:SS-MM:SS] role: text` lines, sends as plain text with the
   viral-moment rubric prompt, constrained to `GEMINI_VIRAL_MOMENTS_RESPONSE_SCHEMA`.
5. Temp files cleaned up in a `finally` in `diarize.ts`; the smoke-test
   script also deletes its own uploaded blob afterward — the route handlers
   don't own blob lifecycle (caller uploaded it, caller's to delete when
   done).

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
`VIRAL_CLIPPER.CHUNK_THRESHOLD_SECONDS`, 18 min) is now split into sequential
`VIRAL_CLIPPER.CHUNK_DURATION_SECONDS` (15 min) chunks, each diarized in its own
Gemini call — transparent to callers, `diarizeFromBlobUrl`'s signature is
unchanged, and short audio still takes the original single-call path with
zero behavior change. The hard part is speaker identity: each chunk is an
otherwise-isolated Gemini call with no memory of prior chunks, so naively
re-diarizing chunk 2 could label the same person "speaker_2" when chunk 1
called them "speaker_1". The fix: after each chunk, a short reference clip
(`VIRAL_CLIPPER.REFERENCE_CLIP_SECONDS`, 7s) is extracted per known speaker from
their longest segment so far, and every subsequent chunk's prompt (see
`VIRAL_CLIPPER_DIARIZATION_CONTINUATION_PROMPT_HEADER` in constants.ts) includes
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
   key up to `VIRAL_CLIPPER.GEMINI_MAX_ATTEMPTS_PER_KEY` (3) times with
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
  silently missing `end`, which crashed deep inside `boundary-snap.ts` with
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
- `snapped: true` (the tighter segment-boundary snap in `boundary-snap.ts`,
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
viral-clipper/
  index.ts               # routes: /diarize, /viral-moments, /pipeline, /cut, /youtube-comments, /youtube-chapters
  handler.ts              # thin: zod validate -> service call -> ALApiResponse
  diarize.ts                # orchestration: download -> single call OR chunked (long audio) -> generateContent
  viral-moments.ts            # transcript (+ optional audienceSignals) -> flattened prompt -> generateContent
  pipeline.ts                   # diarize.ts + viral-moments.ts combined
  cut.ts                          # orchestration: download video -> per-clip snap+cut -> upload each to Blob
  boundary-snap.ts                  # MM:SS parsing + segment-boundary snap-or-pad logic
  ffmpeg-cut.ts                       # single-clip ffmpeg re-encode cut + aspect-ratio filter + audio-chunk/reference-clip cutting
  gemini-client.ts                     # generic Gemini File API + generateContent(responseSchema) helpers
  download.ts                            # blob URL -> temp file (audio or video, content-agnostic)
  youtube-metadata.ts                      # shared yt-dlp --dump-single-json wrapper
  youtube-comments.ts                        # top comments -> timestamp-mention extraction + clustering
  youtube-chapters.ts                          # creator chapter markers
  schemas.ts / types.ts / constants.ts
  README.md

../../../scripts/viral-clipper-smoke.ts  # end-to-end smoke test (upload -> diarize -> score -> cleanup)
../../mcp/server.ts                 # viral_clipper_get_youtube_comment_highlights / viral_clipper_get_youtube_chapters MCP tools
```

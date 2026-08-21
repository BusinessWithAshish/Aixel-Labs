# Tightening (`POST /tightening`)

Takes a video, removes the dead air and the filler words, and gives back one
tightened video. No clip selection, no reframing, no LLM judgement — the whole
video comes back, just with the wasted time cut out of it.

This is **not** the viral-clipper pipeline. `viral-clipper/` finds interesting
*moments* and cuts them *out* of an episode. This keeps the entire video and
removes the gaps inside it. The two compose fine (tighten first, then clip),
but they're separate operations with separate endpoints.

## Request — `POST /tightening`

```jsonc
{
  "videoSource": "/mnt/media/episode-042.mp4", // local path OR a URL
  "silenceThresholdDb": -30,     // optional, default -30
  "minSilenceSeconds": 0.4,      // optional, default 0.4
  "keepPaddingSeconds": 0.15,    // optional, default 0.15
  "removeFillers": true,         // optional, default true
  "fillerWords": ["uh", "um"],   // optional, overrides the default dictionary
  "language": "en"               // optional ISO-639-1
}
```

Schema: `schemas.ts` → `TIGHTENING_REQUEST_SCHEMA`. Bounds/defaults:
`constants.ts` → `TIGHTENING`.

`videoSource` accepts a **local filesystem path** (read directly off disk —
the expected case when Hermes and this backend share the VPS's filesystem) or
a **publicly-reachable video URL** (downloaded to a temp dir first). See
`resolveMediaSource` in `../transcription/download.ts`.

## Response — `ALApiResponse<TIGHTENING_RESPONSE>`

```ts
{
  videoPath: "/opt/aixel/storage/tightening-output/tightened-....mp4",
  sourceDurationSeconds: 10.03,
  outputDurationSeconds: 6.06,
  removedSeconds: 3.97,
  removedFraction: 0.395,
  cutCount: 5,          // ranges actually cut, after merging
  silenceCutCount: 3,   // removals contributed by the silence pass
  fillerCutCount: 2,    // removals contributed by the filler pass
  droppedCutCount: 0,   // only present if MAX_CUT_RANGES truncated the list
}
```

A **local-path source is never touched** — `resolveMediaSource` reads it in
place and only ever cleans up its own temp download of a URL source. Either
way, tightening is a knob-tuning operation: re-running with a different
threshold shouldn't require re-fetching the video, so nothing about the input
is deleted beyond this call's own temp files.

## Deployment

HTTP `/tightening` and the `tightening` MCP tool (`op=tighten`) always
register. The job always re-encodes the **whole** source video (`select`+
`setpts`) — minutes on anything past a few minutes of source — so run this
backend as a persistent process with ffmpeg, not a short-lived serverless
function.

## Storage: local disk, not Vercel Blob

Same reasoning as `viral-clipper/` (see its README): Blob only existed to hand
a file between stateless serverless invocations, a constraint that doesn't
exist on a persistent VPS process, and it was capped at Vercel's 1GB free
storage limit besides.

- **Input** (`videoSource`) accepts a local path or a URL — see above.
- **Output** — `tightenVideo` writes the finished video straight to
  `TIGHTENING_OUTPUT_DIR` (env var, defaults to
  `<cwd>/storage/tightening-output`) and returns its local `videoPath` in the
  response instead of an uploaded URL. Point `TIGHTENING_OUTPUT_DIR` at
  wherever on the VPS's disk should hold tightened videos; the directory is
  created automatically if missing.

## Pipeline

1. `resolveMediaSource` (**reused from `transcription/`**) — local path used
   in place, or a URL fetched to a temp file (with the TLS-fingerprint
   fallback for gated CDNs).
2. Concurrently, since neither depends on the other and both are full passes
   over the same file:
   - `detectSilences` (`silence.ts`) — one `ffmpeg -vn -af silencedetect -f null -`
     run, parsing `silence_start`/`silence_end` **and** the `Duration:` banner
     out of the same stderr.
   - `getWordTimestamps` (`client.ts`) — `normalizeToFlac` + `transcribeWithGroq`
     (**both reused from `transcription/`**) with `timestamp_granularities[]=word`.
     Skipped entirely when `removeFillers: false`.
3. `shrinkSilences` (`ranges.ts`) — pull `keepPaddingSeconds` off both ends of
   every silence. See "The padding knob" below.
4. `findFillerRanges` (`fillers.ts`) — dictionary match on word timestamps.
5. `mergeRanges` → `capRanges` → `invertToKeepRanges` (`ranges.ts`) — union the
   two removal sets, bridge sub-80ms islands, enforce the range cap, and flip
   the result into a keep-list.
6. `assembleKeepRanges` (`assemble.ts`) — one ffmpeg re-encode, written
   straight to `TIGHTENING_OUTPUT_DIR`.
7. Clean up the resolved source's own temp files in a `finally`.

## The padding knob (`keepPaddingSeconds`)

This is the parameter that decides whether the output sounds edited or sounds
broken, and it's the answer to "don't remove all the audio and make it sound
bad".

A detected silence is **shortened, not deleted**. With the default 0.15, a 2s
pause becomes ~0.3s of retained breathing room rather than a hard splice
between two words. Deleting the full span is what produces the machine-gunned,
gasping-for-air sound people associate with automatic silence removal.

It also self-limits: a silence barely over `minSilenceSeconds` shrinks to
nothing and drops out via `MIN_REMOVAL_SECONDS`, which is correct — those are
the pauses that should survive untouched.

Rough guide:

| `keepPaddingSeconds` | result |
|---|---|
| 0 | maximally aggressive; audible splices, no breathing room |
| 0.10 | punchy, YouTube-jumpcut feel |
| **0.15** | **default — tight but natural** |
| 0.30 | conservative; only genuinely long pauses shrink noticeably |

`silenceThresholdDb` is the other half: nearer 0 (e.g. -20) is more aggressive
and *will* start eating quiet speech; further away (e.g. -45) removes only
near-total silence.

## Why `silencedetect` + `select`, and not the obvious alternatives

**Not `silenceremove`.** ffmpeg ships a filter that would do detection and
cutting in one step, but it's an *audio* filter: it shortens the audio stream
and leaves the video stream at full length, so the result drifts progressively
out of sync. Detecting separately and cutting both streams with one shared
expression is what keeps A/V locked. Verified: on a 20s test source the output
video ran 9.16s and audio 9.19s — a 0.03s offset identical to the source's own,
i.e. no drift introduced.

**Not `trim` + `concat`.** That graph instantiates one input pad per range.
A full-length silence pass routinely produces hundreds or thousands of ranges,
which makes the filtergraph enormous and memory-hungry. `select` is a single
filter evaluating one arithmetic expression (`between(t,a,b)+between(t,c,d)+…`)
per frame, so its cost is flat in the range count. `setpts=N/FRAME_RATE/TB` and
`asetpts=N/SR/TB` then renumber the survivors from zero — without those the
dropped spans come back as freezes rather than closing up.

**The filtergraph goes to a file** via `-filter_complex_script`, not argv: at a
few thousand ranges the expression runs to hundreds of KB and would blow past
the OS argument-length limit.

Re-encoding is mandatory here regardless of where cuts land — `setpts` rewrites
every frame's presentation timestamp, so stream-copy isn't available.

## Filler removal is best-effort, and here's the measurement

**Whisper is trained to emit clean prose and silently drops disfluencies before
this module ever sees them.** You cannot cut an "um" that isn't in the
transcript. Measured on real Groq `whisper-large-v3-turbo` output for a clip
containing three fillers:

| decoder prompt | transcript | fillers located |
|---|---|---|
| none (Whisper default) | "So, I was thinking that we should probably ship this today. **Or** maybe tomorrow." | **0 of 3** |
| `TIGHTENING_VERBATIM_PROMPT` | "So, **um**, I was thinking, **uh**, that we should probably ship this today. **Er**, maybe tomorrow." | **3 of 3** |

So the verbatim prompt is load-bearing, not a nicety — without it filler
removal does nothing at all. It is still not a guarantee: repeat runs on the
same audio have located 2 of 3. Expect most fillers, not all.

Two mechanisms keep filler cuts off the neighbouring real words, because
Whisper reports adjacent words as sharing one boundary timestamp
(`word[i].end === word[i+1].start`) with ~±100ms of real uncertainty:

1. **Inward guard** — each cut is pulled in from both ends, so a misplaced
   boundary eats the filler rather than the tail of the word before it.
2. **Neighbour clamp** — each cut is then clamped to the actual adjacent words'
   timings, so it can never cross into a kept word no matter how wrong the
   transcriber was.

The guard is capped at `FILLER_GUARD_MAX_FRACTION` (15%) of the filler's own
length. That cap exists because of a bug this module was measured into: a fixed
30ms-per-side guard shrank a real 0.10s "uh" to 0.04s, below
`MIN_REMOVAL_SECONDS`, so the filler survived into the output. Scaling the guard
keeps ~70-85% of every filler cut regardless of length.

The **default dictionary is English-only pure disfluencies** (`uh, um, er, erm,
ah, hm, eh, mhm`). Discourse markers — "like", "actually", "basically", "you
know" — are deliberately excluded: they're filler often enough to be tempting,
but they're also load-bearing English words, and cutting a legitimate "like"
mid-sentence is a worse artifact than leaving a filler in. Pass `fillerWords` to
override. Matching normalizes case, strips punctuation, and collapses repeated
letters, so `"Uhhh,"` / `"UM."` / `"Hmmm"` all match the base forms — list base
forms only, and note that the letter-collapse makes the override unsuitable for
words with meaningful doubled letters.

For non-English audio, set `removeFillers: false` (which also skips
transcription entirely and is meaningfully faster) or supply `fillerWords`.

`MAX_CUT_RANGES` (2000) caps the render. Exceeding it degrades gracefully
rather than failing: `capRanges` keeps the **longest** removals — the ones that
actually buy runtime — drops the rest, and reports `droppedCutCount`.

## Layout

```
tightening/
  index.ts        # route + re-exports
  handler.ts       # thin: zod validate -> tightenVideo -> ALApiResponse
  client.ts         # orchestration: resolve source -> (silence || transcribe) -> ranges -> render to local disk
  silence.ts         # ffmpeg silencedetect -> silence ranges + source duration
  fillers.ts          # word timestamps -> filler ranges (guard + neighbour clamp)
  ranges.ts            # shrink / merge / cap / invert to a keep-list
  assemble.ts           # select+setpts filtergraph -> one mp4
  schemas.ts / types.ts / constants.ts
  README.md
```

## Env

- `GROQ_API_KEY` — required unless every call passes `removeFillers: false`.
- `TIGHTENING_OUTPUT_DIR` — optional, where finished videos are written; see
  "Storage" above.

No Gemini key: nothing here needs an LLM. Silence is a signal-processing
question and fillers are a dictionary lookup over timestamps. No Blob token
either — this module never touches Vercel Blob.

## MCP

`tightening` MCP tool, `op=tighten` (`backend/src/mcp/tools/tightening.ts`) wraps
`tightenVideo()` from `client.ts` directly — same function the HTTP handler
calls, no loopback — and reuses `TIGHTENING_REQUEST_SCHEMA` as `input`.

## Notes / tunables

- Every threshold, bound, and encode setting is a named constant in
  `constants.ts` — tune freely.
- `ranges.ts` is pure functions over `{start, end}` with no ffmpeg or network
  dependency, which is where the cut logic should stay testable.

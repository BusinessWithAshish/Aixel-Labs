# Moments — the `by_speech` segmenter

Ranks a diarized transcript into viral short-form clip candidates. This is
what `segment` op=`by_speech` calls — **live**, registered as both an HTTP
route (`POST /segment/by_speech`) and the `segment` MCP tool.

It only works on *speech* — it flattens a diarized transcript into
`[MM:SS-MM:SS] speaker: text` lines and scores those. Point it at a cartoon or
any non-dialogue source and it scores the dialogue while missing every visual
beat. It is one strategy among several `segment` is meant to hold
(`by_scene` — ffmpeg scene-change detection, no AI call; `by_vision` —
sampled frames scored by a vision model), both **not yet built**. Every
strategy is meant to return the same shape `video.cut`'s `clips` field
already consumes: `[{start, end, score?, why?, label?}]`.

## Two providers, one contract

The prompt, rubric, output schema, and validation are identical regardless of
which AI backend actually runs the call — `provider` (required on every
request, no default) picks the transport:

- **`gemini`** (`score.ts`) — the original path. Gemini's `responseSchema`
  constrains generation directly; `MOMENTS_RESPONSE_VALIDATOR` is a defensive
  re-check on top (Gemini has been seen to omit a "required" field in
  practice). Runs against the free-tier key pool shared with `video.diarize`
  — thin daily quota, can run dry under frequent unattended use.
- **`claude`** (`score-claude.ts`) — delegates to the local Claude Code
  subscription via `askClaude` (`api/claude/client.ts`), the exact same
  function the `claude` MCP tool's `ask` op calls — flat-rate, not metered,
  but sharing that tool's org-wide 40-session/day budget. `claude -p` has no
  schema-constrained decoding, so the same rubric prompt has an explicit
  "return ONLY JSON matching this schema" instruction appended (the schema
  object is `GEMINI_VIRAL_MOMENTS_RESPONSE_SCHEMA`, reused here purely as
  prompt documentation, not as an API parameter). The response is stripped of
  any ```` ```json ```` fence, parsed, and validated with the same
  `MOMENTS_RESPONSE_VALIDATOR`. On invalid JSON or a schema mismatch, it
  retries **on the same Claude session** (`session_id` resume) with the
  validation error appended to the task, up to `SEGMENT_CLAUDE_MAX_ATTEMPTS`
  (3) total attempts — cheaper than a fresh session, and the model sees
  exactly what it got wrong. `askClaude` reporting `ok: false` (budget gate,
  auth failure, usage limit) throws immediately with no retry — retrying
  can't fix an auth or budget problem, only a malformed-JSON one.

ChatGPT is deliberately not a third provider — see `SEGMENT_PROVIDERS` in
`../constants.ts` for why (its only generation primitive here is a
browser-driven flow built for staged image generation, the wrong shape for a
fast structured-JSON call).

**Verified 2026-09-08**: the Gemini path end-to-end on a real diarized clip
(1 candidate, tone=informative, score=88). The Claude path's retry/validation
logic verified with an offline mock covering first-try success, fenced-JSON
stripping, invalid-JSON retry with session continuity, schema-mismatch retry,
attempt exhaustion, and immediate-throw on a hard `ok:false` failure — all 6
passing. The live wire path (`askClaude` -> real `claude -p` -> real JSON)
was **not** exercised end-to-end: the VPS's Claude Code OAuth session was
expired at build time (confirmed independently of this code — a bare
`claude -p` hits the identical "OAuth session expired and could not be
refreshed"). This also means Hermes's own `claude` MCP delegation is down
until someone re-authenticates interactively on the VPS.

## Layout

```
segment/
  constants.ts             # SEGMENT_PROVIDERS, field descriptions, SEGMENT_CLAUDE_MAX_ATTEMPTS
  types.ts                 # BY_SPEECH_REQUEST/RESPONSE, provider-tagged SEGMENT_USAGE
  create-handler.ts         # thin handler factory (zod validate -> service -> ALApiResponse)
  handler.ts / index.ts     # routes: /by_speech + module public surface
  by-speech/                # POST /segment/by_speech
    schemas.ts                 # BY_SPEECH_REQUEST_SCHEMA — diarized + provider + rubric bounds
    rank.ts                    # provider dispatch: gemini -> moments/score.ts, claude -> moments/score-claude.ts
    handler.ts
  moments/                  # the rubric + both provider implementations (this directory)
    score.ts                   # Gemini path — unchanged since the viral_clipper split
    score-claude.ts            # Claude path — prompt+schema reuse, parse/validate/retry-on-session
    schemas.ts                 # MOMENTS_REQUEST_SCHEMA (legacy, unused by by-speech directly — see note below),
                                # Gemini responseSchema, MOMENTS_RESPONSE_VALIDATOR (provider-neutral)
    constants.ts                # rubric prompt header, channel-context and audience-signal templates
    types.ts                    # candidate / response shapes, hook types, podcast tones
    README.md                   # this file

../../mcp/tools/segment.ts  # `segment` MCP tool: op=by_speech
../../config.ts             # ENDPOINTS.SEGMENT mount (always registered)
```

`moments/schemas.ts`'s own `MOMENTS_REQUEST_SCHEMA` (Gemini-only, with a
Gemini-model default baked in) predates the provider split and nothing calls
it anymore — `by-speech/schemas.ts` is the real request schema now, provider-
neutral. Left in place rather than deleted since `CLIP_DURATION_BOUNDS_FIELDS`
and `requireValidClipDurationRange` (both still very much in use) live
alongside it in the same file.

## Prompt structure (hook / body / button)

`MOMENTS_PROMPT_HEADER` (constants.ts) explicitly rubrics every
candidate as three parts, not just "an interesting moment":

1. **Hook** (first 1-3s) — the clip must open ON the hook line itself (a bold
   claim, sharp question, striking number, or the first word of real
   emotion), never on a wind-up. `hook_line` in the response is the model
   quoting the exact words the clip should open on — a cheap, directly
   checkable signal of whether the chosen `start` is actually the hook or a
   few seconds of dead air before it.
2. **Body** — the substance that pays off the hook.
3. **Button** (ending) — a real stopping point (punchline / resolved claim /
   natural pause), never a mid-sentence or filler-word cutoff, and never the
   interviewer's next question: a question the clip does not answer is the
   start of the next moment, not the end of this one. It includes
   the reaction: when laughter, applause or a beat of silence follows the
   payoff, `end` goes after it. `ending_note` is the same kind of
   directly-checkable justification for `end`.

**Length comes last.** `minClipSeconds`/`maxClipSeconds` check a moment's
natural shape; they never set it. A clip runs from where the thought starts to
where it has fully landed, and only then is checked against the bounds — the
ceiling is hard, but a moment that needs more drops run-up from the start
rather than losing its ending (or is skipped). A clip that stops before its
moment finishes is the failure this rule exists for.

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

1. **`diarize/audio.ts`'s prompt now captures laughter instead of discarding it.**
   Previously, backchannel sounds *including laughter* were explicitly
   filtered out of the transcript as noise (rule 6, pre-2026-08-11). Laughter
   is now its own rule: inline `[speaker_1 laughs]` / `[speaker_2 laughs]` /
   `[both laugh]` markers are inserted at the exact point they happen, at
   near-zero extra token cost (no new segment, just a few characters). This
   is the ground-truth signal everything below depends on — without it,
   "was this actually funny" is unanswerable from a transcript alone.
2. **`moments/score.ts`'s prompt reads that signal and reasons about genre
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

**2026-08-11.** Audience signals add a second, independent signal source:
what real viewers and the creator themselves already flagged as notable on
this exact episode, via InnerTube (no YouTube Data API key exists in this
project — see the Env section's caveat on production availability).
Comments frequently call out a moment directly ("12:34 lol", "the part at
15:20 killed me") — the youtube module's comments intelligence extracts
those timestamp mentions and clusters/ranks them by mention count + likes.
Chapter titles are the creator's own labeling of each section, often naming
the funny/notable bit directly.

**Deliberately a separate call, not auto-fetched inside `/viral-moments` or
`/pipeline`**: the YouTube video URL a caller has and the local
`audioSource`/`videoSource` `/diarize`/`/cut` operate on aren't guaranteed to
be the same source (a caller might diarize a local file that was never
uploaded to YouTube at all), and not every caller wants the extra
InnerTube round-trip or has an actual YouTube URL at all. Fetch
`/youtube/video/comments` (intel layer) and/or `/youtube/video/chapters`
(or their MCP equivalents, `youtube` `op=comments layer=intel` /
`op=chapters`) yourself, format with the exported
`formatCommentTimestampClustersAsAudienceSignals` /
`formatChaptersAsAudienceSignals` helpers
(`youtube/intelligence/audience-signals.ts`), and pass the result as
`audienceSignals` to `/viral-moments` or `/pipeline`. The prompt treats
this as a strong prior, not proof — it raises a nearby candidate's
priority, it doesn't override the hook/body/button and standalone-clip
requirements.


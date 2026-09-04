/**
 * Viral-moment scoring prompts. Limits shared across the whole clipper
 * (candidate counts, clip duration bounds) stay in the root `constants.ts`.
 */

export const VIRAL_CLIPPER_VIRAL_MOMENTS_PROMPT_HEADER = `You are an elite short-form video producer. You have cut thousands of viral Reels/Shorts/TikToks out of long-form interviews, podcasts, and talk content, and your edge isn't just spotting what's interesting — it's knowing exactly where a clip should start and end.

Below is a full speaker-labeled, timestamped transcript of one episode. Inline [speaker_1 laughs] / [speaker_2 laughs] / [both laugh] markers show exactly where real, audible laughter happened — this is ground truth, not a guess, and it matters a lot below. Find the best {{MIN}}-{{MAX}} candidate moments for standalone short-form clips. Each clip's total duration MUST be between {{MIN_DURATION}} and {{MAX_DURATION}} seconds — never exceed {{MAX_DURATION}}s. If a moment you like genuinely needs longer than that to land, it is not a good candidate here: either find a tighter version of it or skip it.
{{CHANNEL_CONTEXT_BLOCK}}{{AUDIENCE_SIGNALS_BLOCK}}
READ THE ROOM FIRST. Before picking candidates, form an honest read of what this specific episode actually is — some podcasts are fundamentally COMEDY/ENTERTAINMENT (banter, roasting, funny stories, absurdist tangents, the point is to make people laugh) and others are fundamentally SERIOUS/INFORMATIVE (insight, vulnerability, advice, debate — a strong emotional or intellectual moment IS the payoff, laughter or not). Judge this from the transcript itself — how often and how genuinely the [laughs] markers fire is a direct signal, not just topic. Set podcast_tone (comedy / informative / mixed) and podcast_tone_note, and let this actually steer your selection below, not just label it.

EVERY GOOD CLIP HAS THREE PARTS. Use this to pick exact start/end points, not just an interesting middle:
1. HOOK (the first 1-3 seconds): the clip must open ON the hook itself — a bold claim, a sharp question, a striking number, or the first word of real emotion. Never open on a wind-up ("so basically...", a throat-clear, a half-finished setup that only makes sense once you already know where it's going). If the speaker takes a sentence or two to get to the actual hook, your 'start' timestamp goes AT the hook line — the run-up gets left out, not included.
2. BODY: the substance that pays off what the hook promised — the story, the argument, the specific detail. This is what keeps someone watching past second 3 instead of scrolling on.
3. BUTTON (the ending): end on a real stopping point — the punchline of a story, the resolution of a claim, the last word of a complete thought, or (only when the moment genuinely has one) a natural cliffhanger the speaker themselves lands on. Never end mid-sentence, mid-number, or on a filler word. If the real payoff lands a few seconds past your target length, either include it (as long as you're still under {{MAX_DURATION}}s total) or pick a different moment that actually resolves in time.

For each candidate, score it 0-100 on how well it would work as a STANDALONE clip with no context from the rest of the episode, and classify its hook_type:
- emotional_peak: a moment of real emotion (vulnerability, anger, joy, grief)
- quotable_line: a single sharp, tweetable sentence
- topic_conflict: disagreement, pushback, or a hot-take the guest defends
- story_payoff: the punchline/ending of a story that was being built up
- surprising_claim: a specific fact or number that makes the listener go "wait, what?"
- humor: something genuinely funny in delivery or content
- vulnerable_moment: an admission, confession, or moment of honesty that feels personal
- actionable_advice: concrete, specific advice someone would screenshot

Rules:
- The clip must make sense without prior context. In standalone_check, briefly state what a first-time viewer would need already established (ideally: nothing) — reject/skip moments that only land if you watched the first 20 minutes.
- In hook_line, quote the exact words (verbatim from the transcript) the clip should open on — this is what your 'start' timestamp must align to.
- In ending_note, name the specific line or beat the clip should end on and why it's a genuine stopping point (punchline / resolved claim / natural pause) — this is what your 'end' timestamp must align to. Never describe an ending that trails off mid-thought.
- Set has_audible_laughter to true ONLY if a [laughs]/[both laugh] marker falls within or right at the end of your chosen start/end range — read it off the transcript, don't infer or guess it.
- If podcast_tone is comedy or mixed: a moment where a joke actually LANDS (marked by real laughter at or just after the punchline) is your strongest possible signal, and should generally outscore an equally "interesting" but laugh-free stretch of storytelling or explanation. Being coherent, well-told, or informative is NOT the same as being clip-worthy on a comedy-driven show — do not select a candidate just because it reads smoothly if nobody actually laughs and nothing genuinely turns emotionally. The real definition of a good comedy clip is that it makes people laugh.
- If podcast_tone is informative: weight emotional/insight/conflict moments normally — laughter isn't required, but a moment that ALSO has it (has_audible_laughter=true) is still a bonus signal, never a penalty.
{{AUDIENCE_SIGNALS_RULE}}- Do not pick two candidates that are near-duplicates of the same beat.
- suggested_title should be the kind of title an actual Reels/Shorts creator would use (curiosity-driven, under ~10 words), not a dry description.
- why_it_works should name the specific mechanism (e.g. "specific numbers make the claim concrete and shareable", or "the guest's own laugh confirms the joke landed"), not a generic compliment.
- Sort candidates by score, descending, and set rank accordingly.

Return ONLY the structured JSON per the schema.

TRANSCRIPT:
`;

/**
 * Injected into `{{CHANNEL_CONTEXT_BLOCK}}` when a caller passes
 * `channelContext`; replaced with an empty string otherwise. Kept as its own
 * template (not string-concatenated ad hoc in moments/score.ts) so the exact
 * wording — including the "don't fabricate" guard — stays in one place.
 */
export const VIRAL_CLIPPER_CHANNEL_CONTEXT_BLOCK_TEMPLATE = `
CHANNEL CONTEXT (use this to weight which moments and hook_types fit this specific audience — do not fabricate niche-specific claims that aren't actually in the transcript):
{{CHANNEL_CONTEXT}}
`;

/**
 * Injected into `{{AUDIENCE_SIGNALS_BLOCK}}` when the caller passes
 * pre-fetched YouTube comment-timestamp / chapter data (see the youtube
 * module's audience-signal formatters); empty string otherwise.
 * This is real audience behavior on THIS episode, not a guess — treat it
 * as a strong prior, not proof (comments can also flag something the
 * uploader's OWN Shorts already used, or a moment already well outside the
 * duration bound).
 */
export const VIRAL_CLIPPER_AUDIENCE_SIGNALS_BLOCK_TEMPLATE = `
AUDIENCE SIGNALS (real viewer behavior on this exact episode — timestamps viewers themselves called out as funny/memorable in comments, and/or the creator's own chapter markers):
{{AUDIENCE_SIGNALS}}
`;

/** Injected into `{{AUDIENCE_SIGNALS_RULE}}` only when AUDIENCE SIGNALS are present — kept out of the rules list entirely otherwise so the prompt doesn't reference a section that isn't there. */
export const VIRAL_CLIPPER_AUDIENCE_SIGNALS_RULE_TEMPLATE = `- Cross-reference candidates against AUDIENCE SIGNALS above: a moment near a timestamp multiple viewers independently called out is a real, above-baseline candidate — don't skip it even if it's not the most "quotable" line on paper. But don't force a low-quality candidate in just because a comment mentioned it either; audience signals raise a moment's priority, they don't override the hook/body/button and standalone requirements above.
`;

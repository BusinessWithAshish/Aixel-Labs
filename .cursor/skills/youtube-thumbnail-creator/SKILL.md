---
name: youtube-thumbnail-creator
description: >-
  Generate high-CTR YouTube thumbnail concepts, image-generation prompts, and
  delivery specs from a video title, description, or topic keyword. Distills
  design psychology, color theory, composition, facial-editing, and AI
  workflow tactics used by top-performing YouTube thumbnail creators
  (MrBeast-style face editing, Wemmbu-style compositing, complementary-color
  focal points, meme-able reaction images). Use when the user asks for a
  YouTube thumbnail, thumbnail idea, thumbnail prompt, CTR boost, click-
  through-rate optimization, or wants to generate a thumbnail from a title,
  description, topic, or keyword for any AI image agent (ChatGPT, Midjourney,
  Nano Banana, Gemini, DALL-E, Flux, etc.).
---

# YouTube Thumbnail Creator

Synthesizes YouTube thumbnail best practices extracted from transcripts of the
top-velocity videos in the "how to make the best YouTube thumbnail" niche
(researched via the AixelLabs YouTube Intelligence MCP — 406 videos analyzed,
8 top transcripts deep-read). Use this to turn any title/description/topic into
a complete thumbnail package: concept, composition, color, text, AI prompt,
and delivery spec.

## When to use

Trigger this skill whenever the user provides any of:
- a video title, description, or topic/keyword and wants a thumbnail
- a request to "make / create / design / generate / give me" a YouTube thumbnail
- CTR / click-through-rate / "get more clicks" / "make it clickable" requests
- thumbnail A/B test variants
- prompts for ChatGPT / Midjourney / Nano Banana / Gemini / Flux thumbnail generation

## Output contract

Always deliver, in this order:

1. **Concept** — one-sentence thumbnail idea + the single emotion it triggers
2. **Composition map** — ASCII layout of subject, focal point, text, background
3. **Color spec** — 2-3 named colors with hex, focal-point strategy, bg light/dark
4. **Text spec** — 1-3 words max, font style, color, placement, glow rule
5. **Face / subject spec** — expression, skin edit, teeth/eyes, contrast
6. **AI image prompt** — copy-paste ready, for the user's chosen image AI
7. **Delivery spec** — resolution, file size, compression tool, test step
8. **3 A/B variants** — same concept, different hook angle

If the user only wants the prompt, skip to step 6 but state the assumptions
from steps 1-5 in one line above it.

---

## Core design principles (ranked by CTR impact)

### 1. One focal point, one emotion
- A thumbnail is a thesis, not a summary. Pick ONE feeling: shock, curiosity,
  greed, outrage, awe, disgust, fear of missing out.
- One subject. One face. One object. One arrow. Everything else is blurred,
  desaturated, or pushed to the edges.
- Focal point sits on the golden-ratio spot (~⅓ from the right edge, vertically
  centered) — this is where the eye lands first on a YouTube grid.

### 2. The face is the thumbnail (MrBeast rule)
Across the top transcripts, every high-performer treats the person as the main
asset and edits the face aggressively:
- **Skin**: smooth, bright, no wrinkles/lines. Camera-filter texture ~ -50,
  noise reduction ~ 60-70. Dodge/burn for controlled shadows.
- **Teeth**: pure white. Curves layer up + hue/saturation down on teeth mask.
- **Eyes**: white-of-eye brighter, iris saturation +50. Eyes are the second
  focal point — they must lock with the camera.
- **Eyebrows/facial hair**: keep dark/sharp against smoothed skin — the
  contrast is what reads at thumbnail size.
- **Skin tone**: push reds via Selective Color (cyan → -100 in Reds channel)
  for a cartoonish, vibrant look.
- **Expression**: exaggerated — mouth open, eyes wide. Subtle = invisible.

### 3. Color: 2-3 colors, never more
- Hard cap: 3 colors (4 absolute max). Rainbow thumbnails die.
- **Background**: mostly dark. Dark bg + light text is the default that
  MrBeast, Nicolas Christal, and most Indian top creators use.
- **Text colors** (in priority order):
  1. **White** — universal, fits any bg, the safe default
  2. **Yellow** — eyes catch it first (taxi-plate effect); use for the single
     most important word
  3. **Red** — for suspense / horror / scam / dark-reality content
- **Complementary pair** (orange + blue, red + green) gives the strongest
  contrast. Put one on the subject, one in the background.
- **Saturation trick**: desaturate the dominant area, concentrate saturation
  at the focal point. A mostly-grey thumbnail with one fully-saturated spot
  reads as more vivid than a uniformly bright one.
- **Value > hue > saturation**: never break value structure when exaggerating
  hue/sat. Greyscale-test the thumbnail — if it still reads, the color will pop.

### 4. Text: 1-3 words, all caps, bold sans-serif
- MrBeast uses almost no text. When present: 1-3 words, white, all caps.
- Big, bold, condensed sans-serif (Impact, Anton, Montserrat Black, Bebas Neue).
- Place text in the lower-third or top-third — never center, never bleeding
  off the edge. "Top getting cut" is the #1 AI-generation failure.
- Add a subtle outer glow / drop shadow / stroke so text survives any bg.
- Text should reinforce the title, not repeat it. If the title says
  "5 Mistakes", the thumbnail says "MISTAKE" or "STOP".

### 5. Compositing for realism (Wemmbu / Photoshop-remake workflow)
- **Shadows are non-negotiable** — two layers per subject:
  - Layer 1: Gaussian Blur ~30, offset down, opacity ~50% (cast shadow)
  - Layer 2: Gaussian Blur ~3, close to subject, opacity ~30% (contact shadow)
- **Edge light**: a thin highlight on the subject's edge that matches the
  background's light source — this is what blends subject into scene.
- **Color grade each element individually** so every object pops, not just
  the whole image.
- **Glow**: add sparingly. Too much glow is the #1 mistake small YouTubers
  make — it ruins thumbnails.
- **Background**: blur it (subject separation) or use AI to extend/complete it.

### 6. Meme-ability = free distribution
A thumbnail that becomes a reaction image in comment sections drives
compounding publicity. Design so the face/expression could be screenshotted
and reused out of context. This is a real growth lever surfaced in the
"Legendary Thumbnails" skit video — treat it as a design goal, not a side effect.

### 7. Technical delivery
- **Resolution**: 2560×1440 (16:9). 4K is wasted — YouTube compresses to 2MB.
- **File size**: ≤ 2MB. Compress with **Squoosh.app** (Google) — never random
  online compressors that destroy quality.
- **Subject sharpening**: run the cutout through an AI upscaler
  (Google AI Image Upscaler is free) before compositing.
- **Background removal**: remove.bg gives cleaner edges than Photoshop's
  native select for hair/fur.
- **Test before upload**: use a "test my thumbnail" tool to preview at
  phone size, tablet size, and in a YouTube grid — thumbnails are judged at
  ~120px wide on mobile, not at full resolution.

---

## Workflow: from input → thumbnail package

### Step 1 — Extract the hook from the input

Given a title / description / topic, identify:
- **Subject**: who or what is the literal focus (person, product, animal,
  place, screen)
- **Stakes**: what does the viewer gain or lose
- **Emotion**: pick one from: shock, curiosity, greed, outrage, awe, disgust,
  FOMO, nostalgia, triumph
- **Curiosity gap**: the question the thumbnail makes you need answered

If input is just a keyword (e.g. "AI coding"), invent a concrete scenario
that delivers an emotion — do not produce a generic "topic + laptop" thumbnail.

### Step 2 — Pick a template pattern

Choose one (state which):

| Pattern | When | Example |
|---|---|---|
| **Face + Object** | Person reacting to something | MrBeast holding a thing, shocked |
| **Before / After split** | Transformation, comparison | Left dull, right vibrant |
| **VS / Battle** | Comparison, "X vs Y" | Two subjects, split frame, lightning |
| **Pointing at** | Directing attention | Finger → text/logo/object |
| **Reaction inset** | Reacting to a smaller image | Big face + small screen top-right |
| **Meme face** | Meme-able single expression | Just a face + 1 word |
| **Money / Result** | Proof of outcome | Holding cash / chart / score |

### Step 3 — Generate the AI image prompt

Build the prompt using this skeleton (fill every bracket):

```
Eye-catchy YouTube thumbnail, 16:9, [PATTERN] composition.

Subject: [WHO/WHAT — 1 subject, described physically]
Expression: [EXAGGERATED emotion — mouth open, eyes wide, etc.]
Pose/action: [WHAT they're doing — pointing at / holding / reacting to]
Wardrobe: [BOLD solid color clothing — red/yellow/blue, no patterns]

Background: [DARK or LIGHT] [setting, blurred, complementary color]
  - if dark bg: deep navy / charcoal / forest green
  - if light bg: warm cream / sky blue / soft yellow

Focal point: [THE ONE thing that should grab the eye] placed at golden-ratio
spot, 1/3 from right edge.

Colors: 2-3 max. Palette: [HEX1] [HEX2] [HEX3].
  - Concentrate saturation on focal point, desaturate the rest.
  - Complementary pair: [orange+blue] / [red+green] / [yellow+purple].

Text overlay: "[1-3 WORDS, ALL CAPS]", bold condensed sans-serif (Anton /
Impact style), [WHITE / YELLOW / RED] with subtle outer glow, placed
[lower-third / top-third], must NOT touch any edge or get cut.

Lighting: cinematic, edge light on subject matching bg light source, soft
vignette, subject brighter than background.

Style: hyper-real, saturated, high-contrast, YouTube-thumbnail aesthetic,
MrBeast-influenced face editing (smooth bright skin, white teeth, vivid eyes).

Negative: no watermark, no extra text, no clutter, no rainbow palette, no
small details, no low-contrast areas, no text running off the edge.

Output: 2560×1440, ready for YouTube upload.
```

### Step 4 — Add the "best design judgment" closer

Append to every prompt (this phrase measurably improves AI output, surfaced
in the ChatGPT-thumbnail-workflow transcript):

> Please use your best design judgment to maximize click-through rate. The
> thumbnail must be readable at 120px wide on a phone screen. If any text
> risks getting cut at the top or edges, reposition it inside the safe area.

### Step 5 — Specify 3 A/B variants

Always produce 3 variants of the prompt, each rotating one axis:
- **V1**: the canonical concept (default)
- **V2**: same subject, opposite emotion (e.g. shock → confusion)
- **V3**: same emotion, different pattern (e.g. Face+Object → VS split)

YouTube now supports thumbnail A/B testing natively — generate all three
and let the test decide.

### Step 6 — Validate against the checklist

Before delivering, run the concept through this checklist (every item must
pass or the thumbnail underperforms):

```
Thumbnail QA:
- [ ] One focal point, one emotion
- [ ] Face (if present) edited: smooth skin, white teeth, vivid eyes
- [ ] 2-3 colors max, no rainbow
- [ ] Saturation concentrated at focal point
- [ ] Greyscale test still readable
- [ ] Text 1-3 words, all caps, bold, doesn't touch edges
- [ ] Text contrasts bg (light text on dark bg or vice versa)
- [ ] Subject has cast + contact shadow
- [ ] Edge light on subject
- [ ] Background blurred or simpler than subject
- [ ] Readable at 120px wide (phone grid)
- [ ] Meme-able expression (could be reused as a reaction image)
- [ ] Resolution 2560×1440, ≤2MB after Squoosh compression
```

---

## Quick prompt templates by input type

### Input: just a title (e.g. "I tried AI coding for 30 days")

```
Eye-catchy YouTube thumbnail, 16:9, Face + Object composition.

Subject: a young developer, mouth wide open in shock, eyes locked to camera,
holding a laptop showing code, exaggerated "I can't believe this" expression.
Wardrobe: solid bright red hoodie.

Background: dark charcoal, blurred home-office, single blue rim light from
the right to separate subject from bg.

Focal point: the developer's face at golden-ratio spot, 1/3 from right edge.

Colors: 3 max — #1A1A1A (bg), #FF3B3B (hoodie, focal saturation), #FFFFFF
(text + teeth/eyes highlight). Desaturate the laptop, saturate the hoodie
and face.

Text overlay: "30 DAYS", bold condensed sans-serif, white, with subtle dark
outer glow, placed top-third centered, must not touch any edge.

Lighting: cinematic, edge light matching bg rim light, soft vignette, face
brighter than background. MrBeast-style face edit: smooth bright skin, pure
white teeth, vivid saturated eyes.

Style: hyper-real, saturated, high-contrast YouTube thumbnail aesthetic.

Negative: no watermark, no extra text, no clutter, no rainbow, no small
details, no low-contrast areas, no text off-edge.

Output: 2560×1440, ready for YouTube upload.

Please use your best design judgment to maximize click-through rate. The
thumbnail must be readable at 120px wide on a phone screen. If any text risks
getting cut at the top or edges, reposition it inside the safe area.
```

### Input: a topic keyword (e.g. "personal finance")

Invent a concrete scenario first, then build the prompt. Do not produce
"person looking at money" — produce "person holding one $1000 bill next to a
giant $0 bank statement, shocked face, dark bg, red+green complementary
palette, text 'BROKE' top-third".

### Input: a description / script

Pull the single most surprising claim or number from the description and
make it the focal point. Numbers outperform words (the "5 mistakes" pattern
outperformed generic titles in the velocity data).

---

## AI agent handoff notes

When handing the prompt to a specific image AI:
- **ChatGPT / Nano Banana / Gemini (native text rendering)**: keep the text
  overlay in the prompt; specify font weight and exact words.
- **Midjourney / Flux / Stable Diffusion**: remove the text overlay from the
  image prompt (these models render text poorly) and add it in post with
  Anton/Impact. State this in the delivery spec.
- **All agents**: feed the user's prior thumbnails as reference if available
  ("learning data" in the ChatGPT workflow) — this is the single biggest
  quality lever for AI thumbnail generation.

If the user has a brand kit (channel colors, logo, font), pull those into
the color spec and text style before generating. Consistency across a
channel's thumbnail grid compounds CTR over time.

---

## Reference

For the full research base — velocity rankings, niche aggregation,
per-video transcript zones, hook classifications, and keyword frequency
across the 8 deep-read top performers — see
[reference.md](reference.md).

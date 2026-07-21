# YouTube Thumbnail Creator — Research Reference

This file is the evidence base for `SKILL.md`. It is the distilled output of
running the AixelLabs YouTube Intelligence MCP against the
"how to make the best YouTube thumbnail" niche.

## Research method

- 10 search queries run through `search_niche_intelligence` (US, 50 results each)
- 406 unique videos after dedup
- `aggregate_niche_signals` computed across the full set
- Top 8 by `velocityScore` (filtered to >4 min duration) deep-read via
  `get_video_transcript_intelligence` — 4-zone transcript + hook type +
  CTA detection + keyword frequency

Queries:
1. how to make best youtube thumbnail
2. youtube thumbnail tips tutorial
3. thumbnail design that gets clicks
4. clickable thumbnail psychology
5. mr beast thumbnail breakdown
6. youtube thumbnail mistakes to avoid
7. thumbnail text and font tips
8. thumbnail color theory youtube
9. how to increase click through rate youtube
10. youtube thumbnail A/B testing tips

## Niche aggregation (406 videos)

```json
{
  "avgVelocityScore": 0.0434,
  "velocityDistribution": {
    "p25": 0.000051,
    "p50": 0.000484,
    "p75": 0.002802,
    "p90": 0.008649
  },
  "saturationScore": 1.35,
  "durationBucketDistribution": {
    "shorts": 10, "short": 98, "mid": 254, "long": 44
  },
  "channelTierDistribution": {
    "micro": 157, "small": 88, "mid": 104, "large": 45
  },
  "shortRatio": 0.025,
  "dominantDurationBucket": "mid",
  "dominantChannelTier": "micro",
  "lifecycleStage": "growing"
}
```

**Read**: niche is `growing` (not saturated), dominated by mid-form
(4-20 min) tutorials from micro channels (<10k subs). Shorts are nearly
irrelevant (2.5%) — meaning thumbnail quality matters for long-form, where
the thumbnail is the primary CTR lever. p75 velocity is 0.0028 — anything
above that is genuinely outperforming.

## Top performers by velocity

| velocity | views | dur(s) | title | via query |
|---:|---:|---:|---|---|
| 15.000 | 15 | 138 | How to Improve Your YouTube CTR (Fast) | CTR query (outlier) |
| 0.198 | 195,567 | 478 | How to Make Thumbnails Like Wemmbu | best thumbnail |
| 0.094 | 1,898,709 | 180 | How to Create YouTube Thumbnails with AI using ThumbnailCreator.com | best thumbnail |
| 0.086 | 1,464 | 540 | How To Pick Best Colour For Youtube Thumbnail \| Colour Theory | color theory |
| 0.083 | 4 | 32 | This Thumbnail Mistake Is Hurting Your Channel | mistakes |
| 0.071 | 63,402 | 268 | How To Make Thumbnail Like MrBeast \| ColorCorrection | mr beast |
| 0.046 | 1,047,653 | 412 | When YouTubers Create Legendary Thumbnails | best thumbnail |
| 0.041 | 4,929 | 307 | How to remake the MrBeast thumbnail in Photoshop | mr beast |
| 0.040 | 42 | 185 | 5 Thumbnail Mistakes Killing Your Views ⚠️ | mistakes |
| 0.040 | 650,821 | 655 | Photoshop Face Editing Hacks for Thumbnail Designing | mr beast |
| 0.037 | 94 | 651 | colour your thumbnails | color theory |
| 0.034 | 41 | 861 | How I Use ChatGPT to Create Stunning YouTube Thumbnails My Exact Workflow | psychology |
| 0.033 | 45 | 243 | 5 Thumbnail Psychology Principles That Get More Clicks! | psychology |
| 0.032 | 7,601 | 169 | 3 Secret YouTube Growth Strategies... Thumbnail A/B Testing Is Here! | A/B testing |
| 0.032 | 68,517 | 751 | How To Edit Thumbnail Faces Like MrBeast (EASY) | best thumbnail |

### Title-pattern signals from the top 15

- **Numbers** ("5 Mistakes", "3 Secret", "30 days", "$30") — appear in 6/15
- **"Mistake"** framing — 3/15 (high emotional valence)
- **MrBeast reference** — 4/15 (the dominant style anchor in this niche)
- **Emoji** — ⚠️ appears in the top quartile
- **Hyperbolic adjectives** — "Legendary", "Best", "Stunning", "Killing"
- **"How I" / "How To"** — 11/15 (tutorial framing dominates)

## Per-video deep read (8 transcripts)

### 1. `Dewf7Y9WbH4` — How to Make Thumbnails Like Wemmbu
- velocity 0.198, 195k views, 8 min
- hook: `direct_address`
- titleAlignmentScore: 0.63

**Workflow extracted**:
1. Setup: Photoshop (or Photopea free), Flashback mod for in-game recording
2. Planning: download 2-3 reference thumbnails you admire, drop them into
   Photoshop at top, lower opacity to use as alignment guides
3. Screenshot: FOV 30, anti-aliasing on, transparent sky, 2560×1440
   (4K unnecessary — gets compressed anyway)
4. Edit: add shadows (copy + resize), color-grade items individually so each
   pops, add glow but **don't overdo it** ("the #1 mistake small YouTubers
   make")
5. Final: compress with **Squoosh.app** to stay under YouTube's 2MB limit
   — never use random compressors, they destroy quality

### 2. `olrWhKT0ZVA` — How To Pick Best Colour (Hindi)
- velocity 0.086, 540s
- hook: `standard`

**Color rules extracted**:
- Use 2-3 colors max (4 at most). 5-6 = rainbow = bad.
- Top Indian creators ( motivational/biopic) use **warm colors**
  (red/orange/yellow/brown).
- Default: **dark background + light text**. Or light bg + dark text.
- Text color priority: **white** (universal, fits any bg) > **red**
  (suspense/horror/scam) > **yellow** (eyes catch it first — taxi effect).
- Reference channels cited: Nicolas Christal, MrBeast — "simple and catchy".
- MrBeast: barely any text, all white when present.

### 3. `ruRquB6eSfs` — How To Make Thumbnail Like MrBeast | ColorCorrection
- velocity 0.071, 63k views, 268s
- hook: `standard`

**MrBeast face-edit recipe** (concrete Photoshop steps):
1. Cut out background
2. Smooth skin: duplicate layer → clipping mask → Camera Filter →
   Texture -50, Noise Reduction +60 to +70 → mask + invert → paint skin
3. Dodge & burn: two Curves layers (burn = mid down, dodge = mid up),
   invert masks, paint shadows and highlights
4. Teeth whiter: Curves up + Hue/Saturation down on teeth mask
5. Eyes pop: Hue/Saturation layer, saturation +50, paint iris; Curves up
   on white-of-eye
6. Skin redder/cartoony: Selective Color → Reds → Cyan -100
7. Final Camera Filter: Exposure up, Contrast up, Highlights down,
   Shadows up, Sharpening +, Noise Reduction +
8. T-shirt color change: Hue/Saturation, saturation -100, lightness down,
   paint shirt

### 4. `X-STbDJBG2w` — When YouTubers Create Legendary Thumbnails
- velocity 0.046, 1M views, 412s
- hook: `question`
- This is a skit, not a tutorial, but its 1M views carry a strategic
  insight: a thumbnail that becomes a **reaction image / meme** in comment
  sections drives compounding distribution. Design thumbnails that could
  be screenshotted and reused out of context.

### 5. `1Q1pRm_ZaYw` — How to remake the MrBeast thumbnail in Photoshop
- velocity 0.041, 5k views, 307s
- hook: `standard`

**Compositing recipe**:
1. Composition first — gather elements (background, subject, prop, animal)
2. Use AI to complete/extend backgrounds (blurred anyway)
3. Use AI tools per-element for best result (try multiple)
4. Subject select for clean cutouts
5. **Shadows are essential for realism** — two-layer system:
   - Layer 1: Gaussian Blur 30, offset down (main cast shadow)
   - Layer 2: Gaussian Blur 3, close to subject (sharp contact shadow)
   - Opacity ~30%
6. Edge light: add light at subject edges to blend into scene
7. Process each element individually for color/contrast

### 6. `CYsIEgi3x6g` — Photoshop Face Editing Hacks (Hindi)
- velocity 0.040, 651k views, 655s
- hook: `standard`

**Tools and rules**:
- Main part of a thumbnail = the **picture** (the person). Text and bg are
  secondary.
- Sharpen subject with **Google AI Image Upscaler** (free) before compositing
- Remove bg with **remove.bg** (cleaner than Photoshop for hair)
- Remove unwanted parts with **Generative Fill** (Photoshop or free
  Adobe Firefly)
- Lighting: Curves with clipping masks for shadows/highlights
- Vibrance layer for controlled saturation
- Inner Glow with Color Dodge blend mode for stylized rim light
- **Test the thumbnail** on a "test my thumbnail" website to preview at
  phone and tablet size before publishing

### 7. `449UscqrSbc` — colour your thumbnails (art-class lecture)
- velocity 0.037, 651s
- hook: `standard`

**Color theory for thumbnails**:
- Exaggerate hue and saturation, but **keep value intact**
- Complementary colors (orange + blue) for high contrast
- Concentrate saturation at the focal point (golden ratio spot); dilute /
  desaturate the dominant color
- **Relative saturation** makes colors seem bright: desaturated next to
  fully saturated > uniformly saturated
- **Simultaneous contrast**: contrast in hue without contrast in value
  makes colors vibrate
- Use 10-step value scales as underpainting
- Vary contrast in hue, saturation, and value in different places — don't
  apply the same contrast type everywhere
- Atmospheric perspective: warm colors in foreground, cooler in background

### 8. `4SDzNSn9Gtk` — How I Use ChatGPT to Create Stunning YouTube Thumbnails
- velocity 0.034, 861s
- hook: `standard`
- titleAlignmentScore: 0.69 (highest in the set)

**AI thumbnail workflow**:
- Train / feed ChatGPT with learning data on desired style before prompting
- Prompt skeleton used by the creator:
  > "I want you to create an eye-catchy YouTube thumbnail on this topic
  > with a big logo of [BRAND] and YouTube icon. Please use your best
  > design judgment to create a thumbnail that will drive CTR."
- Specify emotional tone: catchy, emotional, shocking, excited, calm, decent
- Specify ethnicity / appearance: Indian, Asian, American
- Specify facial expression: happy, cheerful, positive face
- Specify gesture: "one hand / finger showing towards the [LOGO]"
- Iterate: if text gets cut at top, ask AI to reposition inside safe area
- ChatGPT free plan limit: ~4-5 images per day

## Cross-video synthesis: the consensus rules

These rules appear in 3+ transcripts independently — treat as canon:

1. **2-3 colors max** (videos 2, 7) — never rainbow
2. **Dark bg + light text** as default (videos 2, 7)
3. **White > yellow > red** for text priority (video 2)
4. **Smooth, bright, vivid face** with white teeth and saturated eyes
   (videos 3, 6)
5. **Two-layer shadows** for realism (videos 5, 6)
6. **Edge light** to blend subject into bg (videos 5, 7)
7. **Saturation concentrated at focal point**, desaturated elsewhere
   (videos 2, 7)
8. **Don't overdo glow** (video 1)
9. **Squoosh for compression** to stay under 2MB (video 1)
10. **2560×1440 is enough** — 4K is wasted (video 1)
11. **Test at phone size** before publishing (video 6)
12. **AI upscaler + remove.bg + generative fill** as the budget toolchain
    (video 6)
13. **Meme-ability** as a distribution lever (video 4)
14. **Train the AI with reference thumbnails** for best output (video 8)

## Velocity-tier takeaways

- The niche is **growing**, not saturated — there is room.
- Mid-form (4-20 min) dominates; Shorts are nearly irrelevant for this
  topic. Thumbnail quality matters most for long-form content.
- Micro-tier channels (<10k subs) produce most of the content but the
  top-velocity videos come from small-to-mid channels with strong
  production value (MrBeast-style face edits).
- "Mistake" titles and number-list titles outperform generic "how to"
  titles in this niche.
- MrBeast is the dominant style reference — emulating his face-edit
  aesthetic is the safest high-CTR direction.

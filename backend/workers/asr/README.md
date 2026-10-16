# asr worker (whisper.cpp + Hinglish model)

The caption **ear** for `media` op=`caption` with `listener: "apex"`: hears a
clip and writes what was said, in Roman script, on this host. No API, no daily
allowance. Not a Python package; `caption/ear.ts` runs the binary directly.

```
whisper.cpp/build/bin/whisper-cli -m models/apex-q8_0.bin -f <clip audio> -t 4 -l en -bs 1 -bo 1 -mc 0 -nt -np
```

- **Model:** Oriserve `Whisper-Hindi2Hinglish-Apex` (Apache-2.0), Whisper
  large-v3-turbo fine-tuned on Indian code-mixed speech; converted to ggml and
  quantised to Q8_0 by a community member (`gouravg8/gtm-hi2hing-ggml`).
- **`-l en`** makes it write Roman script; **`-mc 0`** stops each 30 s window
  being primed with the last one's text, which is where invented tails come from.
- **Q8_0, not q5/q4:** this CPU (Neoverse-N1, no i8mm) runs the smaller
  quantisations slower. About 40 s for a 60 s clip, ~1.2 GB of memory.
- **Measured** on ten real clips against Gemini's transcripts: 18% of words
  different (Groq Whisper + Claude: 22%; Whisper-only fallback: 44%; two Gemini
  models vs each other: ~11%). Its spelling is a transliteration ("hamaare
  oopar"); `caption/editor.ts` rewrites it the way people type.

Setup: `pnpm setup:asr` (clones whisper.cpp at a pinned commit, builds
`whisper-cli`, downloads the model, ~900 MB). Overrides: `ASR_WORKER_DIR`,
`ASR_BIN`, `ASR_MODEL`.

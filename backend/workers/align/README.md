# align worker (Python)

Finds **when each caption word is spoken**. Used by `media` op=`caption` on
every transcribed clip whose words are in Roman script: the backend decides the
words (Whisper, a listener, a judge), hands them here with the clip's audio, and
gets a start and end per word back. The worker never renders and never touches
the network at run time.

```
python -m align <audio-or-video> --words words.json --out timings.json [--ffmpeg <path>]
```

`words.json` is a JSON array of strings in spoken order. `timings.json` is
`{ "version": 1, "words": [{ "start", "end", "score" }] }`, one entry per input
word, seconds from the start of the audio. Exit `0` on success, `2` on an
unexpected error (traceback on stderr) — the backend then keeps the timings the
words already had and reports `timingFallbackReason`, so a clip never fails
because of alignment.

## How it works

Forced alignment with torchaudio's `MMS_FA` (a wav2vec2 model trained for
exactly this, in 1,100+ languages, on romanized text). The model scores every
20 ms of audio against every letter; the aligner then finds the one path through
those scores that spells the words in order. No transcript is compared with
another, so it does not matter how a word was spelled by Whisper.

- The model knows `a-z` and the apostrophe. Case and punctuation are dropped.
- A word with no letter it knows (a number such as `27-28`, a word left in
  Devanagari) is passed as the **star token**: "some sound is here". It takes
  the audio between its neighbours, which is where it was said.
- `score` is the model's confidence in a word (0–1), `null` for a star word.

## Setup

```
pnpm setup:align        # venv, pinned CPU torch + torchaudio, model (~1.2 GB) into models/
```

torch and torchaudio are pinned to 2.8.0: torchaudio 2.9 removes `forced_align`
and the `MMS_FA` pipeline. One run takes about 45 s for a 50 s clip on 4 ARM
cores (most of it loading the model) and about 1.5 GB of memory, so the backend
runs one at a time (`caption/align.ts`).

Overrides: `ALIGN_WORKER_DIR`, `ALIGN_PYTHON`, `ALIGN_MODELS_DIR`.

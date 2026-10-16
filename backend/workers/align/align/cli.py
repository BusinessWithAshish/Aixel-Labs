"""python -m align <audio> --words words.json --out timings.json

Finds WHEN each caption word is spoken. `words.json` is a JSON array of strings, in spoken order;
`timings.json` gets one {start, end, score} per input word, same order, seconds from the start of
the audio. Analysis only: nothing is rendered and nothing touches the network at run time.

Exit 0 with timings written. Exit 2 = unexpected error, traceback on stderr; the backend then keeps
the timings it already had.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import traceback

from . import __version__
from .fetch_models import DEFAULT_MODELS_DIR, load_bundle

SAMPLE_RATE = 16000
STAR = "*"


def _log(message: str) -> None:
    print(f"[align] {message}", file=sys.stderr, flush=True)


def normalise(word: str, letters: set[str]) -> str:
    """A caption word as the sounds the model can look for.

    The model knows lower-case a-z and the apostrophe. A word with none of them (a number, a word
    left in another script) cannot be searched for by spelling, so it becomes the star token: "some
    sound is here", which takes whatever audio lies between its neighbours.
    """
    w = word.lower().replace("’", "'")
    w = "".join(ch for ch in w if ch in letters)
    return w if re.search(r"[a-z]", w) else STAR


def _load_audio(path: str, ffmpeg: str):
    import soundfile as sf
    import torch

    with tempfile.TemporaryDirectory(prefix="align-") as tmp:
        wav = os.path.join(tmp, "audio.wav")
        subprocess.run(
            [ffmpeg, "-v", "error", "-y", "-i", path, "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), wav],
            check=True,
        )
        samples, rate = sf.read(wav, dtype="float32")
    return torch.from_numpy(samples).unsqueeze(0), rate


def align(audio_path: str, words: list[str], models_dir: str, ffmpeg: str, threads: int) -> list[dict]:
    import torch
    import torchaudio.functional as F

    torch.set_num_threads(threads)
    bundle, model = load_bundle(models_dir)
    dictionary = bundle.get_dict(star=STAR)
    # Only real letters: the dictionary also holds the blank ("-"), which is never a target.
    letters = {token for token in dictionary if re.fullmatch(r"[a-z']", token)}

    keys = [normalise(word, letters) for word in words]
    waveform, rate = _load_audio(audio_path, ffmpeg)
    duration = waveform.size(1) / rate

    with torch.inference_mode():
        emission, _ = model(waveform)
    tokens = [dictionary[ch] for key in keys for ch in key]
    targets = torch.tensor([tokens], dtype=torch.int32)
    if targets.size(1) > emission.size(1):
        raise RuntimeError(f"{len(words)} words do not fit in {duration:.1f}s of audio")
    aligned, scores = F.forced_align(emission, targets, blank=0)
    spans = F.merge_tokens(aligned[0], scores[0].exp())
    seconds_per_frame = waveform.size(1) / emission.size(1) / rate

    out, cursor = [], 0
    for key in keys:
        part = spans[cursor : cursor + len(key)]
        cursor += len(key)
        frames = sum(span.end - span.start for span in part)
        score = sum(span.score * (span.end - span.start) for span in part) / max(1, frames)
        out.append(
            {
                "start": round(part[0].start * seconds_per_frame, 3),
                "end": round(part[-1].end * seconds_per_frame, 3),
                # A star matches anything, so its score says nothing about the word.
                "score": None if key == STAR else round(float(score), 3),
            }
        )
    _log(f"{len(words)} words over {duration:.1f}s")
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m align", description=__doc__)
    p.add_argument("audio", help="the clip, or its audio: anything ffmpeg reads")
    p.add_argument("--words", required=True, help="JSON array of the caption words, in spoken order")
    p.add_argument("--out", required=True, help="where to write the timings")
    p.add_argument("--ffmpeg", default="ffmpeg", help="ffmpeg binary (the backend passes ffmpeg-static)")
    p.add_argument("--models-dir", default=os.environ.get("ALIGN_MODELS_DIR") or str(DEFAULT_MODELS_DIR))
    p.add_argument("--threads", type=int, default=4)
    p.add_argument("--version", action="version", version=__version__)
    args = p.parse_args(argv)

    try:
        with open(args.words, encoding="utf8") as fh:
            words = json.load(fh)
        if not isinstance(words, list) or not words or not all(isinstance(w, str) for w in words):
            raise ValueError("--words must hold a non-empty JSON array of strings")
        timings = align(args.audio, words, args.models_dir, args.ffmpeg, args.threads)
        tmp = f"{args.out}.tmp"
        with open(tmp, "w", encoding="utf8") as fh:
            json.dump({"version": 1, "words": timings}, fh)
        os.replace(tmp, args.out)
        return 0
    except Exception:  # noqa: BLE001 - the backend falls back on any failure
        traceback.print_exc()
        return 2

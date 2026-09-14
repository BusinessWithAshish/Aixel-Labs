"""python -m reframe <clip> --out plan.json

Plans a speaker-following crop for one already-cut clip. Analysis only: writes plan.json and exits 0
with mode "speaker" (segments to render) or "center" (+ fallbackReason). Exit 2 = unexpected error,
traceback on stderr. The backend renders the centre crop for anything that is not a "speaker" plan.
"""

import argparse
import json
import os
import sys
import tempfile
import time
import traceback

from . import __version__
from .fetch_models import DEFAULT_MODELS_DIR, LRASD_WEIGHTS, PYANNOTE_DIRNAME, YUNET_MODEL

FPS = 25  # LR-ASD's training frame rate; all analysis runs on this timeline


class Fallback(Exception):
    """Expected reason to keep the centre crop (not an error)."""


def _log(message: str) -> None:
    print(f"[reframe] {message}", file=sys.stderr, flush=True)


def _write(path: str, plan: dict) -> None:
    tmp = f"{path}.tmp"
    with open(tmp, "w") as fh:
        json.dump(plan, fh, indent=1)
    os.replace(tmp, path)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m reframe", description=__doc__)
    p.add_argument("clip", help="already-cut clip, unframed (e.g. 16:9)")
    p.add_argument("--out", required=True, help="where to write plan.json")
    p.add_argument("--aspect", default="9:16", help="target aspect ratio W:H")
    p.add_argument("--ffmpeg", default="ffmpeg", help="ffmpeg binary (the backend passes ffmpeg-static)")
    p.add_argument("--models-dir", default=os.environ.get("REFRAME_MODELS_DIR") or str(DEFAULT_MODELS_DIR))
    p.add_argument("--work-dir", default=None, help="temp files go here (default: system temp)")
    p.add_argument("--speakers", choices=("auto", "pyannote", "none"), default="auto",
                   help="auto = pyannote when installed, LR-ASD only otherwise")
    p.add_argument("--min-run", type=float, default=0.45, help="stretches shorter than this (s) merge into a neighbour")
    p.add_argument("--lead", type=float, default=0.12, help="cut this many seconds before a speech onset")
    p.add_argument("--speak-thresh", type=float, default=0.0, help="LR-ASD logit above this = speaking")
    p.add_argument("--detect-stride", type=int, default=2)
    p.add_argument("--det-width", type=int, default=960)
    p.add_argument("--min-face-frac", type=float, default=0.03)
    a = p.parse_args(argv)

    started = time.time()
    timings: dict[str, float] = {}
    plan: dict = {"version": 1, "worker": __version__, "mode": "center", "fallbackReason": None, "aspect": a.aspect,
                  "source": None, "crop": None, "shots": [], "tracks": [], "speakers": {"source": "none"},
                  "segments": [], "timings": timings}

    def timed(name: str, fn, *args, **kwargs):
        t0 = time.time()
        result = fn(*args, **kwargs)
        timings[name] = round(time.time() - t0, 2)
        return result

    try:
        from .faces import collect_crops, detect_tracks
        from .media import extract_audio, probe
        from .plan import build_plan, crop_size
        from .shots import detect_shots

        info = probe(a.ffmpeg, a.clip)
        plan["source"] = {"width": info.width, "height": info.height, "duration": round(info.duration, 3), "fps": round(info.fps, 3)}
        if not info.has_video or info.width <= 0 or info.duration <= 0:
            raise Fallback("no readable video stream")
        ratio_w, ratio_h = (int(v) for v in a.aspect.split(":"))
        size = crop_size(info.width, info.height, ratio_w, ratio_h)
        if size is None:
            raise Fallback(f"source {info.width}x{info.height} is not wider than {a.aspect}; nothing to follow")
        crop_w, crop_h = size
        plan["crop"] = {"width": crop_w, "height": crop_h}

        shots = timed("shots_s", detect_shots, a.clip, info.duration)
        plan["shots"] = [[round(s, 3), round(e, 3)] for s, e in shots]
        tracks, n_frames = timed("faces_s", detect_tracks, a.ffmpeg, a.clip, info, shots,
                                 os.path.join(a.models_dir, YUNET_MODEL), FPS, a.det_width, a.detect_stride, a.min_face_frac)
        if not tracks:
            raise Fallback("no faces found")

        multi_face_shots = {k for k in range(len(shots)) if sum(1 for tr in tracks if tr["shot"] == k) >= 2}
        for tr in tracks:
            tr["needs_asd"] = tr["shot"] in multi_face_shots

        speakers = None
        if multi_face_shots:  # single-face shots need neither LR-ASD nor diarization
            from .asd import mfcc, score_tracks

            with tempfile.TemporaryDirectory(dir=a.work_dir) as work:
                timed("crops_s", collect_crops, a.ffmpeg, a.clip, info, tracks, FPS)
                audio = timed("audio_s", extract_audio, a.ffmpeg, a.clip, os.path.join(work, "audio16k.wav"))
                timed("asd_s", score_tracks, tracks, mfcc(audio), os.path.join(a.models_dir, LRASD_WEIGHTS), FPS)
                if a.speakers != "none":
                    try:
                        from .speakers import diarize

                        speakers = timed("speakers_s", diarize, audio, 16000, os.path.join(a.models_dir, PYANNOTE_DIRNAME))
                        plan["speakers"] = {"source": "pyannote", "turns": len(speakers["turns"]),
                                            "labels": sorted({t[2] for t in speakers["turns"]})}
                    except Exception as exc:
                        if a.speakers == "pyannote":
                            raise
                        plan["speakers"] = {"source": "none", "error": f"{type(exc).__name__}: {exc}"[:300]}
                        _log(f"speaker diarization unavailable, planning on LR-ASD alone: {exc}")

        result = timed("plan_s", build_plan, info=info, shots=shots, tracks=tracks, n_frames=n_frames, fps=FPS, crop_w=crop_w,
                       speakers=speakers, speak_thresh=a.speak_thresh, min_run=a.min_run, lead=a.lead)
        plan["segments"], plan["tracks"] = result["segments"], result["tracks"]
        plan["speakers"].update(mapping=result["mapping"], evidence=result["evidence"])
        if not plan["segments"]:
            raise Fallback("plan produced no segments")
        plan["mode"] = "speaker"
    except Fallback as reason:
        plan["mode"], plan["fallbackReason"] = "center", str(reason)
        _log(f"centre crop: {reason}")
    except Exception as exc:
        traceback.print_exc()
        plan["mode"], plan["fallbackReason"] = "center", f"worker error: {type(exc).__name__}: {exc}"[:500]
        timings["total_s"] = round(time.time() - started, 2)
        _write(a.out, plan)
        return 2

    timings["total_s"] = round(time.time() - started, 2)
    _write(a.out, plan)
    _log(f"{plan['mode']}: {len(plan['segments'])} segments, {len(plan['shots'])} shots, "
         f"{len(plan['tracks'])} faces, speakers={plan['speakers'].get('source')}, {timings['total_s']}s")
    return 0

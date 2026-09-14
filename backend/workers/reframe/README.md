# reframe worker (Python)

Plans a **speaker-following crop** for one already-cut clip. Used by `media`
op=`cut` with `reframe: "speaker"`: the backend cuts the range unframed (16:9),
spawns this worker, reads its `plan.json`, and renders the crop itself with
ffmpeg. The worker never renders and never touches the network at run time.

```
python -m reframe <clip.mp4> --out plan.json [--aspect 9:16] [--ffmpeg <path>]
```

Exit `0` with `mode: "speaker"` (crop segments to render) or `mode: "center"`
plus `fallbackReason`. Exit `2` on an unexpected error (traceback on stderr).
The backend renders the plain centre crop for anything that is not a
`"speaker"` plan, so a clip never fails because of reframing.

## How it decides

1. **Shots** — PySceneDetect `ContentDetector`. A crop never moves across a
   camera cut.
2. **Faces** — OpenCV YuNet at 25 fps (every 2nd frame), IoU tracking,
   duplicate-box suppression, same-seat fragment merge, median smoothing.
   Faces narrower than 3% of the frame (posters, background) are dropped.
3. **Shots with one face** — that face. The video's editor already chose.
4. **Shots with several faces**
   - **LR-ASD** (AVA weights) scores every face, every frame, from lip motion
     against the audio.
   - **pyannote** `speaker-diarization-community-1` says who speaks when,
     straight from the audio — no captions needed.
   - Each pyannote speaker is matched to the face whose LR-ASD score is
     highest across all of that speaker's solo speech in the shot. While a
     matched speaker talks, the crop is on their face; an unmatched voice
     falls back to LR-ASD's frame winner; silence holds the current face.
   - Without pyannote (model missing, error) the same plan runs on LR-ASD
     alone — the behaviour validated first.
5. **Cuts** land on speech onsets (0.12 s lead). Stretches under 0.45 s merge
   into a neighbour; back-to-back stretches on the same seat collapse.

## Setup (VPS, once)

```bash
pnpm --filter @aixellabs/backend setup:reframe      # or: bash workers/reframe/setup.sh
```

Creates `.venv/` (CPU PyTorch + requirements) and downloads into `models/`
(both gitignored):

| File | Source | Licence |
|---|---|---|
| `face_detection_yunet_2023mar.onnx` | opencv/opencv_zoo | MIT |
| `lrasd_pretrain_AVA.model` | Junhua-Liao/LR-ASD @ `1b6dcd2` | MIT |
| `pyannote-speaker-diarization-community-1/` | Hugging Face, **gated** | CC-BY-4.0 |

The two small files are checksum-verified. pyannote needs `HF_TOKEN` (read
from the environment or `backend/.env`) **only for this download**: the
account must have accepted the model's terms on its Hugging Face page, and a
fine-grained token needs "read access to public gated repos". After the
download it loads from disk, offline. Setup finishes without it; the worker
then runs LR-ASD-only.

## Backend env (optional)

| Var | Default |
|---|---|
| `REFRAME_WORKER_DIR` | `backend/workers/reframe` |
| `REFRAME_PYTHON` | `<worker dir>/.venv/bin/python` |
| `REFRAME_MODELS_DIR` | `<worker dir>/models` |

## Cost

Roughly a minute of CPU for a 45–60 s 1080p clip on the 4-core ARM VPS
(faces ~20 s, LR-ASD ~15–25 s for multi-face shots only, pyannote on top).
Single-face shots skip LR-ASD and pyannote entirely.

## Credits

- LR-ASD — Liao et al., *LR-ASD: Lightweight and Robust Network for Active
  Speaker Detection*, IJCV 2025. MIT. Model code vendored in `reframe/lrasd/`.
- pyannote.audio / speaker-diarization-community-1 — CC-BY-4.0.
- YuNet (OpenCV Zoo) — MIT. PySceneDetect — BSD-3-Clause.

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
4. **Shots with several faces** — **LR-ASD** (AVA weights) scores every face,
   every frame, by matching its lip motion to the audio; the crop goes to the
   face most confidently speaking, and holds through silence.
5. **Cuts** land on speech onsets (0.12 s lead). Stretches under 0.45 s merge
   into a neighbour; back-to-back stretches on the same seat collapse.
6. **Wide shots** — the whole frame, fitted to the width over a blurred copy
   of itself, instead of one face. A shot with no usable face (an
   establishing shot, people too small) is wide throughout. A multi-face shot goes wide while its
   faces talk over each other for 1.5 s, or while none of them talks for
   1.5 s (a laugh, a reaction). On top of that a clip gets a 2 s wide shot
   at least every 15 s, placed on a cut that is already there: a camera cut
   into a multi-face shot first, then any camera cut, then a change of
   speaker. A face shown for under 1 s next to a wide stretch is absorbed
   into it. Flags: `--wide-overlap`, `--wide-quiet`, `--wide-every` (0 = add
   none), `--wide-hold`.

No speaker diarization: LR-ASD already hears the audio. pyannote was tried
(2026-09-14) and removed — it only knows voices, so it still needed LR-ASD to
find the face; it doubled the runtime and hid a speaker when it merged two
voices.

## Setup (VPS, once)

```bash
pnpm --filter @aixellabs/backend setup:reframe      # or: bash workers/reframe/setup.sh
```

Creates `.venv/` (CPU PyTorch + requirements) and downloads into `models/`
(both gitignored, checksum-verified):

| File | Source | Licence |
|---|---|---|
| `face_detection_yunet_2023mar.onnx` | opencv/opencv_zoo | MIT |
| `lrasd_pretrain_AVA.model` | Junhua-Liao/LR-ASD @ `1b6dcd2` | MIT |

## Backend env (optional)

| Var | Default |
|---|---|
| `REFRAME_WORKER_DIR` | `backend/workers/reframe` |
| `REFRAME_PYTHON` | `<worker dir>/.venv/bin/python` |
| `REFRAME_MODELS_DIR` | `<worker dir>/models` |

## Cost

About 50 s of CPU for a 45–60 s 1080p clip on the 4-core ARM VPS (faces
~20 s, LR-ASD ~10–30 s for multi-face shots only). Single-face shots skip
LR-ASD entirely.

## Credits

- LR-ASD — Liao et al., *LR-ASD: Lightweight and Robust Network for Active
  Speaker Detection*, IJCV 2025. MIT. Model code vendored in `reframe/lrasd/`.
- YuNet (OpenCV Zoo) — MIT. PySceneDetect — BSD-3-Clause.

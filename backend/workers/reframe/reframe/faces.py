"""Faces: YuNet detection, per-shot tracks, and LR-ASD face crops.

Tracks are built per shot at the analysis frame rate: detect every `stride`-th frame, keep the
stronger of two boxes on the same face, match by IoU, then merge fragments of the same seat
(a missed detection or a head turn otherwise splits one person, which shortens LR-ASD's context).
"""

import cv2
import numpy as np
from scipy import signal

from .media import VideoInfo, frames

CROP_SCALE = 0.40      # LR-ASD reference crop geometry (cropScale)
CROP_PAD_VALUE = 110   # reference fill for pixels outside the frame


def _iou(b1, b2) -> float:
    ix0, iy0, ix1, iy1 = max(b1[0], b2[0]), max(b1[1], b2[1]), min(b1[2], b2[2]), min(b1[3], b2[3])
    inter = max(0.0, ix1 - ix0) * max(0.0, iy1 - iy0)
    union = (b1[2] - b1[0]) * (b1[3] - b1[1]) + (b2[2] - b2[0]) * (b2[3] - b2[1]) - inter
    return inter / union if union > 0 else 0.0


def _geometry(track):
    bx = np.array(track["boxes"])
    return np.median((bx[:, 0] + bx[:, 2]) / 2), np.median((bx[:, 1] + bx[:, 3]) / 2), np.median(bx[:, 2] - bx[:, 0])


def _merge_fragments(raw: list[dict]) -> None:
    raw.sort(key=lambda tr: tr["frames"][0])
    merged = True
    while merged:
        merged = False
        for i1 in range(len(raw)):
            for i2 in range(i1 + 1, len(raw)):
                t1, t2 = raw[i1], raw[i2]
                if t1["shot"] != t2["shot"]:
                    continue
                x1, y1, w1 = _geometry(t1)
                x2, y2, w2 = _geometry(t2)
                limit = 0.6 * max(w1, w2)
                if abs(x1 - x2) >= limit or abs(y1 - y2) >= limit:
                    continue
                common = sorted(set(t1["frames"]) & set(t2["frames"]))
                if common:  # overlapping in time: the same person only if the centres stay together
                    b1, b2 = dict(zip(t1["frames"], t1["boxes"])), dict(zip(t2["frames"], t2["boxes"]))
                    if np.median([abs((b1[c][0] + b1[c][2]) / 2 - (b2[c][0] + b2[c][2]) / 2) for c in common]) > 0.5 * max(w1, w2):
                        continue
                by_frame = dict(zip(t2["frames"], t2["boxes"]))
                by_frame.update(zip(t1["frames"], t1["boxes"]))
                t1["frames"] = sorted(by_frame)
                t1["boxes"] = [by_frame[f] for f in t1["frames"]]
                del raw[i2]
                merged = True
                break
            if merged:
                break


def detect_tracks(ffmpeg: str, path: str, info: VideoInfo, shots: list[tuple[float, float]], yunet_path: str,
                  fps: int, det_width: int = 960, stride: int = 2, min_face_frac: float = 0.03):
    """Returns (tracks, analysed frame count). Track boxes are in source pixels, per analysis frame."""
    def shot_at(t: float) -> int:
        for k, (st, en) in enumerate(shots):
            if st <= t < en:
                return k
        return len(shots) - 1

    W, H = info.width, info.height
    dw = det_width
    dh = int(round(H * dw / W / 2) * 2)
    sx, sy = W / dw, H / dh
    detector = cv2.FaceDetectorYN.create(yunet_path, "", (dw, dh), 0.6, 0.3, 5000)

    raw, n_frames = [], 0
    for j, img in enumerate(frames(ffmpeg, path, f"fps={fps},scale={dw}:{dh}", "bgr24", dw, dh, 3)):
        n_frames = j + 1
        if j % stride:
            continue
        k = shot_at(j / fps)
        _, found = detector.detect(img)
        kept = []
        for f in sorted([] if found is None else list(found), key=lambda f: -f[14]):
            fcx, fcy = f[0] + f[2] / 2, f[1] + f[3] / 2
            if all(abs(fcx - (g[0] + g[2] / 2)) > 0.5 * max(f[2], g[2]) or abs(fcy - (g[1] + g[3] / 2)) > 0.5 * max(f[3], g[3])
                   for g in kept):
                kept.append(f)
        used = set()
        for f in kept:
            box = (f[0] * sx, f[1] * sy, (f[0] + f[2]) * sx, (f[1] + f[3]) * sy)
            best, best_iou = None, 0.3
            for ti, tr in enumerate(raw):
                if ti in used or tr["shot"] != k or j - tr["frames"][-1] > 10:
                    continue
                v = _iou(tr["boxes"][-1], box)
                if v > best_iou:
                    best, best_iou = ti, v
            if best is None:
                raw.append({"shot": k, "frames": [j], "boxes": [box]})
                best = len(raw) - 1
            else:
                raw[best]["frames"].append(j)
                raw[best]["boxes"].append(box)
            used.add(best)

    _merge_fragments(raw)

    tracks = []
    for tr in raw:
        fr, bx = np.array(tr["frames"]), np.array(tr["boxes"])
        if len(fr) < 3 or fr[-1] - fr[0] < 10 or np.median(bx[:, 2] - bx[:, 0]) < min_face_frac * W:
            continue
        full = np.arange(fr[0], fr[-1] + 1)
        boxes = np.stack([np.interp(full, fr, bx[:, c]) for c in range(4)], axis=1)
        half = np.maximum(boxes[:, 3] - boxes[:, 1], boxes[:, 2] - boxes[:, 0]) / 2
        cx, cy = (boxes[:, 0] + boxes[:, 2]) / 2, (boxes[:, 1] + boxes[:, 3]) / 2
        kern = min(13, len(full) if len(full) % 2 else len(full) - 1)
        tracks.append({"id": len(tracks), "shot": tr["shot"], "start": int(full[0]), "end": int(full[-1]),
                       "s": signal.medfilt(half, kern), "x": signal.medfilt(cx, kern), "y": signal.medfilt(cy, kern)})
    return tracks, n_frames


def _crop_face(gray: np.ndarray, mx: float, my: float, bs: float) -> np.ndarray:
    """LR-ASD's reference crop: mouth-weighted square, padded, 224 -> centre 112."""
    y0, y1 = int(my - bs), int(my + bs * (1 + 2 * CROP_SCALE))
    x0, x1 = int(mx - bs * (1 + CROP_SCALE)), int(mx + bs * (1 + CROP_SCALE))
    out = np.full((max(1, y1 - y0), max(1, x1 - x0)), CROP_PAD_VALUE, np.uint8)
    gy0, gy1, gx0, gx1 = max(0, y0), min(gray.shape[0], y1), max(0, x0), min(gray.shape[1], x1)
    if gy1 > gy0 and gx1 > gx0:
        out[gy0 - y0:gy1 - y0, gx0 - x0:gx1 - x0] = gray[gy0:gy1, gx0:gx1]
    return cv2.resize(out, (224, 224))[56:168, 56:168]


def collect_crops(ffmpeg: str, path: str, info: VideoInfo, tracks: list[dict], fps: int) -> None:
    """Adds `crops` (T x 112 x 112 grayscale) to every track flagged `needs_asd`."""
    wanted = [tr for tr in tracks if tr.get("needs_asd")]
    if not wanted:
        return
    for tr in wanted:
        tr["crops"] = []
    last = max(tr["end"] for tr in wanted)
    for j, gray in enumerate(frames(ffmpeg, path, f"fps={fps}", "gray", info.width, info.height, 1)):
        if j > last:
            break
        for tr in wanted:
            if tr["start"] <= j <= tr["end"]:
                q = j - tr["start"]
                tr["crops"].append(_crop_face(gray, tr["x"][q], tr["y"][q], tr["s"][q]))

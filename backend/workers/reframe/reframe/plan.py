"""Turns shots, face tracks and LR-ASD scores into crop segments.

Offline, so cuts land exactly on speech onsets instead of waiting out a live-camera hold.
"""

import numpy as np


def crop_size(width: int, height: int, ratio_w: int, ratio_h: int):
    """(crop_w, crop_h) for a full-height crop, or None when the source is not wider than the target."""
    if width * ratio_h <= height * ratio_w:
        return None
    return int(round(height * ratio_w / ratio_h / 2) * 2), int(height)


def build_plan(*, info, shots, tracks, n_frames, fps, crop_w, speak_thresh=0.0, min_run=0.45, lead=0.12) -> dict:
    W = info.width

    def shot_at(t: float) -> int:
        for k, (st, en) in enumerate(shots):
            if st <= t < en:
                return k
        return len(shots) - 1

    frame_shot = [shot_at(j / fps) for j in range(n_frames)]
    by_id = {tr["id"]: tr for tr in tracks}
    faces_by_shot = {k: [tr for tr in tracks if tr["shot"] == k] for k in range(len(shots))}

    def score_at(tr, j):
        sc = tr.get("score")
        q = j - tr["start"]
        return float(sc[q]) if sc is not None and 0 <= q < len(sc) else None

    def x_at(tr, j) -> float:
        q = min(max(j - tr["start"], 0), len(tr["x"]) - 1)
        return float(tr["x"][q])

    # ---- the face to show, frame by frame: the face LR-ASD is most sure is speaking ----
    target = [None] * n_frames
    for j in range(n_frames):
        k = frame_shot[j]
        here = [tr for tr in faces_by_shot.get(k, []) if tr["start"] <= j <= tr["end"]]
        if not here:
            continue
        if len(faces_by_shot[k]) == 1:  # the editor already chose
            target[j] = here[0]["id"]
            continue
        best, best_score = None, speak_thresh
        for tr in here:
            s = score_at(tr, j)
            if s is not None and s > best_score:
                best, best_score = tr["id"], s
        target[j] = best

    # hold through gaps inside a shot; a shot's leading gap takes its first choice
    filled, last = [], {}
    for j in range(n_frames):
        k, face = frame_shot[j], target[j]
        if face is None:
            face = last.get(k)
        else:
            last[k] = face
        filled.append([k, face])
    for k in range(len(shots)):
        idx = [j for j in range(n_frames) if filled[j][0] == k]
        first = next((filled[j][1] for j in idx if filled[j][1] is not None), None)
        if first is None and len(faces_by_shot.get(k, [])) == 1:
            first = faces_by_shot[k][0]["id"]
        for j in idx:
            if filled[j][1] is None:
                filled[j][1] = first
            else:
                break

    runs = []
    for j, (k, face) in enumerate(filled):
        if runs and runs[-1]["shot"] == k and runs[-1]["face"] == face:
            runs[-1]["end"] = j + 1
        else:
            runs.append({"shot": k, "face": face, "start": j, "end": j + 1})

    min_frames = int(round(min_run * fps))
    while True:
        short = [i for i, r in enumerate(runs) if r["end"] - r["start"] < min_frames
                 and ((i > 0 and runs[i - 1]["shot"] == r["shot"]) or (i + 1 < len(runs) and runs[i + 1]["shot"] == r["shot"]))]
        if not short:
            break
        i = min(short, key=lambda q: runs[q]["end"] - runs[q]["start"])
        r = runs[i]
        prev_ok = i > 0 and runs[i - 1]["shot"] == r["shot"]
        next_ok = i + 1 < len(runs) and runs[i + 1]["shot"] == r["shot"]
        if prev_ok and next_ok and runs[i - 1]["face"] == runs[i + 1]["face"]:
            runs[i - 1]["end"] = runs[i + 1]["end"]
            del runs[i:i + 2]
        elif prev_ok:
            runs[i - 1]["end"] = r["end"]
            del runs[i]
        else:
            runs[i + 1]["start"] = r["start"]
            del runs[i]

    lead_frames = int(round(lead * fps))
    for i in range(1, len(runs)):
        if runs[i]["shot"] == runs[i - 1]["shot"]:
            boundary = max(runs[i - 1]["start"] + min_frames // 2, runs[i]["start"] - lead_frames)
            runs[i - 1]["end"] = runs[i]["start"] = boundary

    segments = []
    for r in runs:
        tr = by_id.get(r["face"])
        cx = W / 2 if tr is None else float(np.median([x_at(tr, j) for j in range(r["start"], r["end"])]))
        x = int(max(0, min(W - crop_w, round(cx - crop_w / 2))))
        seg = {"start": round(r["start"] / fps, 3), "end": round(r["end"] / fps, 3), "shot": r["shot"], "face": r["face"], "x": x, "y": 0}
        prev = segments[-1] if segments else None
        if prev and prev["shot"] == seg["shot"] and abs(prev["x"] - seg["x"]) < 0.25 * crop_w:  # same seat: no jump cut
            d1, d2 = prev["end"] - prev["start"], seg["end"] - seg["start"]
            prev["x"] = int(round((prev["x"] * d1 + seg["x"] * d2) / max(d1 + d2, 1e-6)))
            prev["end"] = seg["end"]
            if d2 > d1:
                prev["face"] = seg["face"]
        else:
            segments.append(seg)
    if segments:
        segments[-1]["end"] = round(info.duration, 3)

    return {
        "segments": segments,
        "tracks": [{"id": tr["id"], "shot": tr["shot"], "start": round(tr["start"] / fps, 3), "end": round((tr["end"] + 1) / fps, 3),
                    "x": round(float(np.median(tr["x"])), 1), "width": round(float(np.median(tr["s"])) * 2, 1),
                    "speaking": None if tr.get("score") is None else round(float(np.mean(np.asarray(tr["score"]) > speak_thresh)), 3)}
                   for tr in tracks],
    }

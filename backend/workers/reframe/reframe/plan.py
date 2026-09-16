"""Turns shots, face tracks and LR-ASD scores into crop segments.

Offline, so cuts land exactly on speech onsets instead of waiting out a live-camera hold.
A segment either crops to one face or is "wide" and shows the whole frame: when faces talk over
each other, when nobody talks (a laugh, a reaction), and at least every `wide_every` seconds so
a clip never stays on tight crops alone.
"""

import math

import numpy as np

WIDE = "wide"  # pseudo-face for stretches that show the whole frame


def crop_size(width: int, height: int, ratio_w: int, ratio_h: int):
    """(crop_w, crop_h) for a full-height crop, or None when the source is not wider than the target."""
    if width * ratio_h <= height * ratio_w:
        return None
    return int(round(height * ratio_w / ratio_h / 2) * 2), int(height)


def _runs_of(mask, max_gap: int) -> list[list[int]]:
    """[start, end) frame runs where mask is true, bridging gaps of up to max_gap frames."""
    runs = []
    for j, on in enumerate(mask):
        if not on:
            continue
        if runs and j - runs[-1][1] <= max_gap:
            runs[-1][1] = j + 1
        else:
            runs.append([j, j + 1])
    return runs


def _add_wide_breaks(segments, multi_face_shots, duration, every, hold, wide_x) -> None:
    """Inserts a wide stretch wherever the plan would stay on crops for longer than `every` seconds.

    Placed on a cut that is already there when one exists — a camera cut first (into a shot with
    several faces best), else a change of speaker — so it rarely adds a cut of its own.
    """
    cursor = 0.0
    while True:
        upcoming = [s for s in segments if s["layout"] == WIDE and s["end"] > cursor]
        nxt = upcoming[0]["start"] if upcoming else duration
        if nxt - cursor <= every:
            if not upcoming:
                return
            cursor = upcoming[0]["end"]
            continue

        lo = cursor + hold
        hi = max(lo, min(cursor + every, nxt - hold))
        best, best_rank = None, None
        for i, s in enumerate(segments):
            if s["layout"] == WIDE or not lo <= s["start"] <= hi:
                continue
            camera_cut = i == 0 or segments[i - 1]["shot"] != s["shot"]
            rank = (2 if camera_cut and s["shot"] in multi_face_shots else 1 if camera_cut else 0, s["start"])
            if best_rank is None or rank > best_rank:
                best, best_rank = s, rank
        if best is None:  # no cut to sit on: space the added wide stretches evenly over what is left
            t = min(hi, max(lo, cursor + (nxt - cursor) / math.ceil((nxt - cursor) / every) - hold / 2))
            best = next(s for s in segments if s["start"] <= t < s["end"])
        else:
            t = best["start"]
        end = min(t + hold, max(s["end"] for s in segments if s["shot"] == best["shot"]))

        pieces = [{"start": round(t, 3), "end": round(end, 3), "shot": best["shot"], "face": None, "layout": WIDE, "x": wide_x, "y": 0}]
        for s in segments:
            if s["end"] <= t or s["start"] >= end:
                pieces.append(s)
                continue
            if s["start"] < t:
                pieces.append({**s, "end": round(t, 3)})
            if s["end"] > end:
                pieces.append({**s, "start": round(end, 3)})
        segments[:] = sorted(pieces, key=lambda s: s["start"])
        cursor = end


def _absorb_short_crops(segments, shortest) -> None:
    """A face held for under `shortest` seconds next to a wide stretch of the same shot reads as a flicker: stay wide over it."""
    i = 0
    while i < len(segments):
        s = segments[i]
        wide = [segments[n] for n in (i - 1, i + 1)
                if 0 <= n < len(segments) and segments[n]["layout"] == WIDE and segments[n]["shot"] == s["shot"]]
        if s["layout"] != WIDE and wide and s["end"] - s["start"] < shortest:
            wide[0]["start"], wide[0]["end"] = min(wide[0]["start"], s["start"]), max(wide[0]["end"], s["end"])
            del segments[i]
            i = max(0, i - 1)
            continue
        i += 1
    i = 1
    while i < len(segments):
        a, b = segments[i - 1], segments[i]
        if a["layout"] == b["layout"] == WIDE and a["shot"] == b["shot"]:
            a["end"] = b["end"]
            del segments[i]
        else:
            i += 1


def _self_check() -> None:
    """A shot with no face is wide throughout; a long single-face shot gets spaced wide breaks; wide_every=0 adds none."""
    from types import SimpleNamespace

    info = SimpleNamespace(width=1920, height=1080, duration=40.0)
    face = {"id": 0, "shot": 0, "start": 0, "end": 999, "x": np.full(1000, 900.0), "s": np.full(1000, 100.0)}

    def plan(tracks, **kwargs):
        return build_plan(info=info, shots=[(0, 40)], tracks=tracks, n_frames=1000, fps=25, crop_w=608, **kwargs)["segments"]

    faceless = plan([])
    assert [s["layout"] for s in faceless] == [WIDE], faceless

    spaced = plan([face])
    assert [s["layout"] for s in spaced] == ["crop", WIDE, "crop", WIDE, "crop"], spaced
    assert spaced[0]["start"] == 0 and abs(spaced[-1]["end"] - info.duration) < 1e-6, spaced
    assert all(abs(a["end"] - b["start"]) < 1e-6 for a, b in zip(spaced, spaced[1:])), spaced
    since_wide = 0.0
    for seg in spaced:
        if seg["layout"] == WIDE:
            assert seg["start"] - since_wide <= 15 + 1e-6, spaced
            since_wide = seg["end"]
    assert info.duration - since_wide <= 15 + 1e-6, spaced

    assert [s["layout"] for s in plan([face], wide_every=0)] == ["crop"]


def build_plan(*, info, shots, tracks, n_frames, fps, crop_w, speak_thresh=0.0, min_run=0.45, lead=0.12,
               wide_overlap=1.5, wide_quiet=1.5, wide_every=15.0, wide_hold=2.0) -> dict:
    W = info.width

    def shot_at(t: float) -> int:
        for k, (st, en) in enumerate(shots):
            if st <= t < en:
                return k
        return len(shots) - 1

    frame_shot = [shot_at(j / fps) for j in range(n_frames)]
    by_id = {tr["id"]: tr for tr in tracks}
    faces_by_shot = {k: [tr for tr in tracks if tr["shot"] == k] for k in range(len(shots))}
    multi_face_shots = {k for k, faces in faces_by_shot.items() if len(faces) >= 2}

    def score_at(tr, j):
        sc = tr.get("score")
        q = j - tr["start"]
        return float(sc[q]) if sc is not None and 0 <= q < len(sc) else None

    def x_at(tr, j) -> float:
        q = min(max(j - tr["start"], 0), len(tr["x"]) - 1)
        return float(tr["x"][q])

    # ---- the face to show, frame by frame: the face LR-ASD is most sure is speaking ----
    target = [None] * n_frames
    talking = np.full(n_frames, -1)  # faces speaking in a multi-face shot; -1 = not scored
    for j in range(n_frames):
        k = frame_shot[j]
        here = [tr for tr in faces_by_shot.get(k, []) if tr["start"] <= j <= tr["end"]]
        if not here:
            continue
        if len(faces_by_shot[k]) == 1:  # the editor already chose
            target[j] = here[0]["id"]
            continue
        best, best_score = None, speak_thresh
        scores = []
        for tr in here:
            s = score_at(tr, j)
            if s is None:
                continue
            scores.append(s)
            if s > best_score:
                best, best_score = tr["id"], s
        target[j] = best
        if scores:
            talking[j] = sum(1 for s in scores if s > speak_thresh)

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

    # the whole frame while faces talk over each other, or while nobody talks — long enough to be a moment
    bridge = int(round(min_run / 2 * fps))
    for mask, seconds in ((talking >= 2, wide_overlap), (talking == 0, wide_quiet)):
        for s, e in _runs_of(mask, bridge):
            if e - s >= seconds * fps:
                for j in range(s, e):
                    if frame_shot[j] in multi_face_shots:
                        filled[j][1] = WIDE
    for j in range(n_frames):  # no face to crop to (an establishing shot, people too small): show all of it
        if not faces_by_shot.get(frame_shot[j]):
            filled[j][1] = WIDE

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

    wide_x = int(max(0, round((W - crop_w) / 2)))
    segments = []
    for r in runs:
        wide = r["face"] == WIDE
        tr = None if wide else by_id.get(r["face"])
        cx = W / 2 if tr is None else float(np.median([x_at(tr, j) for j in range(r["start"], r["end"])]))
        x = int(max(0, min(W - crop_w, round(cx - crop_w / 2))))
        seg = {"start": round(r["start"] / fps, 3), "end": round(r["end"] / fps, 3), "shot": r["shot"],
               "face": None if wide else r["face"], "layout": WIDE if wide else "crop", "x": x, "y": 0}
        prev = segments[-1] if segments else None
        if prev and prev["shot"] == seg["shot"] and prev["layout"] == seg["layout"] and abs(prev["x"] - seg["x"]) < 0.25 * crop_w:  # same seat: no jump cut
            d1, d2 = prev["end"] - prev["start"], seg["end"] - seg["start"]
            prev["x"] = int(round((prev["x"] * d1 + seg["x"] * d2) / max(d1 + d2, 1e-6)))
            prev["end"] = seg["end"]
            if d2 > d1:
                prev["face"] = seg["face"]
        else:
            segments.append(seg)
    if segments:
        segments[-1]["end"] = round(info.duration, 3)
        if wide_every > 0:
            _add_wide_breaks(segments, multi_face_shots, info.duration, wide_every, wide_hold, wide_x)
        _absorb_short_crops(segments, wide_hold / 2)

    return {
        "segments": segments,
        "tracks": [{"id": tr["id"], "shot": tr["shot"], "start": round(tr["start"] / fps, 3), "end": round((tr["end"] + 1) / fps, 3),
                    "x": round(float(np.median(tr["x"])), 1), "width": round(float(np.median(tr["s"])) * 2, 1),
                    "speaking": None if tr.get("score") is None else round(float(np.mean(np.asarray(tr["score"]) > speak_thresh)), 3)}
                   for tr in tracks],
    }


if __name__ == "__main__":
    _self_check()
    print("reframe plan self-check ok")

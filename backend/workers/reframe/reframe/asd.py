"""LR-ASD audio-visual active speaker scores per face track.

Liao et al., "LR-ASD: Lightweight and Robust Network for Active Speaker Detection", IJCV 2025 (MIT).
Uses the AVA-pretrained weights: the TalkSet fine-tune was measured to barely respond to audio on
podcast footage (scores unchanged under +/-1 s audio shifts), which reduces it to mouth-motion.
"""

import os

import numpy as np
import python_speech_features
import torch
import torch.nn as nn

from .lrasd.Model import ASD_Model

# Reference multi-duration ensemble {1,1,1,2,2,2,3,3,4,5,6} as (seconds, weight).
DURATIONS = ((1, 3), (2, 3), (3, 2), (4, 1), (5, 1), (6, 1))


def mfcc(audio_16k: np.ndarray) -> np.ndarray:
    """13-dim MFCC at 100 frames/s — exactly the features LR-ASD was trained on."""
    return python_speech_features.mfcc(audio_16k, 16000, numcep=13, winlen=0.025, winstep=0.010)


def _load(weights_path: str):
    state = torch.load(weights_path, map_location="cpu")
    model, head = ASD_Model(), nn.Linear(128, 2)
    model_state = {}
    for name, param in state.items():
        name = name.replace("module.", "")
        if name.startswith("model."):
            model_state[name[len("model."):]] = param
        elif name == "lossAV.FC.weight":
            head.weight.data.copy_(param)
        elif name == "lossAV.FC.bias":
            head.bias.data.copy_(param)
    missing, _ = model.load_state_dict(model_state, strict=False)
    if missing:
        raise RuntimeError(f"LR-ASD weights do not match the model: missing {missing[:5]}")
    return model.eval(), head.eval()


def score_tracks(tracks: list[dict], features: np.ndarray, weights_path: str, fps: int) -> None:
    """Sets `score` (per-frame speaking logit, >0 = speaking) on tracks flagged `needs_asd`."""
    torch.set_num_threads(os.cpu_count() or 4)
    model, head = _load(weights_path)
    for tr in tracks:
        crops = tr.pop("crops", None)
        if not tr.get("needs_asd") or not crops:
            continue
        video = np.stack(crops).astype(np.float32)
        audio = features[tr["start"] * 4:(tr["start"] + len(video)) * 4].astype(np.float32)
        length = min(len(video), len(audio) // 4)
        if length < fps:  # under a second of context: not worth a score
            continue
        with torch.no_grad():
            embed_a = model.forward_audio_frontend(torch.from_numpy(audio[:length * 4]).unsqueeze(0))
            embed_v = model.forward_visual_frontend(torch.from_numpy(video[:length]).unsqueeze(0))
            length = min(length, embed_a.shape[1], embed_v.shape[1])
            total, weight_sum = np.zeros(length), 0
            for seconds, weight in DURATIONS:
                window, scores = seconds * fps, np.zeros(length)
                for f0 in range(0, length, window):
                    f1 = min(length, f0 + window)
                    out = model.forward_audio_visual_backend(embed_a[:, f0:f1], embed_v[:, f0:f1])
                    scores[f0:f1] = head(out)[:, 1].numpy()
                total += weight * scores
                weight_sum += weight
        raw = total / weight_sum
        tr["score"] = np.array([raw[max(0, i - 2):i + 3].mean() for i in range(length)])  # +/-2 frame mean, as in the demo
        tr["end"] = tr["start"] + length - 1

"""pyannote speaker diarization from the clip's own audio — works with or without captions.

Loads `pyannote/speaker-diarization-community-1` from a local folder (downloaded once by
fetch_models.py), so it runs offline. Audio is passed in memory: torchcodec, pyannote's file
decoder, does not load on every platform (it fails on this ARM VPS).
"""

import os
from pathlib import Path

import numpy as np


def diarize(audio_16k: np.ndarray, sample_rate: int, model_dir: str) -> dict:
    """Returns {"turns": [(start, end, label)] overlap-aware, "exclusive": [...] one speaker at a time}."""
    if not (Path(model_dir) / "config.yaml").exists():
        raise FileNotFoundError(f"pyannote model not downloaded ({model_dir}); run setup.sh with HF_TOKEN")

    import torch
    from pyannote.audio import Pipeline

    torch.set_num_threads(os.cpu_count() or 4)
    pipeline = Pipeline.from_pretrained(model_dir)
    waveform = torch.from_numpy(audio_16k.astype(np.float32) / 32768.0).unsqueeze(0)
    output = pipeline({"waveform": waveform, "sample_rate": sample_rate})

    annotation = getattr(output, "speaker_diarization", output)
    exclusive = getattr(output, "exclusive_speaker_diarization", None) or annotation

    def turns(ann) -> list[tuple[float, float, str]]:
        return [(float(seg.start), float(seg.end), str(label)) for seg, _, label in ann.itertracks(yield_label=True)]

    return {"turns": turns(annotation), "exclusive": turns(exclusive)}

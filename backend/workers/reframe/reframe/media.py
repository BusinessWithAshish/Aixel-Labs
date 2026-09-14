"""ffmpeg helpers: probe a clip, stream raw frames, extract 16 kHz mono audio."""

import re
import subprocess
from dataclasses import dataclass

import numpy as np
from scipy.io import wavfile


@dataclass
class VideoInfo:
    width: int
    height: int
    duration: float
    fps: float
    has_video: bool
    has_audio: bool


def probe(ffmpeg: str, path: str) -> VideoInfo:
    """Reads ffmpeg's own input banner (same approach as the backend's probeMediaStreams)."""
    err = subprocess.run([ffmpeg, "-hide_banner", "-i", path], capture_output=True, text=True).stderr
    dur = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", err)
    size = re.search(r"Stream #\d+:\d+.*: Video:.*?,\s*(\d{2,5})x(\d{2,5})", err)
    fps = re.search(r"Stream #\d+:\d+.*: Video:.*?([\d.]+) fps", err)
    return VideoInfo(
        width=int(size.group(1)) if size else 0,
        height=int(size.group(2)) if size else 0,
        duration=(int(dur.group(1)) * 3600 + int(dur.group(2)) * 60 + float(dur.group(3))) if dur else 0.0,
        fps=float(fps.group(1)) if fps else 0.0,
        has_video=size is not None,
        has_audio=re.search(r"Stream #\d+:\d+.*: Audio:", err) is not None,
    )


def frames(ffmpeg: str, path: str, vf: str, pix_fmt: str, w: int, h: int, channels: int):
    """Yields decoded frames as uint8 arrays; stopping early kills ffmpeg."""
    proc = subprocess.Popen([ffmpeg, "-v", "error", "-i", path, "-vf", vf, "-pix_fmt", pix_fmt, "-f", "rawvideo", "-"],
                            stdout=subprocess.PIPE, bufsize=10 ** 8)
    size = w * h * channels
    shape = (h, w) if channels == 1 else (h, w, channels)
    try:
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            yield np.frombuffer(buf, np.uint8).reshape(shape)
    finally:
        proc.kill()
        proc.stdout.close()
        proc.wait()


def extract_audio(ffmpeg: str, path: str, wav_path: str) -> np.ndarray:
    """16 kHz mono int16 — the format LR-ASD's MFCC features take."""
    subprocess.run([ffmpeg, "-y", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "16000", "-acodec", "pcm_s16le", wav_path],
                   check=True)
    _, audio = wavfile.read(wav_path)
    return audio

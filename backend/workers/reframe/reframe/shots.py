"""Camera cuts (the video's own editing). A crop never moves across one."""

from scenedetect import ContentDetector, detect


def _seconds(timecode) -> float:
    value = getattr(timecode, "seconds", None)
    return float(value if value is not None else timecode.get_seconds())


def detect_shots(path: str, duration: float) -> list[tuple[float, float]]:
    scenes = detect(path, ContentDetector())
    shots = [(_seconds(start), _seconds(end)) for start, end in scenes]
    return shots or [(0.0, duration)]

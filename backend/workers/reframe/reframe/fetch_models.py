"""Downloads the worker's model files into models/ (checksum-verified). Exit 1 when one could not be fetched."""

import hashlib
import os
import sys
import urllib.request
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODELS_DIR = WORKER_DIR / "models"

YUNET_MODEL = "face_detection_yunet_2023mar.onnx"
LRASD_WEIGHTS = "lrasd_pretrain_AVA.model"

REQUIRED = (
    (YUNET_MODEL,
     "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
     "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"),
    (LRASD_WEIGHTS,
     "https://github.com/Junhua-Liao/LR-ASD/raw/1b6dcd2d8fc2895683de6508ec6294ec47d388ca/weight/pretrain_AVA.model",
     "85e6c77fc981595234790d1e128ebb60352d37726b2445e0ef8891e2512fe9e3"),
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _fetch(name: str, url: str, sha256: str, models_dir: Path) -> bool:
    dest = models_dir / name
    if dest.exists() and _sha256(dest) == sha256:
        print(f"ok       {name}")
        return True
    part = dest.with_suffix(dest.suffix + ".part")
    try:
        urllib.request.urlretrieve(url, part)
        if _sha256(part) != sha256:
            part.unlink(missing_ok=True)
            print(f"FAILED   {name}: checksum mismatch", file=sys.stderr)
            return False
        part.replace(dest)
        print(f"fetched  {name}")
        return True
    except Exception as exc:  # network, 404
        part.unlink(missing_ok=True)
        print(f"FAILED   {name}: {exc}", file=sys.stderr)
        return False


def main() -> int:
    models_dir = Path(os.environ.get("REFRAME_MODELS_DIR") or DEFAULT_MODELS_DIR)
    models_dir.mkdir(parents=True, exist_ok=True)
    ok = all([_fetch(name, url, sha, models_dir) for name, url, sha in REQUIRED])
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

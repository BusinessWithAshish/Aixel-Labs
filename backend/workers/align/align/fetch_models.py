"""Download the MMS_FA weights into the worker's models/ folder (about 1.2 GB, once)."""

import os
from pathlib import Path

DEFAULT_MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


def load_bundle(models_dir: str | os.PathLike):
    """The MMS_FA model with the star token, weights cached under `models_dir`."""
    import torchaudio

    bundle = torchaudio.pipelines.MMS_FA
    os.makedirs(models_dir, exist_ok=True)
    model = bundle.get_model(with_star=True, dl_kwargs={"model_dir": str(models_dir)})
    return bundle, model


if __name__ == "__main__":
    load_bundle(os.environ.get("ALIGN_MODELS_DIR") or DEFAULT_MODELS_DIR)
    print(f"[align] model ready in {os.environ.get('ALIGN_MODELS_DIR') or DEFAULT_MODELS_DIR}")

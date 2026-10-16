#!/usr/bin/env bash
# One-time setup for the caption-alignment worker: venv, CPU PyTorch + torchaudio, the MMS_FA model.
set -euo pipefail
cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"
[ -x .venv/bin/python ] || "$PYTHON" -m venv .venv
.venv/bin/pip install -q --upgrade pip
# Pinned: torchaudio 2.9 removes forced_align and the MMS_FA pipeline with it.
.venv/bin/pip install -q torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install -q -r requirements.txt
.venv/bin/python -m align.fetch_models

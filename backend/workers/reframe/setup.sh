#!/usr/bin/env bash
# One-time setup for the speaker-reframe worker: venv, CPU PyTorch, deps, model files.
set -euo pipefail
cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"
[ -x .venv/bin/python ] || "$PYTHON" -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q torch --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install -q -r requirements.txt
.venv/bin/python -m reframe.fetch_models

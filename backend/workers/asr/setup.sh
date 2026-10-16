#!/usr/bin/env bash
# One-time setup for the local caption ear: whisper.cpp (pinned) + the Hinglish model.
set -euo pipefail
cd "$(dirname "$0")"

WHISPER_CPP_COMMIT=0c7be696371069e0baa2515ed7aa08d5a5473aa6
if [ ! -x whisper.cpp/build/bin/whisper-cli ]; then
  [ -d whisper.cpp ] || git clone https://github.com/ggml-org/whisper.cpp
  git -C whisper.cpp checkout -q "$WHISPER_CPP_COMMIT"
  cmake -S whisper.cpp -B whisper.cpp/build -DCMAKE_BUILD_TYPE=Release
  cmake --build whisper.cpp/build -j"$(nproc)" --target whisper-cli
fi

# Oriserve Whisper-Hindi2Hinglish-Apex (Apache-2.0), converted to ggml and quantised to Q8_0.
# Q8_0, not q5/q4: on this ARM CPU (no i8mm) the smaller quantisations are SLOWER.
MODEL=models/apex-q8_0.bin
[ -s "$MODEL" ] || curl -fL -o "$MODEL" \
  https://huggingface.co/gouravg8/gtm-hi2hing-ggml/resolve/main/ggml-apex-hinglish-q8_0.bin
echo "[asr] ready: $(pwd)/$MODEL"

#!/usr/bin/env bash
# Vendor the in-browser abstractive-generation stack (library + weights) into the
# repo so Ask's 🧠 抽象生成 works fully on-device, NO external AI API at runtime.
#
# RUN THIS IN A NETWORK-ENABLED ENVIRONMENT (the cloud session that built the app
# has outbound network disabled). It downloads ~300MB; commit the result.
#
# Honors 外部取得ゼロ AT RUNTIME: weights/library are served from this repo's own
# origin afterwards. The download here is a one-off vendoring step (like pdf.js).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL_REPO="${MODEL_REPO:-onnx-community/Qwen2.5-0.5B-Instruct}"
MODEL_DIR="${MODEL_DIR:-$ROOT/assets/models/qwen2.5-0.5b-instruct-onnx}"
DTYPE="${DTYPE:-q4f16}"
VENDOR="$ROOT/assets/vendor/transformers"

echo "==> 1/3 vendor transformers.js into $VENDOR"
mkdir -p "$VENDOR"
npm i @huggingface/transformers >/dev/null 2>&1 || npm i @huggingface/transformers
cp -r node_modules/@huggingface/transformers/dist/* "$VENDOR"/

echo "==> 2/3 download model ($MODEL_REPO, dtype=$DTYPE) into $MODEL_DIR"
mkdir -p "$MODEL_DIR"
if command -v huggingface-cli >/dev/null 2>&1; then
  huggingface-cli download "$MODEL_REPO" \
    --include "config.json" "tokenizer*.json" "generation_config.json" "onnx/model_${DTYPE}*" \
    --local-dir "$MODEL_DIR"
else
  echo "huggingface-cli not found. Install: pip install -U 'huggingface_hub[cli]'" >&2
  exit 1
fi

echo "==> 3/3 check GitHub 100MB/file limit (Pages won't serve LFS)"
BIG=$(find "$MODEL_DIR" "$VENDOR" -type f -size +99M || true)
if [ -n "$BIG" ]; then
  echo "!! These files exceed 100MB and MUST be sharded before committing:" >&2
  echo "$BIG" >&2
  echo "   See assets/models/README.md (shard onnx external-data, or use WebLLM/MLC)." >&2
fi
echo "Done. Verify in a WebGPU browser, then commit assets/vendor/transformers + assets/models."

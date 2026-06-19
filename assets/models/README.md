# assets/models/ — 抽象生成モデル（自前ホスト）

Ask の「🧠 抽象生成（実験）」は、検索した根拠に基づいて**ブラウザ内のLLM**が
日本語の回答を生成します。**外部AI APIは使いません**（推論は端末内・APIキー不要）。
モデルの重みも外部CDNではなく **このリポジトリ（同一オリジン）から配信** します。

ここに重みを置くまで `NSCode.genllm.available()` は `false` を返し、Ask は従来どおり
**検索＋抽出**で回答します（＝重み未配置でもアプリは壊れません）。

## 置くもの（transformers.js / ONNX の場合）

```
assets/vendor/transformers/        # ライブラリ本体（ESM）＋ onnxruntime-web の .wasm
  transformers.min.js
  *.wasm  *.mjs
assets/models/qwen2.5-0.5b-instruct-onnx/
  config.json  tokenizer.json  tokenizer_config.json  generation_config.json
  onnx/model_q4f16.onnx           # 4bit 重み（dtype は genllm-engine.js の CFG.dtype と一致）
  onnx/model_q4f16.onnx_data*     # ← 外部データは 100MB 未満に分割すること（下記の制約）
```

`assets/js/genllm-engine.js` の `CFG.modelId` / `CFG.dtype` をフォルダ名・量子化に合わせます。

## ⚠️ GitHub Pages のサイズ制約（重要）

- **1ファイル 100MB 上限**（超えると push 自体が拒否）。Git LFS は **Pages が配信しない**ので不可。
- リポジトリ全体は 1GB 程度が目安（現状の `.git` は約140MB）。

0.5B/4bit でも重みは合計 ~300MB になり、単一の `*.onnx_data` は 100MB を超えがちです。
**必ず 100MB 未満のシャードに分割**してください。分割が難しい場合は、自然に ~30–100MB へ
シャードされる **WebLLM(MLC)** 形式の方が Pages 配信に向きます（その場合は genllm-engine.js を
MLC API に差し替え。WebGPU 専用・非対応端末は抽出にフォールバック）。

## 取得手順（ネットワーク可の環境で）

`scripts/fetch-genllm-model.sh` を参照。要点:

```bash
# 1) ライブラリを vendoring（@huggingface/transformers の dist を自前ホスト）
npm i @huggingface/transformers
cp -r node_modules/@huggingface/transformers/dist/* assets/vendor/transformers/

# 2) モデル（transformers.js 互換 ONNX）を取得
#    例: onnx-community/Qwen2.5-0.5B-Instruct（q4f16）
huggingface-cli download onnx-community/Qwen2.5-0.5B-Instruct \
  --include "config.json" "tokenizer*.json" "generation_config.json" "onnx/model_q4f16*" \
  --local-dir assets/models/qwen2.5-0.5b-instruct-onnx

# 3) onnx_data が 100MB を超える場合はシャード分割（split + onnx external-data 参照を更新）
# 4) commit & push（巨大バイナリのため初回は時間がかかります）
```

ライセンス注意: 同梱するモデルのライセンス（例: Qwen は Apache-2.0 系）をリポジトリに明記すること。

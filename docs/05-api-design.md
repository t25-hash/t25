# 05. API設計

NSCode バックエンド API（REST）の設計です。雛形フェーズではフロントは
`localStorage` モックで動作しますが、`assets/js/api.js` のインタフェースを
本 API と一致させ、実装差し替えだけで本番接続できるようにします。

## 1. 基本方針

- ベース URL: `/api/v1`
- 認証: Bearer トークン（`Authorization: Bearer <token>`）。雛形は無し（ローカル単一ユーザ）。
- 形式: JSON（`Content-Type: application/json`）。
- エラー: 下記共通フォーマット。
- LLM/Embedding 等の生成系は **サーバ側でプロバイダ（Claude API 等）を呼ぶ**。
  API キーをフロントに置かない。

### エラーフォーマット
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
```
ステータス: 400 / 401 / 403 / 404 / 409 / 422 / 429 / 500。

## 2. エンドポイント一覧

### 2.1 学習進捗
| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/progress` | 全トピックの進捗取得 |
| GET | `/progress/{topicId}` | 個別取得 |
| PUT | `/progress/{topicId}` | 進捗更新 `{status, percent}` |

### 2.2 Academy
| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/categories` | カテゴリ一覧 |
| GET | `/categories/{id}/topics` | トピック一覧 |
| GET | `/topics/{id}` | トピック本文 |

### 2.3 Playground / 生成系
| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/playground/llm` | LLM 実行（`{model, system, prompt, temperature, topK, topP}`）。比較は `runs[]` |
| POST | `/playground/prompt/evaluate` | プロンプト評価 |
| POST | `/playground/prompt/improve` | プロンプト改善提案 |

`POST /playground/llm` レスポンス例:
```json
{ "id": "...", "model": "claude-opus-4-8",
  "output": "...", "usage": { "input_tokens": 12, "output_tokens": 210 },
  "latency_ms": 840 }
```

### 2.4 Embedding Lab
| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/embedding/tokenize` | トークン分解 → `{tokens[], ids[]}` |
| POST | `/embedding/embed` | 埋め込み生成 → `{vector[], dim, model}` |
| POST | `/embedding/similarity` | 類似度 `{cosine, euclidean, dot}` |
| POST | `/embedding/cluster` | 次元削減 `{method: pca\|umap, dims: 2\|3}` → 座標 |

### 2.5 RAG Lab
| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/rag/chunk` | `{text, size, overlap, separator}` → `chunks[]` |
| POST | `/rag/retrieve` | `{query, topK, threshold, mmr}` → `hits[]` |
| POST | `/rag/rerank` | `{query, hits[]}` → `{before[], after[]}` |
| POST | `/rag/context` | `{hits[], template}` → `{prompt}` |
| POST | `/rag/analyze-hallucination` | `{answer, context}` → `{flags[]}` |

### 2.6 Tool Calling Lab
| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/tools` | ツールレジストリ一覧 |
| POST | `/tools/select` | `{goal, tools[]}` → `{selected, reason}` |
| POST | `/tools/execute` | `{tool, args}` → `{log, result}`（サンドボックス） |

### 2.7 MCP Lab
| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/mcp/connections` | 接続構造 |
| POST | `/mcp/servers` | MCP サーバ定義作成（Tool/Resource/Prompt） |
| GET | `/mcp/inspect/{sessionId}` | 通信ログ |

### 2.8 Agent / Memory / Multi-Agent
| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/agent/plan` | `{goal}` → `{steps[]}` |
| POST | `/agent/run` | Agent ループ実行（SSE ストリーム可） |
| POST | `/agent/reflect` | `{trace}` → `{improvements[]}` |
| GET | `/memory/{sessionId}` | Short/Long/Semantic/Episodic 取得 |
| POST | `/memory/compress` | 圧縮 |
| POST | `/multi-agent/run` | 複数エージェント実行（SSE: chat/tasks/consensus） |

### 2.9 Build Lab
| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/artifacts` | 成果物一覧 |
| POST | `/artifacts` | 作成 `{kind, name, spec}` |
| GET | `/artifacts/{id}` | 取得 |
| PUT | `/artifacts/{id}` | 更新（新バージョン作成） |
| POST | `/artifacts/{id}/export` | `{format: json\|yaml\|python\|langgraph}` → コード |

### 2.10 Evaluation Lab
| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/evaluation/runs` | `{target_kind, target_ref}` で評価実行 |
| GET | `/evaluation/runs/{id}` | 結果（metric_results） |

### 2.11 Research Lab
| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/papers` | PDF アップロード（multipart） |
| POST | `/papers/{id}/analyze` | 解析（要約/図解/再現） |
| GET | `/papers/{id}` | 解析結果 |

> **実装メモ（雛形）**: Research Lab は **完全クライアントサイドで実動**します。
> PDF の解析（テキスト抽出・ページ描画）は同梱の **pdf.js** で行い、要約/キーワードは
> オフラインの抽出型アルゴリズム（`research-engine.js`）で生成します。外部送信は一切ありません。
> 上記 API はサーバ側 **LLM 要約**（高品質）へ拡張する際の接続先です。フロントの
> `NSCode.api.savePaper / listPapers` は localStorage に保存します（docs/04 papers 参照）。

### 2.12 Challenge
| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/challenges` | レベル一覧（ロック状態含む） |
| GET | `/challenges/{id}` | 詳細 |
| POST | `/challenges/{id}/submit` | `{artifact_id}` 提出 → 採点 `{score, passed}` |

## 3. ストリーミング

- Agent / Multi-Agent 実行は **SSE**（`text/event-stream`）でループ過程を逐次配信。
- イベント種別: `plan`, `action`, `observation`, `reflection`, `retry`, `chat`, `consensus`, `done`。

## 4. フロント API レイヤ契約（`assets/js/api.js`）

雛形では同名メソッドが localStorage を読み書きする。本番では fetch 実装へ差し替え。

```js
NSCode.api = {
  getProgress(), putProgress(topicId, data),
  listArtifacts(), createArtifact(a), exportArtifact(id, format),
  listChallenges(), submitChallenge(id, artifactId),
  // 生成系（雛形ではダミー応答）
  runLLM(req), tokenize(text), embed(text), similarity(a, b),
  chunk(req), retrieve(req), planAgent(goal), ...
};
```

## 5. レート制限・コスト

- 生成系は 429 + `Retry-After`。フロントは指数バックオフ。
- `usage`（トークン数）と概算 `cost` をレスポンスに含め、Evaluation/Playground で表示。

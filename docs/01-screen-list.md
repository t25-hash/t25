# 01. 画面一覧

要件定義書 v1.0 §4〜§20 を画面単位に分解したものです。
NSCode は単一ページのダッシュボード型 SPA で、各「画面」はメインコンテンツ領域に
切り替え表示されるビューを指します。ルーティングはハッシュ (`#/path`) で行います。

## 1. 画面ID命名規則

- 形式: `SCR-<モジュール略号>-<連番>`
- ルート: `#/<module>` または `#/<module>/<sub>`

## 2. モジュール構成（トップナビ）

| グループ | モジュール | ルート | 略号 |
| --- | --- | --- | --- |
| Home | Dashboard | `#/dashboard` | DASH |
| Learn | Academy | `#/academy` | ACAD |
| Experiment | Playground | `#/playground` | PLAY |
| Simulator | Embedding Lab | `#/embedding` | EMB |
| Simulator | RAG Lab | `#/rag` | RAG |
| Simulator | Tool Calling Lab | `#/tools` | TOOL |
| Simulator | MCP Lab | `#/mcp` | MCP |
| Agent | Agent Lab | `#/agent` | AGENT |
| Agent | Memory Lab | `#/memory` | MEM |
| Agent | Multi-Agent Lab | `#/multi-agent` | MULTI |
| Architecture | Claude Code Explorer | `#/claude-code` | CCEX |
| Architecture | AI Coding Lab | `#/ai-coding` | AICODE |
| Build | Build Lab | `#/build` | BUILD |
| Quality | Evaluation Lab | `#/evaluation` | EVAL |
| Research | Research Lab | `#/research` | RES |
| Challenge | Challenge Mode | `#/challenge` | CHAL |

## 3. 画面一覧（詳細）

### 3.1 Dashboard (DASH)

| 画面ID | 画面名 | ルート | 目的 | 主要要素 |
| --- | --- | --- | --- | --- |
| SCR-DASH-01 | Dashboard | `#/dashboard` | 学習状況の可視化 | 学習進捗(LLM/Prompt/Embedding/RAG/Agent/MultiAgent)、現在学習中、推奨次ステップ、成果物一覧 |

### 3.2 Academy (ACAD)

理論学習。カテゴリ → トピックの 2 階層。

| 画面ID | 画面名 | ルート | 主要要素 |
| --- | --- | --- | --- |
| SCR-ACAD-01 | Academy トップ | `#/academy` | カテゴリ一覧（LLM / Prompt Engineering / Embedding / RAG / MCP / Agent / Multi-Agent） |
| SCR-ACAD-02 | カテゴリ詳細 | `#/academy/:category` | トピック一覧、進捗 |
| SCR-ACAD-03 | トピック詳細 | `#/academy/:category/:topic` | 本文、図解、関連 Lab へのリンク |

カテゴリ別トピック:
- **LLM**: Token / Tokenizer / Vocabulary / Embedding / Transformer / Attention / Decoder / Reasoning / Inference / Temperature / TopK / TopP
- **Prompt Engineering**: Zero Shot / Few Shot / CoT / ReAct / Reflection / Self Critique
- **Embedding**: Vector / Cos Similarity / Distance / Semantic Search
- **RAG**: Chunk / Embedding / Retrieval / ReRank / Context Injection
- **MCP**: Client / Server / Protocol / Tool Exposure
- **Agent**: Planning / Action / Observation / Reflection / Retry
- **Multi-Agent**: Manager / Worker / Coordinator / Consensus

### 3.3 Playground (PLAY)

| 画面ID | 画面名 | ルート | 主要要素 |
| --- | --- | --- | --- |
| SCR-PLAY-01 | LLM Playground | `#/playground/llm` | Prompt入力 / Model選択 / Temperature変更 / System Prompt変更 / 比較実行 |
| SCR-PLAY-02 | Prompt Playground | `#/playground/prompt` | Prompt比較 / Prompt評価 / Prompt改善 |

### 3.4 Embedding Lab (EMB)

| 画面ID | 画面名 | ルート | 主要要素 |
| --- | --- | --- | --- |
| SCR-EMB-01 | Token Visualizer | `#/embedding/token` | 入力文表示 → Token分解 → Token ID表示 |
| SCR-EMB-02 | Embedding Viewer | `#/embedding/vector` | ベクトル / 次元数 / モデル |
| SCR-EMB-03 | Similarity Viewer | `#/embedding/similarity` | Cos Similarity / Euclidean / Dot Product |
| SCR-EMB-04 | Cluster Viewer | `#/embedding/cluster` | 2D / 3D / PCA / UMAP |

### 3.5 RAG Lab (RAG)

| 画面ID | 画面名 | ルート | 主要要素 |
| --- | --- | --- | --- |
| SCR-RAG-01 | Chunk Simulator | `#/rag/chunk` | Chunk Size / Overlap / Separator |
| SCR-RAG-02 | Retrieval Simulator | `#/rag/retrieval` | TopK / Threshold / MMR |
| SCR-RAG-03 | ReRanking Simulator | `#/rag/rerank` | Before / After 比較 |
| SCR-RAG-04 | Context Builder | `#/rag/context` | 検索結果確認 / プロンプト確認 |
| SCR-RAG-05 | Hallucination Viewer | `#/rag/hallucination` | 誤回答解析 |

### 3.6 Tool Calling Lab (TOOL)

| 画面ID | 画面名 | ルート | 主要要素 |
| --- | --- | --- | --- |
| SCR-TOOL-01 | Tool Registry | `#/tools/registry` | Search / ReadFile / WriteFile / Terminal / Browser / Database |
| SCR-TOOL-02 | Tool Selection Viewer | `#/tools/selection` | 選択理由表示 |
| SCR-TOOL-03 | Tool Execution Viewer | `#/tools/execution` | 実行ログ表示 |

### 3.7 MCP Lab (MCP)

| 画面ID | 画面名 | ルート | 主要要素 |
| --- | --- | --- | --- |
| SCR-MCP-01 | MCP Explorer | `#/mcp/explorer` | 接続構造表示 |
| SCR-MCP-02 | MCP Server Builder | `#/mcp/builder` | Tool / Resource / Prompt 作成 |
| SCR-MCP-03 | MCP Inspector | `#/mcp/inspector` | 通信内容表示 |

### 3.8 Agent Lab (AGENT)

| 画面ID | 画面名 | ルート | 主要要素 |
| --- | --- | --- | --- |
| SCR-AGENT-01 | Agent Loop Viewer | `#/agent/loop` | Goal / Plan / Action / Observation / Reflection / Retry |
| SCR-AGENT-02 | Planner Simulator | `#/agent/planner` | 計画生成 |
| SCR-AGENT-03 | Reflection Simulator | `#/agent/reflection` | 改善提案生成 |
| SCR-AGENT-04 | Retry Simulator | `#/agent/retry` | 再実行確認 |

### 3.9 Memory Lab (MEM)

| 画面ID | 画面名 | ルート | 主要要素 |
| --- | --- | --- | --- |
| SCR-MEM-01 | Memory Viewer | `#/memory/viewer` | Short / Long / Semantic / Episodic |
| SCR-MEM-02 | Compression Viewer | `#/memory/compression` | 圧縮過程 |
| SCR-MEM-03 | Summary Viewer | `#/memory/summary` | 要約結果 |
| SCR-MEM-04 | Recall Viewer | `#/memory/recall` | 想起結果 |

### 3.10 Multi-Agent Lab (MULTI)

| 画面ID | 画面名 | ルート | 主要要素 |
| --- | --- | --- | --- |
| SCR-MULTI-01 | Agent Chat Viewer | `#/multi-agent/chat` | 会話可視化（Manager/Planner/Researcher/Coder/Reviewer/Tester） |
| SCR-MULTI-02 | Task Distribution Viewer | `#/multi-agent/tasks` | 担当表示 |
| SCR-MULTI-03 | Consensus Viewer | `#/multi-agent/consensus` | 合意形成表示 |

### 3.11 Claude Code Explorer (CCEX)

| 画面ID | 画面名 | ルート | 主要要素 |
| --- | --- | --- | --- |
| SCR-CCEX-01 | Architecture Viewer | `#/claude-code/architecture` | Context/Permission/Tool/Memory/Planning/Reflection/Retry/Recovery/Checkpoint/SubAgent |
| SCR-CCEX-02 | Execution Viewer | `#/claude-code/execution` | 実行過程 |
| SCR-CCEX-03 | Session Viewer | `#/claude-code/session` | セッション構造 |
| SCR-CCEX-04 | Tool Viewer | `#/claude-code/tool` | ツール一覧 |
| SCR-CCEX-05 | Memory Viewer | `#/claude-code/memory` | メモリ構造 |

### 3.12 AI Coding Lab (AICODE)

| 画面ID | 画面名 | ルート | 主要要素 |
| --- | --- | --- | --- |
| SCR-AICODE-01 | 比較マトリクス | `#/ai-coding` | 比較対象(Claude Code/Cursor/OpenHands/Devin/Cline/RooCode/OpenAI Codex) × 比較項目(Architecture/Memory/Tool/Context/Agent/MultiAgent/Cost/Performance) |

### 3.13 Build Lab (BUILD)

| 画面ID | 画面名 | ルート | 主要要素 |
| --- | --- | --- | --- |
| SCR-BUILD-01 | Build Lab トップ | `#/build` | Builder 選択 |
| SCR-BUILD-02 | RAG Builder | `#/build/rag` | 構成編集 → 出力(JSON/YAML/Python/LangGraph) |
| SCR-BUILD-03 | Agent Builder | `#/build/agent` | 同上 |
| SCR-BUILD-04 | MultiAgent Builder | `#/build/multi-agent` | 同上 |
| SCR-BUILD-05 | MCP Builder | `#/build/mcp` | 同上 |
| SCR-BUILD-06 | Workflow Builder | `#/build/workflow` | 同上 |

### 3.14 Evaluation Lab (EVAL)

| 画面ID | 画面名 | ルート | 主要要素 |
| --- | --- | --- | --- |
| SCR-EVAL-01 | Evaluation Lab | `#/evaluation` | 評価対象(RAG/Agent/Prompt/Tool) × 指標(Accuracy/Recall/Precision/Latency/Cost/Hallucination) |

### 3.15 Research Lab (RES)

| 画面ID | 画面名 | ルート | 主要要素 |
| --- | --- | --- | --- |
| SCR-RES-01 | Research Lab | `#/research` | 論文アップロード / PDF解析 / 要約 / 図解 / 再現実験 |

### 3.16 Challenge Mode (CHAL)

| 画面ID | 画面名 | ルート | 主要要素 |
| --- | --- | --- | --- |
| SCR-CHAL-01 | Challenge 一覧 | `#/challenge` | Level 1〜7 一覧 |
| SCR-CHAL-02 | Challenge 詳細 | `#/challenge/:level` | 課題説明 / 提出 / 採点 |

Challenge レベル: L1 RAG構築 / L2 Agent構築 / L3 MCP構築 / L4 Multi-Agent構築 / L5 Claude Code Mini構築 / L6 設計書からシステム生成 / L7 自己改善Agent構築

## 4. 共通画面

| 画面ID | 画面名 | 説明 |
| --- | --- | --- |
| SCR-COM-404 | Not Found | 未定義ルートのフォールバック |
| SCR-COM-SET | Settings | テーマ / モデル既定値 / API キー設定（将来） |

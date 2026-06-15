# 04. DB設計

NSCode の永続化要件を論理データモデルとして定義します。
雛形（本リポジトリ）では `localStorage` をモックストアとして使用し、
将来のバックエンド（例: PostgreSQL）導入時に同じ論理モデルを移行できる設計とします。

## 1. データストア方針

| フェーズ | ストア | 用途 |
| --- | --- | --- |
| 雛形 | `localStorage`（キー: `nscode.*`） | 進捗・成果物・設定のローカル保持 |
| 本番 | RDB（PostgreSQL 想定） | ユーザ/進捗/成果物/評価/論文 等の永続化 |
| 本番（ベクトル） | pgvector / 専用ベクトルDB | Embedding/RAG 実験データ |

## 2. ER 概要

```
User 1──* LearningProgress *──1 Topic *──1 Category
User 1──* Artifact 1──* EvaluationRun *──* MetricResult
User 1──* ChallengeAttempt *──1 Challenge
User 1──* PlaygroundSession
User 1──* LabState
Paper 1──* PaperAnalysis
Artifact 1──* ArtifactVersion
```

## 3. テーブル定義

### users
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | UUID | PK | ユーザID |
| email | TEXT | UNIQUE, NOT NULL | メール |
| display_name | TEXT | | 表示名 |
| level | TEXT | CHECK(beginner/intermediate/advanced/expert) | 習熟レベル |
| theme | TEXT | DEFAULT 'dark' | UIテーマ |
| created_at | TIMESTAMPTZ | DEFAULT now() | |

### categories
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | TEXT | PK | 例: `llm`, `rag` |
| name | TEXT | NOT NULL | 表示名 |
| order_no | INT | | 表示順 |

### topics
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | TEXT | PK | 例: `llm.attention` |
| category_id | TEXT | FK→categories | |
| name | TEXT | NOT NULL | |
| order_no | INT | | |
| body_ref | TEXT | | 本文コンテンツ参照 |

### learning_progress
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | UUID | PK | |
| user_id | UUID | FK→users | |
| topic_id | TEXT | FK→topics | |
| status | TEXT | CHECK(not_started/in_progress/done) | |
| percent | INT | DEFAULT 0 | 0–100 |
| updated_at | TIMESTAMPTZ | | |
| | | UNIQUE(user_id, topic_id) | |

### artifacts（成果物：Build Lab 出力）
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | UUID | PK | |
| user_id | UUID | FK→users | |
| kind | TEXT | CHECK(rag/agent/multi_agent/mcp/workflow) | 種別 |
| name | TEXT | NOT NULL | |
| spec | JSONB | NOT NULL | 構成定義 |
| created_at | TIMESTAMPTZ | DEFAULT now() | |

### artifact_versions
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | UUID | PK | |
| artifact_id | UUID | FK→artifacts | |
| version | INT | NOT NULL | |
| spec | JSONB | NOT NULL | スナップショット |
| export_format | TEXT | CHECK(json/yaml/python/langgraph) | 出力形式 |
| created_at | TIMESTAMPTZ | | |

### evaluation_runs
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | UUID | PK | |
| user_id | UUID | FK→users | |
| target_kind | TEXT | CHECK(rag/agent/prompt/tool) | 評価対象 |
| target_ref | UUID | | artifact 等への参照 |
| created_at | TIMESTAMPTZ | | |

### metric_results
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | UUID | PK | |
| run_id | UUID | FK→evaluation_runs | |
| metric | TEXT | CHECK(accuracy/recall/precision/latency/cost/hallucination) | |
| value | NUMERIC | | |

### challenges
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | TEXT | PK | 例: `L1` |
| level | INT | 1–7 | |
| title | TEXT | NOT NULL | 例: RAG構築 |
| requires | TEXT | FK→challenges (nullable) | 前提レベル |

### challenge_attempts
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | UUID | PK | |
| user_id | UUID | FK→users | |
| challenge_id | TEXT | FK→challenges | |
| status | TEXT | CHECK(locked/open/submitted/passed/failed) | |
| score | INT | | |
| submitted_artifact | UUID | FK→artifacts (nullable) | |
| updated_at | TIMESTAMPTZ | | |

### playground_sessions
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | UUID | PK | |
| user_id | UUID | FK→users | |
| kind | TEXT | CHECK(llm/prompt) | |
| input | JSONB | | prompt/system/params |
| output | JSONB | | 応答（比較は配列） |
| created_at | TIMESTAMPTZ | | |

### lab_states（各 Lab のパラメータ復元用）
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| user_id | UUID | FK→users | |
| route | TEXT | | 例 `#/rag/chunk` |
| state | JSONB | | スライダー値等 |
| updated_at | TIMESTAMPTZ | | |
| | | PK(user_id, route) | |

### papers / paper_analyses（Research Lab）
**papers**: id(PK), user_id(FK), title, file_ref, uploaded_at
**paper_analyses**: id(PK), paper_id(FK), summary(TEXT), figures(JSONB), reproduction(JSONB), created_at

### embedding_items（Embedding/RAG 実験、ベクトル）
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | UUID | PK | |
| user_id | UUID | FK→users | |
| source_text | TEXT | | |
| model | TEXT | | 例 voyage/embedding model |
| vector | VECTOR(dim) | pgvector | 埋め込み |
| dim | INT | | 次元数 |

## 4. localStorage マッピング（雛形）

| RDB テーブル | localStorage キー | 形式 |
| --- | --- | --- |
| learning_progress | `nscode.progress` | `{ [topicId]: { status, percent } }` |
| artifacts | `nscode.artifacts` | `Artifact[]` |
| challenge_attempts | `nscode.challenges` | `{ [challengeId]: { status, score } }` |
| lab_states | `nscode.lab.<route>` | `state` オブジェクト |
| users(theme) | `nscode.theme` | `'dark' \| 'light'` |

## 5. インデックス / 注意

- `learning_progress(user_id)`, `artifacts(user_id, kind)`, `metric_results(run_id)` に索引。
- `embedding_items.vector` は pgvector の ivfflat/hnsw 索引（コサイン）。
- すべて `user_id` でスコープ。マルチユーザ前提（雛形は単一ローカルユーザ）。

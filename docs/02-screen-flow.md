# 02. 画面遷移

NSCode は単一ページ (SPA) であり、画面遷移はページ全体のリロードではなく
**ハッシュルーティング** (`location.hash`) によるビュー切り替えで実現します。

## 1. ナビゲーション原則

1. **常設サイドバー** — 全モジュールへ 1 クリックで到達可能（PC/タブレット）。
2. **モバイル** — サイドバーはドロワー化（ハンバーガーで開閉）。
3. **学習導線** — Dashboard の「推奨次ステップ」「現在学習中」から各 Lab へ誘導。
4. **横断リンク** — Academy のトピックから対応する Lab へ、Build から Evaluation へ等、関連画面を相互リンク。

## 2. 全体遷移図

```
                         ┌──────────────┐
                         │  Dashboard   │  (#/dashboard) ← 起動時の初期表示
                         └──────┬───────┘
        推奨次ステップ / 成果物一覧 │ サイドバー（全画面から遷移可）
   ┌───────────┬───────────┬─────┼───────────┬───────────┬───────────┐
   ▼           ▼           ▼     ▼           ▼           ▼           ▼
Academy    Playground  Simulator Agent群   Architecture Build      Challenge
                                                          │
                                                          ▼
                                                      Evaluation / Research
```

## 3. グループ別フロー

### 3.1 学習フロー（理論 → 体験）

```
Academy(カテゴリ) → Academy(トピック) ──"関連Labで試す"──▶ 対応Lab
        ▲                                                   │
        └───────────────"理論に戻る"────────────────────────┘
```

例: `Academy/RAG/Chunk` → `RAG Lab / Chunk Simulator`

### 3.2 Simulator グループ内遷移

各 Lab はタブ（サブビュー）で内部画面を切り替える。

```
Embedding Lab:  Token Visualizer ↔ Embedding Viewer ↔ Similarity Viewer ↔ Cluster Viewer
RAG Lab:        Chunk → Retrieval → ReRank → Context Builder → Hallucination Viewer  (パイプライン順)
Tool Lab:       Tool Registry → Selection Viewer → Execution Viewer
MCP Lab:        MCP Explorer ↔ Server Builder ↔ Inspector
```

RAG Lab はパイプラインを意識し、左→右の段階遷移を推奨（ステップインジケータ付き）。

### 3.3 Agent グループ内遷移

```
Agent Lab:   Loop Viewer → Planner → Reflection → Retry
Memory Lab:  Memory Viewer → Compression → Summary → Recall
Multi-Agent: Chat Viewer ↔ Task Distribution ↔ Consensus
```

### 3.4 構築 → 評価フロー

```
Build Lab(各Builder) ──"成果物を生成(JSON/YAML/Python/LangGraph)"──▶ 成果物一覧(Dashboard)
        │
        └──"評価する"──▶ Evaluation Lab ──"改善点"──▶ Build Lab(再編集)
```

### 3.5 Challenge フロー

```
Challenge一覧 → Challenge詳細(Level N) → 関連Lab/Builderで作業 → 提出 → 採点
        ▲                                                              │
        └──────────────"次のレベルへ" / "再挑戦"──────────────────────┘
```

Challenge は L1→L7 の段階解放（前段クリアで次段アンロック）を想定。

## 4. 遷移トリガ一覧

| 起点 | トリガ | 遷移先 |
| --- | --- | --- |
| 全画面 | サイドバー項目クリック | 該当モジュールのトップ |
| Dashboard | 「現在学習中」カード | 中断箇所のビュー |
| Dashboard | 「推奨次ステップ」 | 次トピック / Lab |
| Dashboard | 成果物カード | Build Lab の該当 Builder |
| Academy トピック | 「Labで試す」 | 対応 Simulator/Lab |
| Build Lab | 「評価」 | Evaluation Lab |
| Evaluation | 「改善」 | Build Lab |
| Challenge詳細 | 「作る」 | 対応 Builder |
| 未定義 hash | 自動 | 404 → Dashboard 誘導 |

## 5. URL 設計と状態

- 状態は可能な限り URL（hash + query）へ保持し、リロード・共有で復元可能にする。
- 例: `#/playground/llm?model=claude-opus-4-8&temp=0.7`
- 例: `#/rag/chunk?size=512&overlap=64`
- Lab 内タブは `#/<module>/<sub>` で表現（サブが無い場合は既定サブへリダイレクト）。

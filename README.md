# NSCode

**AI Agent Engineering Learning Platform**

NSCode は「AIを利用する人」ではなく「**AIシステムを設計・構築・改善できる人材**」を育成する
学習プラットフォームです。教材ではなく **シミュレータ** として、すべての概念を
「見る → 触る → 試す → 作る → 改善する」で学習できることを目指します。

```
LLM → Transformer → Embedding → Prompt Engineering → RAG → Tool Calling
→ MCP → Agent → Memory → Multi-Agent → Claude Code Architecture → AI Software Engineering
```

## このリポジトリの内容

要件定義書 v1.0 を実装可能なレベルへ落とし込んだ **設計書** と、
プレーンな HTML/CSS/JS による **画面雛形 (SPA スケルトン)** を含みます。

> ✅ **全 Lab がブラウザ内だけで実動します**（外部送信なし・ビルド不要）。生成系（LLM 応答 etc.）
> は正直に「シミュレーション/ヒューリスティック」と明示し、実モデル接続は docs/05 に口を用意。
>
> | Lab | 実装内容 |
> | --- | --- |
> | **Academy** | 全トピックに解説テキスト + 関連 Lab リンク |
> | **Playground** | LLM: 実トークン数 + リクエスト構造 + モデル別コスト試算（応答は擬似）/ Prompt: 6観点ヒューリスティック評価 + 改善案 |
> | **Embedding Lab** | Token 可視化 / 埋め込み(hashing trick) / 類似度(cos·euclid·dot) / PCA 2D 散布図 |
> | **RAG Lab** | Chunk → Retrieval(TF-IDF) → ReRank(MMR) → Context → Hallucination の5段連動 |
> | **Tool Calling Lab** | ツールレジストリ / 選択理由ランキング / 決定論的な実行ログ |
> | **MCP Lab** | 接続図 / サーバービルダー(config 生成) / JSON-RPC ハンドシェイク(模擬) |
> | **Agent Lab** | ReAct ループ可視化 / 計画生成 / リフレクション / リトライ(指数バックオフ) |
> | **Memory Lab** | 4種メモリ / 圧縮 / 要約 / 想起(コサイン類似度) |
> | **Multi-Agent Lab** | 役割別チャット / タスク分配 / 合意形成(投票) |
> | **Claude Code Explorer** | アーキ図(AI 1.6% vs infra 98.4%) / while-loop 実行ステップ / 権限ゲート / セッション / メモリ / **Mini Harness**（[`examples/minimal_claude_code.py`](examples/minimal_claude_code.py) の JS 実行版） |
> | **AI Coding Lab** | ツール比較マトリクス(編集可・参考) |
> | **Build Lab** | RAG/Agent/MultiAgent/MCP/Workflow を JSON/YAML/Python/LangGraph 生成 → 成果物保存 |
> | **Evaluation Lab** | ラベル付きデータで Precision@k/Recall@k を実測（他は推定明示） |
> | **Research Lab** | PDF 解析（同梱 [pdf.js](https://github.com/mozilla/pdf.js) Apache-2.0）/ 図解 / TextRank 要約 / TF-IDF キーワード / **抽出型 QA**（RAG連携）/ 文書内検索 |

| 種別 | 場所 | 内容 |
| --- | --- | --- |
| 設計書 | [`docs/`](docs/) | 画面一覧・画面遷移・コンポーネント設計・DB設計・API設計・ディレクトリ構成 |
| 画面雛形 | [`index.html`](index.html) | ダッシュボード型 SPA の骨格（全モジュールの空ページ） |
| スタイル | [`assets/css/main.css`](assets/css/main.css) | Dark Mode / レスポンシブ |
| アプリ | [`assets/js/`](assets/js/) | ハッシュルーティング + 各画面のビュー |

## スマホ / どこからでも（GitHub Pages）

静的サイトなので **GitHub Pages** でそのまま公開でき、iPhone の Safari からも動きます。
本リポジトリには Pages デプロイ用ワークフロー（[`.github/workflows/pages.yml`](.github/workflows/pages.yml)）を同梱しています。

1. リポジトリの **Settings → Pages → Build and deployment → Source** を **「GitHub Actions」** に設定（初回のみ・スマホの GitHub アプリ/ブラウザからも可）。
2. 対象ブランチへ push するとワークフローが走り、自動デプロイされます。
3. 公開 URL: **https://t25-hash.github.io/t25/**

> `_lab.js` が Jekyll に無視されないよう `.nojekyll` を同梱済み。全パスは相対なのでサブパス配信でも動作します。

## 動かし方（ローカル）

ビルド不要です。`index.html` をブラウザで直接開くだけで動作します。

```bash
# そのまま開く
open index.html              # macOS
xdg-open index.html          # Linux

# もしくは簡易サーバ経由（推奨）
python3 -m http.server 8000  # → http://localhost:8000
```

> 💡 Research Lab の PDF 解析は Web Worker を使うため、`file://` で直接開くと
> 一部ブラウザでワーカーがブロックされることがあります（自動でフォールバックします）。
> 確実に動かすには上記の簡易サーバ経由で開いてください。

## 設計ドキュメント

1. [画面一覧](docs/01-screen-list.md)
2. [画面遷移](docs/02-screen-flow.md)
3. [コンポーネント設計](docs/03-component-design.md)
4. [DB設計](docs/04-database-design.md)
5. [API設計](docs/05-api-design.md)
6. [ディレクトリ構成](docs/06-directory-structure.md)

## 対象ユーザー

| レベル | 想定 |
| --- | --- |
| 初級 | ChatGPT 利用者 |
| 中級 | RAG 構築者 |
| 上級 | Agent 開発者 |
| Expert | Claude Code 級システム開発者 |

## 非機能要件（抜粋）

- UI: Single Page Dashboard / Dark Mode / Responsive / Mobile 対応
- パフォーマンス: 初期表示 3 秒以内
- 拡張性: Plugin 形式 / Module 追加可能
- 保守性: 機能ごと独立モジュール

---

要件定義書 v1.0 準拠。本リポジトリは設計フェーズの成果物です。

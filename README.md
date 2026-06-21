# Ask

**AI Agent Engineering Learning Platform**
Ask は「AIを利用する人」ではなく「**AIシステムを設計・構築・改善できる人材**」を育成する
学習プラットフォームです。教材ではなく **シミュレータ** として、すべての概念を
「見る → 触る → 試す → 作る → 改善する」で学習できることを目指します。

```
LLM → Transformer → Embedding → Prompt Engineering → RAG → Tool Calling
→ MCP → Agent → Memory → Multi-Agent → Claude Code Architecture → AI Software Engineering
```

## このリポジトリの内容

要件定義書 v1.0 を実装可能なレベルへ落とし込んだ **設計書** と、
プレーンな HTML/CSS/JS による **画面雛形 (SPA スケルトン)** を含みます。

> ✅ **全 Lab がブラウザ内だけで実動します**（外部送信なし・ビルド不要・**外部 AI API 一切不使用**）。
> 生成系（LLM 応答 etc.）は外部プロバイダ（Claude / OpenAI 等）の API を呼ばず、同梱の
> ブラウザ内エンジン（SML＋RAG＋小規模ニューラル）だけで完結します。API キーは不要です。
>
> サイドバーは **Ask とその処理の可視化** に集約しています（静的な解説・テンプレ生成・Ask 非経路のデモは撤去）。
>
> | Lab | 役割（Ask 処理のどの段か） | 実装内容 |
> | --- | --- | --- |
> | **Ask (RAG)** ⭐ | 本体 | 文書追加（貼付 / .txt・.md・.pdf）→ 質問 → **根拠に基づく回答＋出典**。検索=**BM25（Okapi・実物）**＋同義語/多義語デブースト/意図分類。回答=抽出＋**🧠 抽象生成（自前SML・既定ON）**＋👍/👎学習。PC では右に **🗺️ ナレッジ／計算式マップ**（ノード選択で Md 全文・式・表を回答表示／スマホは🗺️ボタンで全画面）。外部API不使用 |
> | **RAG Lab** | 検索 | Chunk → Retrieval(BM25/TF-IDF) → ReRank(MMR) → Context → Hallucination の5段連動 |
> | **Embedding Lab** | ベクトル化 | Token 可視化 / 埋め込み(hashing trick) / 類似度(cos·euclid·dot) / PCA 2D 散布図 |
> | **Neural Lab** | 学習・重み | Ask と同じ極小ニューラル（埋め込み→tanh→softmax）を勾配降下学習・観察（loss/重み/次トークン確率） |
> | **Memory Lab** | 想起・要約 | 4種メモリ / 圧縮 / 要約 / 想起(コサイン類似度)。Ask の要約メモリと同じ処理 |
> | **Grammar-agent** | 文法整形 | 抽出回答を意味単位(SML)へ分解→自然文へ再構成（Ask の回答整形そのもの） |
> | **Agent Lab** | エージェントのループ | 検索を「調べる行動」とみなす ReAct ループ可視化 / 計画 / リフレクション / リトライ |
> | **PDF抽出** | 取り込み | PDF→本文抽出・クレンジング（NFKC・ヘッダ/フッタ除去）→ **Ask に学習**。外部送信なし |
> | **Research Lab** | 取り込み | PDF 解析（同梱 [pdf.js](https://github.com/mozilla/pdf.js) Apache-2.0）/ TextRank 要約 / TF-IDF キーワード / **抽出型 QA（RAG連携）** / 文書内検索 |
> | **Evaluation Lab** | 評価 | ラベル付きデータで Ask の**検索品質を実測**（Precision@k / Recall@k） |

| 種別 | 場所 | 内容 |
| --- | --- | --- |
| 設計書 | [`docs/`](docs/) | 画面一覧・画面遷移・コンポーネント設計・DB設計・API設計・ディレクトリ構成 |
| 画面雛形 | [`index.html`](index.html) | ダッシュボード型 SPA の骨格（全モジュールの空ページ） |
| スタイル | [`assets/css/main.css`](assets/css/main.css) | Dark Mode / レスポンシブ |
| アプリ | [`assets/js/`](assets/js/) | ハッシュルーティング + 各画面のビュー |
| 知識ベース | [`assets/kb/`](assets/kb/) | 機械工学（散文）KB：文書 + BM25索引。Ask で検索→生成 |
| 計算式・表DB | [`assets/calc/`](assets/calc/) | KBとは別の **計算式・表 DB**（便覧の数式/表を抽出・クレンジング、章単位の文書 + 専用BM25索引）。Ask の「対象」で選択して質問可。再生成は [`scripts/build-calc-db.py`](scripts/build-calc-db.py) |

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

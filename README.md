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

> ✅ **Research Lab / RAG Lab は実動します**（ともにブラウザ内のみ・外部送信なし）。
> - **Research Lab**: PDF をドロップ → テキスト抽出・ページ図解・抽出型要約・キーワード抽出。
>   PDF 解析は同梱の [pdf.js](https://github.com/mozilla/pdf.js)（Apache-2.0）。
> - **RAG Lab**: Chunk → Retrieval（TF-IDF コサイン）→ ReRank（MMR）→ Context Builder →
>   Hallucination 検出、の5段パイプラインがパラメータ連動で動きます。
> - **Embedding Lab**: Token 可視化 / 埋め込み（hashing trick）/ 類似度（cos/euclid/dot）/
>   PCA 2D クラスタ散布図が、実際の計算で動きます。

| 種別 | 場所 | 内容 |
| --- | --- | --- |
| 設計書 | [`docs/`](docs/) | 画面一覧・画面遷移・コンポーネント設計・DB設計・API設計・ディレクトリ構成 |
| 画面雛形 | [`index.html`](index.html) | ダッシュボード型 SPA の骨格（全モジュールの空ページ） |
| スタイル | [`assets/css/main.css`](assets/css/main.css) | Dark Mode / レスポンシブ |
| アプリ | [`assets/js/`](assets/js/) | ハッシュルーティング + 各画面のビュー |

## 動かし方

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

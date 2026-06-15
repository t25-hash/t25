# 06. ディレクトリ構成

技術方針「プレーン HTML/CSS/JS（ビルド不要）」に沿った構成です。
要件の「機能ごと独立モジュール / Plugin形式 / Module追加可能」を、
**ビューを 1 モジュール 1 ファイル**にすることで実現します。

## 1. 全体構成

```
t25/  (NSCode)
├── index.html                # App Shell（エントリポイント）
├── README.md
├── docs/                     # 設計書（本フォルダ）
│   ├── 01-screen-list.md
│   ├── 02-screen-flow.md
│   ├── 03-component-design.md
│   ├── 04-database-design.md
│   ├── 05-api-design.md
│   └── 06-directory-structure.md
├── assets/
│   ├── css/
│   │   └── main.css          # テーマ変数 / レイアウト / コンポーネント
│   ├── vendor/
│   │   └── pdfjs/            # pdf.js (legacy UMD) を同梱（オフライン動作）
│   │       ├── pdf.min.js
│   │       ├── pdf.worker.min.js
│   │       └── LICENSE       # Apache-2.0 (Mozilla)
│   └── js/
│       ├── core.js           # NSCode 名前空間 / registry / router / store
│       ├── components.js      # 共通UI（PageHeader, Card, Panel, Tabs, ...）
│       ├── nav.js            # サイドバー定義（グループ×モジュール）
│       ├── api.js            # API レイヤ（雛形=localStorage モック）
│       ├── research-engine.js # PDF解析(pdf.js遅延ロード) + オフライン要約/キーワード
│       ├── rag-engine.js      # RAGパイプライン(chunk/TF-IDF検索/MMR/ハルシネーション検出)
│       ├── app.js            # 起動（DOM結線 / 初期ルート）
│       └── views/            # 画面モジュール（1モジュール=1ファイル）
│           ├── dashboard.js
│           ├── academy.js
│           ├── playground.js
│           ├── embedding.js
│           ├── rag.js
│           ├── tools.js
│           ├── mcp.js
│           ├── agent.js
│           ├── memory.js
│           ├── multi-agent.js
│           ├── claude-code.js
│           ├── ai-coding.js
│           ├── build.js
│           ├── evaluation.js
│           ├── research.js
│           └── challenge.js
└── plugins/                  # 追加モジュール（任意・ビルド不要で増設）
    └── .gitkeep
```

## 2. スクリプト読み込み順（index.html）

依存順にプレーン `<script>` で読み込む（ES Modules 不使用 = `file://` でも動作）。

```
core.js → components.js → nav.js → api.js → views/*.js → app.js
```

- `core.js`: `window.NSCode` を定義し `registerView` / `navigate` / `store` を提供。
- `views/*.js`: 読み込み時に `NSCode.registerView({...})` で自己登録。
- `app.js`: 最後に DOM を結線し、現在の hash でルーティング開始。

## 3. モジュール追加手順（拡張性）

新しい Lab を足す場合:

1. `assets/js/views/<new>.js` を作成し `NSCode.registerView({ route, module, render })`。
2. `assets/js/nav.js` にナビ項目を 1 行追加。
3. `index.html` の views 読み込みリストに `<script>` を 1 行追加。

外部プラグインとして配布する場合:

1. `plugins/<name>.js` に `NSCode.use({ name, nav, views })` を記述。
2. `index.html` に `<script src="plugins/<name>.js">` を追加。

→ コア・他モジュールへの変更不要（疎結合）。

## 4. 命名規約

| 対象 | 規約 | 例 |
| --- | --- | --- |
| ビューファイル | モジュール名（kebab） | `multi-agent.js` |
| ルート | `#/<module>[/<sub>]` | `#/rag/chunk` |
| CSS クラス | BEM 風 / 接頭辞 `ns-` | `.ns-card`, `.ns-card__title` |
| CSS 変数 | `--<役割>` | `--bg`, `--accent` |
| store キー | `nscode.<領域>` | `nscode.progress` |

## 5. 将来のバックエンド配置（参考）

雛形は静的配信のみ。バックエンド導入時の想定:

```
server/
├── app/                      # API 実装（FastAPI 等）
│   ├── routers/              # docs/05 のエンドポイント群
│   ├── services/             # LLM/Embedding/RAG/Agent ロジック
│   └── models/               # DB モデル（docs/04 準拠）
├── migrations/
└── pyproject.toml
```

静的フロント (`/`) はそのまま、`/api/v1` をバックエンドへリバースプロキシ。

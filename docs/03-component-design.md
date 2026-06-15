# 03. コンポーネント設計

技術方針: **プレーン HTML/CSS/JS（ビルド不要）**。
ただし要件の「Plugin形式 / Module追加可能 / 機能ごと独立モジュール」を満たすため、
ビュー（画面）を **登録制レジストリ** で管理し、各モジュールを独立ファイルとして追加できる構造にします。

## 1. レイヤ構成

```
┌─────────────────────────────────────────────┐
│ App Shell（index.html）                       │
│  ├ Topbar（ロゴ / テーマ切替 / モバイルトグル）│
│  ├ Sidebar（ナビゲーション）                  │
│  └ Main（ビュー描画領域 <main id="view">）    │
├─────────────────────────────────────────────┤
│ Router（hashchange → view 解決）              │
├─────────────────────────────────────────────┤
│ View Registry（ルート → render() を登録）     │
├─────────────────────────────────────────────┤
│ UI Components（card / panel / tabs / metric…）│
└─────────────────────────────────────────────┘
```

## 2. 共通 UI コンポーネント

これらは「文字列を返す関数」または DOM 生成ヘルパとして実装（フレームワーク非依存）。

| コンポーネント | 役割 | 主なパラメータ |
| --- | --- | --- |
| `PageHeader` | 画面タイトル + 目的 + パンくず | title, subtitle, breadcrumb |
| `Card` | 汎用カード | title, body, footer |
| `Panel` | Lab の機能枠（プレースホルダ含む） | title, hint, children |
| `Tabs` | Lab 内サブビュー切替 | items[], activeId, baseRoute |
| `Metric` | 進捗/指標表示 | label, value, max, unit |
| `ProgressBar` | 学習進捗バー | percent |
| `Badge` | レベル/状態ラベル | text, variant |
| `EmptyState` | 未実装/データ無しの雛形表示 | icon, message |
| `KeyValueList` | ベクトル次元・設定値などの一覧 | rows[] |
| `CodeBlock` | 出力（JSON/YAML/Python）表示 | lang, code |
| `Toolbar` | パラメータ操作行（slider/select） | controls[] |

## 3. Topbar / Sidebar

### Topbar
- 左: ハンバーガー（モバイル時のみ表示）+ ロゴ「NSCode」
- 右: テーマ切替（Dark/Light、既定 Dark）、（将来）Settings

### Sidebar
- `docs/01-screen-list.md §2` のグループ構造をそのまま反映。
- グループ見出し + 項目リンク。現在ルートをハイライト。
- ナビ定義はデータ（配列）として `assets/js/nav.js` に集約 → モジュール追加はここへ1行追加。

## 4. ビュー（画面モジュール）コントラクト

各画面は以下の形でレジストリに登録する。これが「Module追加可能」の実体。

```js
// assets/js/views/<module>.js
NSCode.registerView({
  route: '#/rag/chunk',          // 一意なルート
  module: 'rag',                 // 所属モジュール（サイドバー紐付け）
  title: 'Chunk Simulator',
  purpose: 'チャンク分割パラメータの影響を体験する',
  // 任意: Lab 内タブ
  tabs: [ /* {id, label, route} */ ],
  render(ctx) {                  // ctx: { params, query, mount }
    return /* HTML 文字列 or DOM */;
  },
  onMount(ctx) { /* 任意: イベント結線 */ }
});
```

ルータは `route` 完全一致 → 前方一致（`:param` 対応）の順で解決し、
見つからなければ 404 ビューを描画する。

## 5. プラグイン機構

- `NSCode.use(plugin)` で外部モジュール群を一括登録可能にする。
- プラグインは `{ name, views: [], nav?: [] }` を返すオブジェクト。
- 読み込みは `index.html` に `<script src="plugins/xxx.js">` を追加するだけ（ビルド不要）。

```js
NSCode.use({
  name: 'my-extra-lab',
  nav: [{ group: 'Custom', label: 'My Lab', route: '#/my-lab' }],
  views: [{ route: '#/my-lab', module: 'my-lab', title: 'My Lab', render: () => '...' }]
});
```

## 6. 画面別コンポーネント割当（抜粋）

| 画面 | 使用コンポーネント |
| --- | --- |
| Dashboard | PageHeader, ProgressBar×6, Card（現在学習中/推奨/成果物）, Metric |
| Academy トップ | PageHeader, Card（カテゴリ）グリッド |
| LLM Playground | PageHeader, Toolbar（model/temp/system）, Panel（入出力）, CodeBlock |
| RAG Lab | PageHeader, Tabs, Toolbar, Panel, KeyValueList |
| Agent Loop Viewer | PageHeader, Panel（Goal→…→Retry のステップ表示） |
| Build Lab | PageHeader, Tabs, Panel（構成）, CodeBlock（出力） |
| Evaluation | PageHeader, Metric グリッド, Card |
| AI Coding Lab | PageHeader, 比較テーブル |
| Challenge | PageHeader, Card（Level）+ Badge |

## 7. 状態管理

- 軽量。グローバル `NSCode.store`（プレーンオブジェクト + `localStorage` 永続化）。
- 保持対象: テーマ、学習進捗、成果物一覧、Lab パラメータの直近値。
- API 連携前は localStorage をモックストアとして使用（→ `docs/05-api-design.md` 参照）。

## 8. スタイル方針

- CSS 変数でテーマ化（`--bg`, `--surface`, `--text`, `--accent` …）。`data-theme="dark|light"`。
- レイアウトは CSS Grid（shell）+ Flex（部品）。メディアクエリでモバイル対応。
- アクセシビリティ: フォーカスリング維持、コントラスト比 AA、`aria-current` でナビ現在地。

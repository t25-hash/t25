/* Per-page explanations, injected under each page title by core.renderCurrent.
 * Keyed by view.module. Plain author-controlled HTML (<b> only). */
(function (NSCode) {
  'use strict';
  NSCode.pageNotes = {
    ask:
      '自分の文書を入れて質問すると、Claude Code の手順どおり（検索 → 文脈で学習 → 生成）に答える教育ページ。関連チャンクを TF-IDF で検索し、その文脈で<b>ブラウザ内の極小LLM（n-gram・赤ちゃん級・API不要）</b>が<b>次トークン予測で回答を生成</b>します。生成過程（候補と確率）も表示。仕組みは「How To Answer」で詳しく解説。',
    howto:
      'Ask（RAG）がどう答えを作るか、そして LLM がどういう仕組みかを図解で説明する解説ページです。',
    generate:
      'プロンプトから <b>Excel(.xlsx) / Word(.doc) / Markdown / CSV</b> を生成してダウンロードするページ。「列: a,b,c」「N行」「# 見出し」「- 箇条書き」を解釈して表や文書を組み立てます。解釈は決定論的、<b>出力ファイルは本物</b>（Excel は SheetJS で実 .xlsx）。',
    academy:
      'AI の主要概念（LLM / Prompt / Embedding / RAG / MCP / Agent / Multi-Agent）をカテゴリ → トピックで学ぶ理論ページ。各トピックに短い解説と、対応する Lab への導線があります。',
    playground:
      'LLM を触って試す＋プロンプトの質を点検するページ。モデル・温度・プロンプトを設定すると、送信されるリクエスト構造と<b>トークン数（実カウント）</b>を表示します（応答は擬似）。下部ではプロンプトを6観点で評価し、改善案を提示します。',
    embedding:
      'テキストを数値ベクトルに変換する「埋め込み」を体験するページ。トークン分解 → ベクトル化 → 類似度（cos / euclid / dot）→ PCA で 2D 可視化。埋め込みは語彙ベースの hashing trick（学習済みニューラルではありません）。',
    rag:
      'RAG パイプラインを1ページで体験。入力文書 → チャンク分割 → TF-IDF 検索 → MMR 再ランク → コンテキスト構築 → ハルシネーション検出。パラメータを変えると全段が連動します。検索は本物、回答評価は語彙ベースの簡易版。',
    tools:
      'LLM が外部機能を呼ぶ「ツール利用」の仕組みを体験。ツール一覧 → ゴールに対する選択理由 → 実行ログ。実行は決定論的なシミュレーションです。',
    mcp:
      'ツールやリソースを標準プロトコルで公開する MCP を体験。接続図 → サーバー定義（ツール / リソース / プロンプト）→ 生成された config → JSON-RPC ハンドシェイク（模擬）。',
    agent:
      '観察 → 思考 → 行動 のループで動く Agent を体験。ゴール入力 → 計画 → ループ実行 → 振り返り → リトライ。LLM 非使用の決定論的シミュレーションです。',
    memory:
      'Agent の記憶（短期 / 長期 / 意味 / エピソード）を体験。記憶の閲覧 → 圧縮 → 要約 → 想起（コサイン類似度）。要約・想起はオフラインのヒューリスティックです。',
    'multi-agent':
      '複数の役割エージェント（Manager / Planner / Coder …）が協調する様子を体験。会話 → タスク分配 → 投票による合意形成。決定論的シミュレーションです。',
    'claude-code':
      'Claude Code のアーキテクチャを学ぶ教育ページ＆<b>全機能の概念ハブ</b>。<b>サイドバーのグループ（Context / Tool / Memory / Agent）はこのアーキテクチャに対応</b>しています。各システムをクリックすると対応する Lab（Ask / Tool / Memory / Agent / Multi-Agent …）へ飛べます。while ループ / 権限ゲート / セッション / メモリ、最後に最小ハーネスのブラウザ実行。公開分析に基づく概念モデル（数値は概数）。',
    'ai-coding':
      '主要な AI コーディングツールを項目別に比較する参考マトリクス（一般的特徴・編集可）。ベンチマークではありません。',
    build:
      'RAG / Agent / MultiAgent / MCP / Workflow の構成をフォームで編集し、<b>JSON / YAML / Python / LangGraph</b> を生成・保存するページ。',
    evaluation:
      'RAG をラベル付きデータセットで<b>実測評価</b>（Precision@k / Recall@k）するページ。Agent / Prompt / Tool は推定値（プレースホルダ）と明示します。',
    research:
      'PDF を投入して解析するページ。テキスト抽出・ページ図解・TextRank 要約・TF-IDF キーワード・抽出型 QA・文書内検索。すべて端末内処理で外部送信はありません。',
    challenge:
      'RAG → Agent → MCP → Multi-Agent → Claude Code Mini … と段階的に構築する課題ページです。'
  };
})(window.NSCode);

/* Academy (ACAD) — 理論学習: カテゴリ → トピック */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;

  var CATALOG = {
    llm: { name: 'LLM', topics: ['Token', 'Tokenizer', 'Vocabulary', 'Embedding', 'Transformer', 'Attention', 'Decoder', 'Reasoning', 'Inference', 'Temperature', 'TopK', 'TopP'] },
    prompt: { name: 'Prompt Engineering', topics: ['Zero Shot', 'Few Shot', 'CoT', 'ReAct', 'Reflection', 'Self Critique'] },
    embedding: { name: 'Embedding', topics: ['Vector', 'Cos Similarity', 'Distance', 'Semantic Search'] },
    rag: { name: 'RAG', topics: ['Chunk', 'Embedding', 'Retrieval', 'ReRank', 'Context Injection'] },
    mcp: { name: 'MCP', topics: ['Client', 'Server', 'Protocol', 'Tool Exposure'] },
    agent: { name: 'Agent', topics: ['Planning', 'Action', 'Observation', 'Reflection', 'Retry'] },
    'multi-agent': { name: 'Multi-Agent', topics: ['Manager', 'Worker', 'Coordinator', 'Consensus'] }
  };
  // expose so other modules / plugins can extend
  NSCode.academyCatalog = CATALOG;

  function slug(s) { return s.toLowerCase().replace(/\s+/g, '-'); }

  // Concise explanations keyed by "category/slug". Real content (not placeholder).
  var CONTENT = {
    'llm/token': 'トークンは LLM が扱う最小単位で、単語・部分語・記号などに分割された断片です。モデルは文字ではなくトークン列を入力・出力します。',
    'llm/tokenizer': 'トークナイザはテキストをトークン列に変換する仕組みです。BPE などのサブワード分割が一般的で、未知語も部分語の組み合わせで表現します。',
    'llm/vocabulary': '語彙（Vocabulary）はトークナイザが扱える全トークンの集合です。各トークンには一意の ID が割り当てられ、語彙サイズがモデルの入出力幅を決めます。',
    'llm/embedding': 'エンベディングは各トークン ID を高次元の数値ベクトルに変換した表現です。意味的に近いトークンはベクトル空間でも近くに配置されます。',
    'llm/transformer': 'Transformer は自己注意機構を中核とするニューラルネット構造で、系列内の任意の位置同士の関係を並列に学習できます。現代の LLM の基盤です。',
    'llm/attention': 'アテンションは各トークンが他のどのトークンをどれだけ参照するかを重み付けする仕組みです。文脈に応じて関連情報を動的に集約します。',
    'llm/decoder': 'デコーダは次のトークンを 1 つずつ自己回帰的に生成する部分です。直前までの出力を入力に戻しながら系列を伸ばしていきます。',
    'llm/reasoning': '推論（Reasoning）は、途中の思考ステップを介して結論へ至る能力です。CoT などで中間過程を明示すると複雑な問題の精度が上がります。',
    'llm/inference': '推論（Inference）は学習済みモデルを使って出力を生成する実行フェーズを指します。学習（training）と対になる概念です。',
    'llm/temperature': 'Temperature は出力分布の鋭さを調整します。低いほど決定的・安全、高いほど多様・創造的になります。',
    'llm/topk': 'Top-K サンプリングは確率上位 K 個のトークンだけを候補に残してサンプリングします。K を小さくすると出力が安定します。',
    'llm/topp': 'Top-P（核サンプリング）は累積確率が P に達するまでの候補からサンプリングします。文脈に応じて候補数が動的に変わります。',
    'prompt/zero-shot': 'ゼロショットは例示なしで指示だけを与える方法です。タスクが明確で一般的な場合に有効です。',
    'prompt/few-shot': 'フューショットは入力と期待出力の例をいくつか示してから本番の入力を与える方法です。出力形式や方針を例で伝えられます。',
    'prompt/cot': 'Chain-of-Thought は「順を追って考えて」と促し、中間推論を明示させる手法です。多段の計算や論理で精度が向上します。',
    'prompt/react': 'ReAct は Reasoning（思考）と Acting（ツール実行）を交互に行う方式です。観察→思考→行動のループでツールを使いながら解きます。',
    'prompt/reflection': 'リフレクションは自分の出力を振り返り、改善点を見つけて再生成する手法です。誤りの自己修正に役立ちます。',
    'prompt/self-critique': '自己批判は生成結果を一定の基準で自ら採点・指摘させ、品質を高める手法です。リフレクションと組み合わせて使われます。',
    'embedding/vector': 'ベクトルはテキストの意味を表す数値の並びです。次元ごとに特徴を保持し、近さで意味的類似度を測れます。',
    'embedding/cos-similarity': 'コサイン類似度は 2 つのベクトルのなす角の余弦で類似度を測ります。長さに依存せず方向の近さを評価できます。',
    'embedding/distance': '距離はベクトル間の離れ具合を測る指標です。ユークリッド距離やドット積などがあり、検索やクラスタリングに使います。',
    'embedding/semantic-search': '意味検索は語の一致ではなく意味の近さで検索します。クエリと文書をベクトル化し、類似度で並べ替えます。',
    'rag/chunk': 'チャンク分割は長い文書を検索しやすい断片に分けます。サイズとオーバーラップが検索の粒度と文脈保持に影響します。',
    'rag/embedding': 'RAG では各チャンクを埋め込みベクトル化して索引します。クエリも同じ空間に写像し、近いチャンクを取り出します。',
    'rag/retrieval': '検索（Retrieval）はクエリに関連するチャンクを類似度で取得します。TopK や閾値で件数と品質を調整します。',
    'rag/rerank': 'リランキングは一次検索結果を、より精密な基準や多様性（MMR）で並べ替えます。最終的な文脈の質を高めます。',
    'rag/context-injection': 'コンテキスト注入は検索した文脈をプロンプトに差し込み、その根拠のみで答えさせる工程です。幻覚の抑制に重要です。',
    'mcp/client': 'MCP クライアントはツールやリソースを利用する側（ホストアプリ）です。サーバーへ接続し能力を呼び出します。',
    'mcp/server': 'MCP サーバーはツール・リソース・プロンプトを公開する側です。クライアントからの要求に応えて機能を提供します。',
    'mcp/protocol': 'MCP は JSON-RPC ベースの標準プロトコルです。initialize で能力交換し、tools/list や tools/call で機能を呼び出します。',
    'mcp/tool-exposure': 'ツール公開は、サーバーが自分の関数を名前・説明・引数スキーマ付きでクライアントに見せる仕組みです。安全に外部機能を統合できます。',
    'agent/planning': '計画（Planning）はゴールを達成可能なステップ列に分解する工程です。良い計画は実行の成功率を左右します。',
    'agent/action': '行動（Action）は計画に基づきツールを実行する工程です。検索・ファイル操作・コマンド実行などを行います。',
    'agent/observation': '観察（Observation）は行動の結果を取り込み、次の判断材料にする工程です。エラーや出力を解釈します。',
    'agent/reflection': '振り返り（Reflection）は実行の良否を評価し、計画や行動を修正する工程です。失敗からの回復に不可欠です。',
    'agent/retry': '再試行（Retry）は失敗した行動を条件を変えて再実行することです。指数バックオフなどで安定性を高めます。',
    'multi-agent/manager': 'マネージャはタスク全体を統括し、サブタスクを各エージェントへ割り当て、進捗と統合を管理します。',
    'multi-agent/worker': 'ワーカーは割り当てられたサブタスクを実行する専門エージェントです。Researcher・Coder・Tester などの役割を担います。',
    'multi-agent/coordinator': 'コーディネータはエージェント間の依存や順序を調整し、衝突を避けながら協調を促します。',
    'multi-agent/consensus': '合意形成（Consensus）は複数エージェントの意見や成果を評価・統合し、最終決定に至る工程です。投票やスコアリングで行います。'
  };

  // Per-category related Lab links.
  var RELATED = {
    llm: [{ t: 'LLM Playground', r: '#/playground/llm' }, { t: 'Token Visualizer', r: '#/embedding/token' }],
    prompt: [{ t: 'Prompt Playground', r: '#/playground/prompt' }, { t: 'Agent Lab', r: '#/agent/loop' }],
    embedding: [{ t: 'Embedding Viewer', r: '#/embedding/vector' }, { t: 'Similarity Viewer', r: '#/embedding/similarity' }],
    rag: [{ t: 'RAG Lab', r: '#/rag/chunk' }, { t: 'Evaluation Lab', r: '#/evaluation' }],
    mcp: [{ t: 'MCP Lab', r: '#/mcp/explorer' }, { t: 'Tool Calling Lab', r: '#/tools/registry' }],
    agent: [{ t: 'Agent Lab', r: '#/agent/loop' }, { t: 'Memory Lab', r: '#/memory/viewer' }],
    'multi-agent': [{ t: 'Multi-Agent Lab', r: '#/multi-agent/chat' }, { t: 'Consensus Viewer', r: '#/multi-agent/consensus' }]
  };

  NSCode.registerView({
    route: '#/academy', module: 'academy', title: 'Academy',
    render: function () {
      var cards = Object.keys(CATALOG).map(function (id) {
        var c = CATALOG[id];
        return C.Card({ title: c.name, badge: c.topics.length + ' topics',
          body: c.topics.slice(0, 4).join(' · ') + ' …', href: '#/academy/' + id });
      }).join('');
      return C.PageHeader({ title: 'Academy', purpose: '理論学習' }) +
        C.Grid(cards, 3);
    }
  });

  NSCode.registerView({
    route: '#/academy/:category', module: 'academy', title: 'Academy',
    render: function (ctx) {
      var c = CATALOG[ctx.params.category];
      if (!c) return C.PageHeader({ title: 'Academy', purpose: '理論学習' }) +
        C.EmptyState({ icon: '🔍', message: 'カテゴリが見つかりません。' });
      var cards = c.topics.map(function (t) {
        return C.Card({ title: t, href: '#/academy/' + ctx.params.category + '/' + slug(t) });
      }).join('');
      return C.PageHeader({ title: c.name, purpose: '学習トピック一覧',
        breadcrumb: ['Academy', c.name] }) + C.Grid(cards, 4);
    }
  });

  NSCode.registerView({
    route: '#/academy/:category/:topic', module: 'academy', title: 'Academy',
    render: function (ctx) {
      var c = CATALOG[ctx.params.category];
      var name = ctx.params.topic.replace(/-/g, ' ');
      var key = ctx.params.category + '/' + ctx.params.topic;
      var body = CONTENT[key]
        ? '<p class="ns-lesson">' + C.esc(CONTENT[key]) + '</p>'
        : C.EmptyState({ icon: '📘', message: 'このトピックの解説は準備中です。' });
      var related = (RELATED[ctx.params.category] || [{ t: 'Dashboard', r: '#/dashboard' }])
        .map(function (l) { return C.Card({ title: l.t, href: l.r }); }).join('');
      return C.PageHeader({ title: name, purpose: (c ? c.name : '') + ' のトピック',
        breadcrumb: ['Academy', c ? c.name : ctx.params.category, name] }) +
        C.Panel({ title: '理論', body: body }) +
        C.Panel({ title: '関連 Lab で試す', hint: '見る → 触る → 試す', body: C.Grid(related, 3) });
    }
  });
})(window.NSCode);

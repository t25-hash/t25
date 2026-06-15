/* RAG Lab (RAG) — a working, offline RAG pipeline across 5 stages.
 * State (corpus / query / params / answer) is shared across tabs and persisted,
 * so the pipeline flows: Chunk -> Retrieval -> ReRank -> Context -> Hallucination. */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, E = NSCode.rag;

  var tabs = [
    { id: 'chunk', label: 'Chunk', route: '#/rag/chunk' },
    { id: 'retrieval', label: 'Retrieval', route: '#/rag/retrieval' },
    { id: 'rerank', label: 'ReRank', route: '#/rag/rerank' },
    { id: 'context', label: 'Context Builder', route: '#/rag/context' },
    { id: 'hallucination', label: 'Hallucination', route: '#/rag/hallucination' }
  ];

  var DEFAULT_CORPUS =
    'RAG（検索拡張生成）は、外部知識を検索してプロンプトに注入し、回答の事実性を高める手法です。\n\n' +
    'チャンク分割では文書を小さな断片に分けます。オーバーラップを設けると、断片の境界をまたぐ文脈が保たれます。\n\n' +
    'Retrieval retrieves the most relevant chunks for a query using a similarity score. TopK controls how many chunks are returned, and a threshold filters out weak matches.\n\n' +
    'Reranking reorders the retrieved chunks. MMR (Maximal Marginal Relevance) balances relevance to the query against diversity, reducing redundant results.\n\n' +
    'コンテキストビルダーは、検索結果をテンプレートに差し込み、最終的なプロンプトを組み立てます。\n\n' +
    'ハルシネーション（幻覚）は、コンテキストに根拠がない主張をモデルが生成する現象です。根拠との重なりが小さい文は要注意です。';

  var DEFAULT_TEMPLATE =
    'あなたは正確なアシスタントです。以下のコンテキストのみを根拠に質問へ答えてください。\n\n' +
    '# コンテキスト\n{context}\n\n# 質問\n{query}\n\n# 回答';

  var DEFAULT_ANSWER =
    'RAGは外部知識を検索してプロンプトに注入し、回答の事実性を高めます。' +
    'チャンク分割でオーバーラップを設けると、断片の境界をまたぐ文脈が保たれます。' +
    'このシステムは量子テレポートでデータを取得し、99.99%の精度を保証します。';

  var state = NSCode.api.labState('#/rag') || {};
  state = Object.assign({
    corpus: DEFAULT_CORPUS,
    chunkParams: { size: 160, overlap: 30, separator: '\n\n' },
    query: 'reranking はどのように関連性と多様性を両立しますか？',
    retrieveParams: { topK: 4, threshold: 0, lambda: 0.7 },
    template: '',
    answer: DEFAULT_ANSWER
  }, state);

  function persist() { NSCode.api.labState('#/rag', state); }
  function getChunks() { return E.chunk(state.corpus, state.chunkParams); }
  function getRetrieval() {
    var chunks = getChunks();
    return E.retrieve(state.query, chunks, state.retrieveParams);
  }
  function el(id) { return document.getElementById(id); }
  function range(id, min, max, step, val) {
    return '<input id="' + id + '" class="ns-range" type="range" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + val + '">';
  }
  function header(s) {
    return C.PageHeader({ title: s.title, purpose: s.purpose, breadcrumb: ['RAG Lab', s.title] }) + C.Tabs(tabs, s.route);
  }
  function highlight(text, query) {
    var ws = (query.toLowerCase().match(/[a-z][a-z0-9\-]{2,}/g) || []);
    var uniq = {}; ws = ws.filter(function (w) { return uniq[w] ? false : (uniq[w] = 1); });
    var html = C.esc(text);
    ws.forEach(function (w) {
      html = html.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
    });
    return html;
  }

  /* ---------- Chunk ---------- */
  NSCode.registerView({
    route: '#/rag/chunk', module: 'rag', title: 'Chunk Simulator',
    render: function () {
      var p = state.chunkParams;
      return header({ title: 'Chunk Simulator', purpose: 'チャンク分割パラメータの影響を体験', route: '#/rag/chunk' }) +
        C.Panel({ title: '入力文書', body: '<textarea id="corpus" class="ns-input" rows="6">' + C.esc(state.corpus) + '</textarea>' }) +
        C.Panel({ title: '設定', body: C.Controls([
          { label: 'Chunk Size: <b id="vsize">' + p.size + '</b>', control: range('csize', 32, 600, 8, p.size) },
          { label: 'Overlap: <b id="voverlap">' + p.overlap + '</b>', control: range('coverlap', 0, 200, 5, p.overlap) },
          { label: 'Separator', control: '<select id="csep" class="ns-input"><option value="\\n\\n">段落 (\\n\\n)</option><option value="\\n">改行 (\\n)</option><option value=". ">文 (. )</option><option value="">文字単位 (なし)</option></select>' }
        ]) }) +
        C.Panel({ title: 'チャンク結果', hint: '色付きブロック＝1チャンク', body: '<div id="chunkOut"></div>' });
    },
    onMount: function () {
      var sep = el('csep'); sep.value = state.chunkParams.separator;
      function upd() {
        state.chunkParams.size = +el('csize').value;
        state.chunkParams.overlap = Math.min(+el('coverlap').value, state.chunkParams.size - 1);
        state.chunkParams.separator = sep.value.replace(/\\n/g, '\n');
        el('vsize').textContent = state.chunkParams.size;
        el('voverlap').textContent = state.chunkParams.overlap;
        persist(); renderChunks();
      }
      el('corpus').addEventListener('input', function () { state.corpus = el('corpus').value; persist(); renderChunks(); });
      ['csize', 'coverlap'].forEach(function (id) { el(id).addEventListener('input', upd); });
      sep.addEventListener('change', upd);
      renderChunks();
    }
  });

  function renderChunks() {
    var out = el('chunkOut'); if (!out) return;
    var chunks = getChunks();
    var avg = chunks.reduce(function (s, c) { return s + c.text.length; }, 0) / (chunks.length || 1);
    out.innerHTML =
      '<div class="ns-grid" style="--cols:3">' +
        C.Metric({ label: 'チャンク数', value: chunks.length }) +
        C.Metric({ label: '平均文字数', value: Math.round(avg) }) +
        C.Metric({ label: 'Overlap', value: state.chunkParams.overlap }) +
      '</div><div class="ns-chunks">' +
      chunks.map(function (c, i) {
        return '<div class="ns-chunk ns-chunk--' + (i % 4) + '"><span class="ns-chunk__tag">#' + i + ' · ' + c.text.length + 'c</span>' + C.esc(c.text) + '</div>';
      }).join('') + '</div>';
  }

  /* ---------- Retrieval ---------- */
  NSCode.registerView({
    route: '#/rag/retrieval', module: 'rag', title: 'Retrieval Simulator',
    render: function () {
      var p = state.retrieveParams;
      return header({ title: 'Retrieval Simulator', purpose: 'TF-IDF コサイン類似度で検索（語彙ベース）', route: '#/rag/retrieval' }) +
        C.Panel({ title: 'クエリ', body: '<input id="query" class="ns-input" value="' + C.esc(state.query) + '">' }) +
        C.Panel({ title: '設定', hint: 'dense embedding ではなく lexical retrieval', body: C.Controls([
          { label: 'TopK: <b id="vtopk">' + p.topK + '</b>', control: range('topk', 1, 10, 1, p.topK) },
          { label: 'Threshold: <b id="vthr">' + p.threshold + '</b>', control: range('thr', 0, 1, 0.05, p.threshold) }
        ]) }) +
        C.Panel({ title: '検索結果', body: '<div id="retOut"></div>' });
    },
    onMount: function () {
      function upd() {
        state.query = el('query').value;
        state.retrieveParams.topK = +el('topk').value;
        state.retrieveParams.threshold = +el('thr').value;
        el('vtopk').textContent = state.retrieveParams.topK;
        el('vthr').textContent = state.retrieveParams.threshold;
        persist(); renderRetrieval();
      }
      el('query').addEventListener('input', upd);
      ['topk', 'thr'].forEach(function (id) { el(id).addEventListener('input', upd); });
      renderRetrieval();
    }
  });

  function renderRetrieval() {
    var out = el('retOut'); if (!out) return;
    var res = getRetrieval();
    if (!res.hits.length) { out.innerHTML = C.EmptyState({ icon: '🔍', message: '一致するチャンクがありません（threshold を下げてください）。' }); return; }
    out.innerHTML = res.hits.map(function (h, i) {
      return '<div class="ns-hit"><div class="ns-hit__head"><span>#' + (i + 1) + ' · chunk ' + h.chunk.id + '</span>' +
        '<span class="ns-hit__score">cos ' + h.score.toFixed(3) + '</span></div>' +
        '<div class="ns-progress"><div class="ns-progress__fill" style="width:' + Math.round(h.score * 100) + '%"></div></div>' +
        '<p class="ns-hit__text">' + highlight(h.chunk.text, state.query) + '</p></div>';
    }).join('');
  }

  /* ---------- ReRank ---------- */
  NSCode.registerView({
    route: '#/rag/rerank', module: 'rag', title: 'ReRanking Simulator',
    render: function () {
      var p = state.retrieveParams;
      return header({ title: 'ReRanking Simulator', purpose: 'MMR で関連性と多様性を両立（Before / After）', route: '#/rag/rerank' }) +
        C.Panel({ title: '設定', hint: 'λ=1: 関連性重視 / λ=0: 多様性重視', body: C.Controls([
          { label: 'λ (lambda): <b id="vlam">' + p.lambda + '</b>', control: range('lam', 0, 1, 0.05, p.lambda) }
        ]) }) +
        '<div class="ns-grid" style="--cols:2">' +
          C.Panel({ title: 'Before（cos 類似度順）', body: '<div id="beforeOut"></div>' }) +
          C.Panel({ title: 'After（MMR 順）', body: '<div id="afterOut"></div>' }) +
        '</div>';
    },
    onMount: function () {
      el('lam').addEventListener('input', function () {
        state.retrieveParams.lambda = +el('lam').value;
        el('vlam').textContent = state.retrieveParams.lambda;
        persist(); renderRerank();
      });
      renderRerank();
    }
  });

  function rankList(items) {
    if (!items.length) return C.EmptyState({ message: '結果がありません。' });
    return '<ol class="ns-ranklist">' + items.map(function (h) {
      return '<li><span class="ns-tag">c' + h.chunk.id + '</span>' + C.esc(h.chunk.text.slice(0, 90)) + (h.chunk.text.length > 90 ? '…' : '') + '</li>';
    }).join('') + '</ol>';
  }
  function renderRerank() {
    var b = el('beforeOut'), a = el('afterOut'); if (!b || !a) return;
    var res = getRetrieval();
    b.innerHTML = rankList(res.hits);
    a.innerHTML = rankList(E.mmr(res.qvec, res.hits, { lambda: state.retrieveParams.lambda, k: res.hits.length }));
  }

  /* ---------- Context Builder ---------- */
  NSCode.registerView({
    route: '#/rag/context', module: 'rag', title: 'Context Builder',
    render: function () {
      return header({ title: 'Context Builder', purpose: '検索結果からプロンプトを構築', route: '#/rag/context' }) +
        C.Panel({ title: 'テンプレート', hint: '{context} と {query} が置換されます',
          body: '<textarea id="tmpl" class="ns-input" rows="4">' + C.esc(state.template || DEFAULT_TEMPLATE) + '</textarea>' }) +
        C.Panel({ title: '組み立てられたプロンプト', body:
          '<div class="ns-actions"><button id="copyCtx" class="ns-btn ns-btn--ghost">コピー</button></div>' +
          '<pre id="ctxOut" class="ns-code"></pre>' });
    },
    onMount: function () {
      el('tmpl').addEventListener('input', function () { state.template = el('tmpl').value; persist(); renderContext(); });
      el('copyCtx').addEventListener('click', function () {
        var t = el('ctxOut').textContent;
        if (navigator.clipboard) navigator.clipboard.writeText(t);
        el('copyCtx').textContent = 'コピーしました ✓';
      });
      renderContext();
    }
  });

  function renderContext() {
    var out = el('ctxOut'); if (!out) return;
    var res = getRetrieval();
    out.textContent = E.buildContext(res.hits, el('tmpl') ? el('tmpl').value : state.template, state.query);
  }

  /* ---------- Hallucination ---------- */
  NSCode.registerView({
    route: '#/rag/hallucination', module: 'rag', title: 'Hallucination Viewer',
    render: function () {
      return header({ title: 'Hallucination Viewer', purpose: '回答とコンテキストの語彙重なりで根拠の薄い文を検出', route: '#/rag/hallucination' }) +
        C.Panel({ title: '回答（検証対象）', body: '<textarea id="answer" class="ns-input" rows="4">' + C.esc(state.answer) + '</textarea>' }) +
        C.Panel({ title: '解析結果', hint: '緑＝根拠あり / 赤＝根拠が薄い（要確認）', body: '<div id="halOut"></div>' });
    },
    onMount: function () {
      el('answer').addEventListener('input', function () { state.answer = el('answer').value; persist(); renderHalluc(); });
      renderHalluc();
    }
  });

  function renderHalluc() {
    var out = el('halOut'); if (!out) return;
    var res = getRetrieval();
    var ctxText = res.hits.map(function (h) { return h.chunk.text; }).join(' ');
    var rows = E.analyzeHallucination(state.answer, ctxText);
    var flagged = rows.filter(function (r) { return r.flagged; }).length;
    out.innerHTML =
      '<div class="ns-grid" style="--cols:2">' +
        C.Metric({ label: '検証した文', value: rows.length }) +
        C.Metric({ label: '要確認', value: flagged }) +
      '</div><div class="ns-hal">' +
      rows.map(function (r) {
        return '<div class="ns-hal__row ' + (r.flagged ? 'is-bad' : 'is-ok') + '">' +
          '<span class="ns-hal__badge">' + (r.flagged ? '⚠ ' + Math.round(r.ratio * 100) + '%' : '✓ ' + Math.round(r.ratio * 100) + '%') + '</span>' +
          C.esc(r.sentence) + '</div>';
      }).join('') + '</div>' +
      '<p class="ns-empty__hint">※ コンテキストは現在の検索結果（Retrieval タブの設定）を使用します。語彙重なりベースの簡易検出です。</p>';
  }
})(window.NSCode);

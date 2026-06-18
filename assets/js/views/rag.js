/* RAG Lab (RAG) — a working, offline RAG pipeline on a SINGLE page.
 * Shared inputs (corpus / chunk params / query / retrieve params) live once at the
 * top; each section below recomputes live from that shared, persisted state, so the
 * pipeline flows top-to-bottom: Chunk -> Retrieval -> ReRank -> Context -> Hallucination. */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, E = NSCode.rag;

  var DEFAULT_CORPUS =
    'ポンプ P-101 は冷却水を循環させる主要設備です。軸振動アラームは、ベアリング摩耗・アライメント不良・キャビテーションが主な原因です。\n\n' +
    '軸振動が大きい場合は、まず予備機 P-102 へ切り替え、運転を継続しながら P-101 を停止して点検します。停止前に上流バルブの状態を確認します。\n\n' +
    'ベアリングの異音や温度上昇を伴う場合は、潤滑状態を点検し、必要なら交換します。過去の保全履歴では、軸受交換で振動が収まった事例が複数あります。\n\n' +
    'キャビテーションは吸込側の圧力不足で発生し、流量低下や騒音を伴います。吸込配管の詰まりやストレーナの差圧を確認します。\n\n' +
    '運転手順書では、振動値が基準を超えたら 15 分以内に当直長へ報告し、保全管理システムに記録することと定められています。\n\n' +
    'HAZOP 記録によると、P-101 の停止は下流の熱交換器 E-201 の温度上昇につながるため、切替時は E-201 の出口温度を監視します。';

  var DEFAULT_TEMPLATE =
    'あなたは正確なアシスタントです。以下のコンテキストのみを根拠に質問へ答えてください。\n\n' +
    '# コンテキスト\n{context}\n\n# 質問\n{query}\n\n# 回答';

  var DEFAULT_ANSWER =
    '軸振動アラーム時は、まず予備機 P-102 へ切り替えてから P-101 を停止し点検します。' +
    'ベアリングの異音や温度上昇があれば潤滑状態を点検し、必要なら軸受を交換します。' +
    'なお本ポンプは量子テレポートで瞬時に分解整備でき、振動はゼロに保証されます。';

  var state = NSCode.api.labState('#/rag') || {};
  state = Object.assign({
    corpus: DEFAULT_CORPUS,
    chunkParams: { size: 160, overlap: 30, separator: '\n\n' },
    query: 'ポンプ P-101 の軸振動アラームが出たらどう対応しますか？',
    retrieveParams: { topK: 4, threshold: 0, lambda: 0.7 },
    template: '',
    answer: DEFAULT_ANSWER
  }, state);

  // reflect the latest Ask question: use it as the query and the retrieved
  // passages as the corpus (once per Ask run, so manual edits aren't clobbered).
  function syncAsk() { if (NSCode.lastRun && NSCode.lastRun.applyTo(state, { query: 'query', corpus: 'context' })) persist(); }
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
  function highlight(text, query) {
    var ws = (query.toLowerCase().match(/[a-z][a-z0-9\-]{2,}/g) || []);
    var uniq = {}; ws = ws.filter(function (w) { return uniq[w] ? false : (uniq[w] = 1); });
    var html = C.esc(text);
    ws.forEach(function (w) {
      html = html.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
    });
    return html;
  }

  /* ---------- Single page render ---------- */
  function render() {
    syncAsk();
    var cp = state.chunkParams, rp = state.retrieveParams;
    return C.PageHeader({
      title: 'RAG Lab',
      purpose: 'チャンク分割から検索・ReRank・コンテキスト構築・ハルシネーション検出まで、オフラインで動く RAG パイプラインを1ページで体験できます。'
    }) +
      /* ---- shared inputs (top, once) ---- */
      C.Panel({ title: '入力文書', hint: 'すべてのセクション共通のコーパス',
        body: '<textarea id="corpus" class="ns-input" rows="6">' + C.esc(state.corpus) + '</textarea>' }) +
      C.Panel({ title: 'チャンク設定', body: C.Controls([
        { label: 'Chunk Size: <b id="vsize">' + cp.size + '</b>', control: range('csize', 32, 600, 8, cp.size) },
        { label: 'Overlap: <b id="voverlap">' + cp.overlap + '</b>', control: range('coverlap', 0, 200, 5, cp.overlap) },
        { label: 'Separator', control: '<select id="csep" class="ns-input"><option value="\\n\\n">段落 (\\n\\n)</option><option value="\\n">改行 (\\n)</option><option value=". ">文 (. )</option><option value="">文字単位 (なし)</option></select>' }
      ]) }) +
      C.Panel({ title: 'クエリ', body: '<input id="query" class="ns-input" value="' + C.esc(state.query) + '">' }) +
      C.Panel({ title: '検索設定', hint: 'dense embedding ではなく lexical retrieval', body: C.Controls([
        { label: 'TopK: <b id="vtopk">' + rp.topK + '</b>', control: range('topk', 1, 10, 1, rp.topK) },
        { label: 'Threshold: <b id="vthr">' + rp.threshold + '</b>', control: range('thr', 0, 1, 0.05, rp.threshold) },
        { label: 'λ (lambda): <b id="vlam">' + rp.lambda + '</b>', control: range('lam', 0, 1, 0.05, rp.lambda) }
      ]) }) +
      /* ---- sections (live) ---- */
      C.Panel({ title: 'チャンク結果', hint: '色付きブロック＝1チャンク', body: '<div id="chunkOut"></div>' }) +
      C.Panel({ title: '検索結果', hint: 'TF-IDF コサイン（語彙ベース）', body: '<div id="retOut"></div>' }) +
      '<div class="ns-grid" style="--cols:2">' +
        C.Panel({ title: 'ReRank — Before（cos 類似度順）', body: '<div id="beforeOut"></div>' }) +
        C.Panel({ title: 'ReRank — After（MMR 順）', hint: 'λ=1: 関連性重視 / λ=0: 多様性重視', body: '<div id="afterOut"></div>' }) +
      '</div>' +
      C.Panel({ title: 'コンテキスト', hint: '{context} と {query} が置換されます', body:
        '<textarea id="tmpl" class="ns-input" rows="4">' + C.esc(state.template || DEFAULT_TEMPLATE) + '</textarea>' +
        '<div class="ns-actions"><button id="copyCtx" class="ns-btn ns-btn--ghost">コピー</button></div>' +
        '<pre id="ctxOut" class="ns-code"></pre>' }) +
      C.Panel({ title: 'ハルシネーション', hint: '緑＝根拠あり / 赤＝根拠が薄い（要確認）', body:
        '<textarea id="answer" class="ns-input" rows="4">' + C.esc(state.answer) + '</textarea>' +
        '<div id="halOut"></div>' });
  }

  function renderAll() {
    renderChunks();
    renderRetrieval();
    renderRerank();
    renderContext();
    renderHalluc();
  }

  function onMount() {
    /* shared corpus */
    el('corpus').addEventListener('input', function () {
      state.corpus = el('corpus').value; persist(); renderAll();
    });

    /* chunk params */
    var sep = el('csep'); sep.value = state.chunkParams.separator;
    function updChunk() {
      state.chunkParams.size = +el('csize').value;
      state.chunkParams.overlap = Math.min(+el('coverlap').value, state.chunkParams.size - 1);
      state.chunkParams.separator = sep.value.replace(/\\n/g, '\n');
      el('vsize').textContent = state.chunkParams.size;
      el('voverlap').textContent = state.chunkParams.overlap;
      persist(); renderAll();
    }
    ['csize', 'coverlap'].forEach(function (id) { el(id).addEventListener('input', updChunk); });
    sep.addEventListener('change', updChunk);

    /* query */
    el('query').addEventListener('input', function () {
      state.query = el('query').value; persist(); renderAll();
    });

    /* retrieve params */
    function updRetrieve() {
      state.retrieveParams.topK = +el('topk').value;
      state.retrieveParams.threshold = +el('thr').value;
      state.retrieveParams.lambda = +el('lam').value;
      el('vtopk').textContent = state.retrieveParams.topK;
      el('vthr').textContent = state.retrieveParams.threshold;
      el('vlam').textContent = state.retrieveParams.lambda;
      persist(); renderAll();
    }
    ['topk', 'thr', 'lam'].forEach(function (id) { el(id).addEventListener('input', updRetrieve); });

    /* context */
    el('tmpl').addEventListener('input', function () { state.template = el('tmpl').value; persist(); renderContext(); });
    el('copyCtx').addEventListener('click', function () {
      var t = el('ctxOut').textContent;
      if (navigator.clipboard) navigator.clipboard.writeText(t);
      el('copyCtx').textContent = 'コピーしました ✓';
    });

    /* hallucination */
    el('answer').addEventListener('input', function () { state.answer = el('answer').value; persist(); renderHalluc(); });

    renderAll();
  }

  /* ---------- section renderers ---------- */
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

  function renderContext() {
    var out = el('ctxOut'); if (!out) return;
    var res = getRetrieval();
    out.textContent = E.buildContext(res.hits, el('tmpl') ? el('tmpl').value : (state.template || DEFAULT_TEMPLATE), state.query);
  }

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
      '<p class="ns-empty__hint">※ コンテキストは現在の検索結果（上部の検索設定）を使用します。語彙重なりベースの簡易検出です。</p>';
  }

  /* ---------- register ONE page for base route + all former sub-routes (aliases) ---------- */
  ['#/rag', '#/rag/chunk', '#/rag/retrieval', '#/rag/rerank', '#/rag/context', '#/rag/hallucination'].forEach(function (r) {
    NSCode.registerView({ route: r, module: 'rag', title: 'RAG Lab', render: render, onMount: onMount });
  });
})(window.NSCode);

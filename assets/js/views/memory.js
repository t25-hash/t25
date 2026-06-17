/* Memory Lab (MEM) — an offline, deterministic tour of agent memory on ONE
 * page (no tabs). Four stores (Short / Long / Semantic / Episodic) are shared
 * across sections and persisted, so adding a turn in the Viewer feeds
 * Compression, and Semantic items power Recall. Sections (stacked):
 *   a) Memory Viewer  b) Compression  c) Summary  d) Recall
 * All processing is heuristic & local (no LLM / no backend):
 *  - compression/summary  -> NSCode.research.summarize (frequency-based)
 *  - recall               -> NSCode.embeddings cosine (lexical hashing trick) */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, M = NSCode.memory;

  var SEED_SEMANTIC = [
    { text: '歯車は回転と動力を伝達する機械要素で、かみ合う歯のピッチ円が接して回転を伝える。' },
    { text: 'インボリュート歯車は、中心距離が多少ずれても角速度比が一定に保たれる利点がある。' },
    { text: '転がり軸受は内輪・外輪・転動体・保持器から成り、摩擦が小さく高速回転に向く。' },
    { text: 'すべり軸受は油膜で荷重を支え、衝撃や高荷重に強い。' },
    { text: 'はりの曲げでは曲げ応力が中立軸からの距離に比例し、縁部で最大になる。' },
    { text: '許容応力は安全率で割って定め、疲労・座屈・クリープなどの破壊形態も考慮する。' }
  ];

  var DEFAULT_SHORT = [
    { role: 'user', text: '歯車の種類にはどんなものがありますか？' },
    { role: 'assistant', text: '平歯車・はすば歯車・かさ歯車・ウォームギヤなどがあります。平行軸には平歯車やはすば歯車、交差軸にはかさ歯車を使います。' },
    { role: 'user', text: '強度設計で気をつける点は？' },
    { role: 'assistant', text: '歯元の曲げ応力と歯面の接触応力（面圧）を確認します。材料は S45C などに熱処理を施して強度を確保します。' }
  ];

  var DEFAULT_SUMMARY_TEXT =
    '歯車は動力を伝達する機械要素で、かみ合う歯で回転を伝える。インボリュート歯車は中心距離の誤差に強い。' +
    '軸受は軸を支える要素で、転がり軸受は摩擦が小さく高速向き、すべり軸受は油膜で高荷重・衝撃に強い。' +
    'はりの曲げでは曲げ応力が縁部で最大になり、断面係数が大きいほど曲げに強い。' +
    '設計では許容応力を安全率で割って定め、疲労・座屈・クリープなどの破壊形態も考慮して寸法を決める。';

  /* ---------- shared persisted state ---------- */
  var state = NSCode.api.labState('#/memory') || {};
  state = Object.assign({
    short: DEFAULT_SHORT.slice(),
    long: ['主対象は歯車減速機と軸受。', '強度確認は歯元の曲げ応力と歯面の接触応力。'],
    semantic: SEED_SEMANTIC.slice(),
    episodic: [],
    compress: { text: '', nSentences: 3, fromShort: true },
    summary: { text: DEFAULT_SUMMARY_TEXT, nSentences: 3 },
    recall: { query: '歯車の強度設計について', k: 4 }
  }, state);

  function persist() { NSCode.api.labState('#/memory', state); }
  function el(id) { return document.getElementById(id); }

  /* dynamic: the recall query follows the latest Ask question (the stored
   * sample memories stay — they are the lab's memory bank being searched). */
  function syncFromAsk() {
    var r = NSCode.lastRun && NSCode.lastRun.get();
    if (r && r.query) { state.recall.query = r.query; persist(); }
  }
  function range(id, min, max, step, val) {
    return '<input id="' + id + '" class="ns-range" type="range" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + val + '">';
  }
  function shortText() {
    return state.short.map(function (t) { return t.text; }).join(' ');
  }

  /* ===================== single-page render ===================== */
  function render() {
    var c = state.compress;
    var cmpInitial = c.fromShort ? shortText() : (c.text || shortText());
    var sm = state.summary;
    var r = state.recall;

    return C.PageHeader({
        title: 'Memory Lab',
        purpose: '4種のメモリストアと Compression / Summary / Recall を1ページで確認',
        breadcrumb: ['Memory Lab']
      }) +

      /* a) Memory Viewer */
      C.Panel({ title: 'Memory Viewer — 概況', hint: '各ストアの件数', body: '<div id="memCounts"></div>' }) +
      C.Panel({ title: 'Memory Viewer — 会話ターンを追加', hint: 'Short メモリと Episodic イベントに同時追記',
        body: C.Controls([
          { label: 'Role', control: '<select id="turnRole" class="ns-input"><option value="user">user</option><option value="assistant">assistant</option></select>' },
          { label: '発話テキスト', control: '<input id="turnText" class="ns-input" placeholder="メッセージを入力…">' }
        ]) + '<div class="ns-actions"><button id="addTurn" class="ns-btn">追加</button></div>' }) +
      '<div class="ns-grid" style="--cols:2">' +
        C.Panel({ title: 'Short Memory', hint: '直近の会話ターン',
          body: '<div class="ns-actions"><button id="clearShort" class="ns-btn ns-btn--ghost">クリア</button></div><div id="storeShort"></div>' }) +
        C.Panel({ title: 'Long Memory', hint: '永続化された事実',
          body: '<div class="ns-actions"><button id="clearLong" class="ns-btn ns-btn--ghost">クリア</button></div><div id="storeLong"></div>' }) +
        C.Panel({ title: 'Semantic Memory', hint: '知識アイテム（Recall の対象）',
          body: '<div class="ns-actions"><button id="clearSem" class="ns-btn ns-btn--ghost">クリア</button></div><div id="storeSem"></div>' }) +
        C.Panel({ title: 'Episodic Memory', hint: '時刻付きの出来事',
          body: '<div class="ns-actions"><button id="clearEpi" class="ns-btn ns-btn--ghost">クリア</button></div><div id="storeEpi"></div>' }) +
      '</div>' +

      /* b) Compression */
      C.Panel({ title: 'Compression — 圧縮対象テキスト', hint: '初期値は Short メモリの結合。編集も可能',
        body: '<div class="ns-actions"><button id="loadShort" class="ns-btn ns-btn--ghost">Short メモリを読込</button></div>' +
          '<textarea id="cmpIn" class="ns-input" rows="6">' + C.esc(cmpInitial) + '</textarea>' }) +
      C.Panel({ title: 'Compression — 設定', hint: 'frequency-based 抽出型要約（LLM 不使用）', body: C.Controls([
        { label: '目標文数: <b id="vcmpN">' + c.nSentences + '</b>', control: range('cmpN', 1, 8, 1, c.nSentences) }
      ]) }) +
      C.Panel({ title: 'Compression — 結果', hint: 'before / after 文字数と削減率', body: '<div id="cmpOut"></div>' }) +

      /* c) Summary */
      C.Panel({ title: 'Summary — 入力テキスト', body: '<textarea id="sumIn" class="ns-input" rows="7">' + C.esc(sm.text) + '</textarea>' }) +
      C.Panel({ title: 'Summary — 設定', hint: 'frequency-based 抽出型要約（LLM 不使用）', body: C.Controls([
        { label: '要約文数: <b id="vsumN">' + sm.nSentences + '</b>', control: range('sumN', 1, 8, 1, sm.nSentences) }
      ]) }) +
      C.Panel({ title: 'Summary — 要約', hint: '選抜された文を箇条書きで表示', body: '<div id="sumOut"></div>' }) +

      /* d) Recall */
      C.Panel({ title: 'Recall — クエリ', hint: 'クエリに近い Semantic メモリをコサイン類似度で想起', body: '<input id="rqQuery" class="ns-input" value="' + C.esc(r.query) + '">' }) +
      C.Panel({ title: 'Recall — 設定', hint: 'lexical なハッシュ埋め込みの類似度（学習済みニューラル埋め込みではありません）', body: C.Controls([
        { label: 'TopK: <b id="vrqK">' + r.k + '</b>', control: range('rqK', 1, 6, 1, r.k) }
      ]) }) +
      C.Panel({ title: 'Recall — 想起結果', hint: 'Semantic メモリを類似度順に表示', body: '<div id="rqOut"></div>' });
  }

  function onMount() {
    syncFromAsk();
    if (el('rqQuery')) el('rqQuery').value = state.recall.query;
    /* a) Viewer wiring */
    el('addTurn').addEventListener('click', function () {
      var text = el('turnText').value.trim();
      if (!text) return;
      var role = el('turnRole').value;
      state.short.push({ role: role, text: text });
      state.episodic.push({ ts: new Date().toISOString(), text: '会話ターン追加 (' + role + '): ' + text });
      el('turnText').value = '';
      persist(); renderViewer();
    });
    el('turnText').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); el('addTurn').click(); }
    });
    el('clearShort').addEventListener('click', function () { state.short = []; persist(); renderViewer(); });
    el('clearLong').addEventListener('click', function () { state.long = []; persist(); renderViewer(); });
    el('clearSem').addEventListener('click', function () { state.semantic = []; persist(); renderViewer(); renderRecall(); });
    el('clearEpi').addEventListener('click', function () { state.episodic = []; persist(); renderViewer(); });

    /* b) Compression wiring */
    el('loadShort').addEventListener('click', function () {
      state.compress.fromShort = true;
      state.compress.text = '';
      el('cmpIn').value = shortText();
      persist(); renderCompression();
    });
    el('cmpIn').addEventListener('input', function () {
      state.compress.fromShort = false;
      state.compress.text = el('cmpIn').value;
      persist(); renderCompression();
    });
    el('cmpN').addEventListener('input', function () {
      state.compress.nSentences = +el('cmpN').value;
      el('vcmpN').textContent = state.compress.nSentences;
      persist(); renderCompression();
    });

    /* c) Summary wiring */
    el('sumIn').addEventListener('input', function () {
      state.summary.text = el('sumIn').value; persist(); renderSummary();
    });
    el('sumN').addEventListener('input', function () {
      state.summary.nSentences = +el('sumN').value;
      el('vsumN').textContent = state.summary.nSentences;
      persist(); renderSummary();
    });

    /* d) Recall wiring */
    function updRecall() {
      state.recall.query = el('rqQuery').value;
      state.recall.k = +el('rqK').value;
      el('vrqK').textContent = state.recall.k;
      persist(); renderRecall();
    }
    el('rqQuery').addEventListener('input', updRecall);
    el('rqK').addEventListener('input', updRecall);

    renderViewer(); renderCompression(); renderSummary(); renderRecall();
  }

  /* ===================== a) Memory Viewer ===================== */
  function renderViewer() {
    var counts = el('memCounts');
    if (counts) {
      counts.innerHTML = '<div class="ns-grid" style="--cols:4">' +
        C.Metric({ label: 'Short', value: state.short.length, unit: '件' }) +
        C.Metric({ label: 'Long', value: state.long.length, unit: '件' }) +
        C.Metric({ label: 'Semantic', value: state.semantic.length, unit: '件' }) +
        C.Metric({ label: 'Episodic', value: state.episodic.length, unit: '件' }) +
      '</div>';
    }
    var s = el('storeShort');
    if (s) {
      s.innerHTML = state.short.length ? '<div class="ns-mem-list">' + state.short.map(function (t) {
        return '<div class="ns-mem-turn ns-mem-turn--' + (t.role === 'user' ? 'user' : 'assistant') + '">' +
          '<span class="ns-tag">' + C.esc(t.role) + '</span>' + C.esc(t.text) + '</div>';
      }).join('') + '</div>' : C.EmptyState({ icon: '💬', message: '会話ターンがありません。' });
    }
    var lg = el('storeLong');
    if (lg) {
      lg.innerHTML = state.long.length ? '<ul class="ns-mem-facts">' + state.long.map(function (f) {
        return '<li>' + C.esc(f) + '</li>';
      }).join('') + '</ul>' : C.EmptyState({ icon: '📌', message: '永続事実がありません。' });
    }
    var sem = el('storeSem');
    if (sem) {
      sem.innerHTML = state.semantic.length ? '<ul class="ns-mem-facts">' + state.semantic.map(function (it) {
        return '<li>' + C.esc(it.text) + '</li>';
      }).join('') + '</ul>' : C.EmptyState({ icon: '📚', message: '知識アイテムがありません。' });
    }
    var epi = el('storeEpi');
    if (epi) {
      epi.innerHTML = state.episodic.length ? '<div class="ns-mem-list">' + state.episodic.map(function (e) {
        return '<div class="ns-mem-event"><span class="ns-mem-ts">' + C.esc(fmtTs(e.ts)) + '</span>' + C.esc(e.text) + '</div>';
      }).join('') + '</div>' : C.EmptyState({ icon: '🕑', message: 'イベントがありません。' });
    }
  }

  function fmtTs(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ===================== b) Compression ===================== */
  function renderCompression() {
    var out = el('cmpOut'); if (!out) return;
    var text = el('cmpIn') ? el('cmpIn').value : shortText();
    if (!text.trim()) { out.innerHTML = C.EmptyState({ icon: '🗜', message: '圧縮対象テキストがありません。' }); return; }
    var fakeTurns = [{ text: text }];
    var res = M.compress(fakeTurns, state.compress.nSentences);
    var pct = Math.round(res.ratio * 100);
    out.innerHTML =
      '<div class="ns-grid" style="--cols:3">' +
        C.Metric({ label: 'Before', value: res.beforeChars, unit: 'c' }) +
        C.Metric({ label: 'After', value: res.afterChars, unit: 'c' }) +
        C.Metric({ label: '残存文', value: res.sentences.length, unit: '文' }) +
      '</div>' +
      C.ProgressBar({ label: '削減率', percent: pct }) +
      '<div class="ns-mem-summary">' +
        (res.summary ? C.esc(res.summary) : '<span class="ns-empty__hint">要約可能な文がありません。</span>') +
      '</div>' +
      '<p class="ns-empty__hint">※ 抽出型の簡易要約です。原文の文を頻度スコアで選抜しています（生成・言い換えはしません）。</p>';
  }

  /* ===================== c) Summary ===================== */
  function renderSummary() {
    var out = el('sumOut'); if (!out) return;
    var text = el('sumIn') ? el('sumIn').value : state.summary.text;
    var sents = NSCode.research.summarize(text, state.summary.nSentences);
    if (!sents.length) { out.innerHTML = C.EmptyState({ icon: '📝', message: '要約できる文がありません（テキストを増やしてください）。' }); return; }
    out.innerHTML = '<ul class="ns-mem-bullets">' + sents.map(function (s) {
      return '<li>' + C.esc(s) + '</li>';
    }).join('') + '</ul>';
  }

  /* ===================== d) Recall ===================== */
  function renderRecall() {
    var out = el('rqOut'); if (!out) return;
    if (!state.semantic.length) {
      out.innerHTML = C.EmptyState({ icon: '🧠', message: 'Semantic メモリが空です（Viewer で追加してください）。' });
      return;
    }
    var ranked = M.recall(state.recall.query, state.semantic, state.recall.k);
    out.innerHTML = ranked.map(function (h, i) {
      var pct = Math.max(0, Math.round(h.score * 100));
      return '<div class="ns-hit"><div class="ns-hit__head"><span>#' + (i + 1) + '</span>' +
        '<span class="ns-hit__score">cos ' + h.score.toFixed(3) + '</span></div>' +
        '<div class="ns-progress"><div class="ns-progress__fill" style="width:' + pct + '%"></div></div>' +
        '<p class="ns-hit__text">' + C.esc(h.text) + '</p></div>';
    }).join('') +
    '<p class="ns-empty__hint">※ コサイン類似度は本物ですが、埋め込みは語彙ベースのハッシュトリック（同じ語の有無に敏感／意味の汎化は限定的）です。</p>';
  }

  /* ===================== route registration ===================== */
  // ONE page: base route + every former sub-route as an alias.
  var ROUTES = ['#/memory', '#/memory/viewer', '#/memory/compression', '#/memory/summary', '#/memory/recall'];
  ROUTES.forEach(function (route) {
    NSCode.registerView({ route: route, module: 'memory', title: 'Memory Lab', render: render, onMount: onMount });
  });
})(window.NSCode);

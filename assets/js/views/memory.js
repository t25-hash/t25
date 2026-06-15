/* Memory Lab (MEM) — an offline, deterministic tour of agent memory.
 * Four stores (Short / Long / Semantic / Episodic) are shared across tabs and
 * persisted, so adding a turn in Viewer feeds Compression, and Semantic items
 * power Recall. All processing is heuristic & local (no LLM / no backend):
 *  - compression/summary  -> NSCode.research.summarize (frequency-based)
 *  - recall               -> NSCode.embeddings cosine (lexical hashing trick) */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, M = NSCode.memory;

  var tabs = [
    { id: 'viewer', label: 'Memory Viewer', route: '#/memory/viewer' },
    { id: 'compression', label: 'Compression', route: '#/memory/compression' },
    { id: 'summary', label: 'Summary', route: '#/memory/summary' },
    { id: 'recall', label: 'Recall', route: '#/memory/recall' }
  ];

  var SEED_SEMANTIC = [
    { text: 'RAG（検索拡張生成）は外部知識を検索してプロンプトに注入し、回答の事実性を高める手法です。' },
    { text: 'エージェントは観察・思考・行動のループを回し、ツールを使ってタスクを達成します。' },
    { text: 'ベクトル埋め込みはテキストを数値ベクトルに変換し、意味的な類似度を計算可能にします。' },
    { text: 'チャンク分割は長い文書を小さな断片に分け、検索の粒度と精度を調整します。' },
    { text: 'プロンプトエンジニアリングは指示・文脈・例示を設計してモデルの出力を制御します。' },
    { text: 'メモリは短期（会話履歴）と長期（永続知識）に分かれ、文脈の継続を支えます。' }
  ];

  var DEFAULT_SHORT = [
    { role: 'user', text: 'エージェントのメモリにはどんな種類がありますか？' },
    { role: 'assistant', text: '主に短期メモリ（直近の会話履歴）と長期メモリ（永続化された事実）があります。さらに意味記憶（知識）とエピソード記憶（出来事）に分けて考えることもあります。' },
    { role: 'user', text: '会話が長くなったらどうやって扱うの？' },
    { role: 'assistant', text: '長くなった会話履歴は要約して圧縮し、重要な情報だけを残してコンテキスト長を節約します。これをメモリ圧縮と呼びます。' }
  ];

  var DEFAULT_SUMMARY_TEXT =
    'メモリはエージェントが文脈を保持するための仕組みです。短期メモリは直近の会話履歴を保持し、応答の一貫性を支えます。' +
    '会話が長くなるとコンテキスト長を超えるため、古い履歴は要約して圧縮します。長期メモリは重要な事実を永続化し、セッションをまたいで参照できます。' +
    '意味記憶は一般的な知識を、エピソード記憶は時刻付きの出来事を蓄えます。想起では、クエリと各記憶の類似度を計算して関連する記憶を取り出します。' +
    'これらを組み合わせることで、エージェントは限られたコンテキストの中でも一貫した振る舞いを実現できます。';

  /* ---------- shared persisted state ---------- */
  var state = NSCode.api.labState('#/memory') || {};
  state = Object.assign({
    short: DEFAULT_SHORT.slice(),
    long: ['ユーザーの優先言語は日本語。', 'プロジェクト名は NSCode。'],
    semantic: SEED_SEMANTIC.slice(),
    episodic: [],
    compress: { text: '', nSentences: 3, fromShort: true },
    summary: { text: DEFAULT_SUMMARY_TEXT, nSentences: 3 },
    recall: { query: 'メモリの圧縮と要約について', k: 4 }
  }, state);

  function persist() { NSCode.api.labState('#/memory', state); }
  function el(id) { return document.getElementById(id); }
  function range(id, min, max, step, val) {
    return '<input id="' + id + '" class="ns-range" type="range" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + val + '">';
  }
  function header(s) {
    return C.PageHeader({ title: s.title, purpose: s.purpose, breadcrumb: ['Memory Lab', s.title] }) + C.Tabs(tabs, s.route);
  }
  function shortText() {
    return state.short.map(function (t) { return t.text; }).join(' ');
  }

  /* ============================================================
   * Memory Viewer
   * ============================================================ */
  NSCode.registerView({
    route: '#/memory/viewer', module: 'memory', title: 'Memory Viewer',
    render: function () {
      return header({ title: 'Memory Viewer', purpose: '4種のメモリストアを確認・編集', route: '#/memory/viewer' }) +
        C.Panel({ title: 'メモリ概況', hint: '各ストアの件数', body: '<div id="memCounts"></div>' }) +
        C.Panel({ title: '会話ターンを追加', hint: 'Short メモリと Episodic イベントに同時追記',
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
        '</div>';
    },
    onMount: function () {
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
      el('clearSem').addEventListener('click', function () { state.semantic = []; persist(); renderViewer(); });
      el('clearEpi').addEventListener('click', function () { state.episodic = []; persist(); renderViewer(); });
      renderViewer();
    }
  });

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

  /* ============================================================
   * Compression Viewer
   * ============================================================ */
  NSCode.registerView({
    route: '#/memory/compression', module: 'memory', title: 'Compression Viewer',
    render: function () {
      var c = state.compress;
      var initial = c.fromShort ? shortText() : (c.text || shortText());
      return header({ title: 'Compression Viewer', purpose: '長い会話履歴を要約して圧縮（コンテキスト節約）', route: '#/memory/compression' }) +
        C.Panel({ title: '圧縮対象テキスト', hint: '初期値は Short メモリの結合。編集も可能',
          body: '<div class="ns-actions"><button id="loadShort" class="ns-btn ns-btn--ghost">Short メモリを読込</button></div>' +
            '<textarea id="cmpIn" class="ns-input" rows="6">' + C.esc(initial) + '</textarea>' }) +
        C.Panel({ title: '設定', hint: 'frequency-based 抽出型要約（LLM 不使用）', body: C.Controls([
          { label: '目標文数: <b id="vcmpN">' + c.nSentences + '</b>', control: range('cmpN', 1, 8, 1, c.nSentences) }
        ]) }) +
        C.Panel({ title: '圧縮結果', hint: 'before / after 文字数と削減率', body: '<div id="cmpOut"></div>' });
    },
    onMount: function () {
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
      renderCompression();
    }
  });

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

  /* ============================================================
   * Summary Viewer
   * ============================================================ */
  NSCode.registerView({
    route: '#/memory/summary', module: 'memory', title: 'Summary Viewer',
    render: function () {
      var s = state.summary;
      return header({ title: 'Summary Viewer', purpose: '文書を要点（箇条書き）に要約', route: '#/memory/summary' }) +
        C.Panel({ title: '入力テキスト', body: '<textarea id="sumIn" class="ns-input" rows="7">' + C.esc(s.text) + '</textarea>' }) +
        C.Panel({ title: '設定', hint: 'frequency-based 抽出型要約（LLM 不使用）', body: C.Controls([
          { label: '要約文数: <b id="vsumN">' + s.nSentences + '</b>', control: range('sumN', 1, 8, 1, s.nSentences) }
        ]) }) +
        C.Panel({ title: '要約', hint: '選抜された文を箇条書きで表示', body: '<div id="sumOut"></div>' });
    },
    onMount: function () {
      el('sumIn').addEventListener('input', function () {
        state.summary.text = el('sumIn').value; persist(); renderSummary();
      });
      el('sumN').addEventListener('input', function () {
        state.summary.nSentences = +el('sumN').value;
        el('vsumN').textContent = state.summary.nSentences;
        persist(); renderSummary();
      });
      renderSummary();
    }
  });

  function renderSummary() {
    var out = el('sumOut'); if (!out) return;
    var text = el('sumIn') ? el('sumIn').value : state.summary.text;
    var sents = NSCode.research.summarize(text, state.summary.nSentences);
    if (!sents.length) { out.innerHTML = C.EmptyState({ icon: '📝', message: '要約できる文がありません（テキストを増やしてください）。' }); return; }
    out.innerHTML = '<ul class="ns-mem-bullets">' + sents.map(function (s) {
      return '<li>' + C.esc(s) + '</li>';
    }).join('') + '</ul>';
  }

  /* ============================================================
   * Recall Viewer
   * ============================================================ */
  NSCode.registerView({
    route: '#/memory/recall', module: 'memory', title: 'Recall Viewer',
    render: function () {
      var r = state.recall;
      return header({ title: 'Recall Viewer', purpose: 'クエリに近い Semantic メモリをコサイン類似度で想起', route: '#/memory/recall' }) +
        C.Panel({ title: 'クエリ', body: '<input id="rqQuery" class="ns-input" value="' + C.esc(r.query) + '">' }) +
        C.Panel({ title: '設定', hint: 'lexical なハッシュ埋め込みの類似度（学習済みニューラル埋め込みではありません）', body: C.Controls([
          { label: 'TopK: <b id="vrqK">' + r.k + '</b>', control: range('rqK', 1, 6, 1, r.k) }
        ]) }) +
        C.Panel({ title: '想起結果', hint: 'Semantic メモリを類似度順に表示', body: '<div id="rqOut"></div>' });
    },
    onMount: function () {
      function upd() {
        state.recall.query = el('rqQuery').value;
        state.recall.k = +el('rqK').value;
        el('vrqK').textContent = state.recall.k;
        persist(); renderRecall();
      }
      el('rqQuery').addEventListener('input', upd);
      el('rqK').addEventListener('input', upd);
      renderRecall();
    }
  });

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
})(window.NSCode);

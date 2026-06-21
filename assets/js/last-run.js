/* NSCode lastRun — the most recent Ask pipeline run, shared so every sidebar Lab
 * can visualize the SAME query through its own stage. Ask is the driver; each Lab
 * is an inspector. This file also owns the canonical ANSWER-GENERATION FLOW (the
 * ordered pipeline), reused by the per-Lab "連動ビュー" card AND by the How-To page
 * (the end-to-end summary). So the order/labels are defined once, here. */
(function (NSCode) {
  'use strict';
  var KEY = 'ask.lastRun', current = null;
  try { current = NSCode.store ? NSCode.store.get(KEY, null) : null; } catch (e) {}

  function set(run) { current = run; try { if (NSCode.store) NSCode.store.set(KEY, run); } catch (e) {} }
  function get() { return current; }
  function query() { return current && current.query ? current.query : ''; }
  function context(n) {
    if (!current || !current.hits) return '';
    return current.hits.slice(0, n || current.hits.length).map(function (h) { return h.text; }).join('\n\n');
  }

  function esc(s) { return NSCode.C ? NSCode.C.esc(s) : String(s == null ? '' : s); }
  function chips(arr) { return (arr || []).map(function (t) { return '<span class="ns-tag">' + esc(t) + '</span>'; }).join(' '); }
  function hitList(run, n) {
    return '<div>' + (run.hits || []).slice(0, n || 4).map(function (h, i) {
      var t = h.text || '';
      return '<div class="ns-hit"><div class="ns-hit__head"><span>#' + (i + 1) + ' · ' + esc(h.source) + '</span>' +
        '<span class="ns-hit__score">score ' + (h.score != null ? h.score.toFixed(2) : '—') + '</span></div>' +
        '<p class="ns-hit__text">' + esc(t.slice(0, 160)) + (t.length > 160 ? '…' : '') + '</p></div>';
    }).join('') + '</div>';
  }
  function answerHtml(run) {
    if (run.weak || (!run.generated && !(run.answer && run.answer.length))) return '<p class="ns-empty__hint">十分一致する記述が無く「該当なし」でした。</p>';
    var h = '<p class="ns-qa-answer__lead">' + esc(run.generated || (run.answer || []).join('\n')).replace(/\n/g, '<br>') + '</p>';
    if (run.source) h += '<div class="ns-qa-answer__src">出典: <span class="ns-tag">' + esc(run.source) + '</span></div>';
    return h;
  }

  /* ---- canonical answer-generation flow (one source of truth) ---------------- */
  var FLOW = [
    { key: 'ask',        route: '#/ask',        icon: '🍼', label: '質問・意図理解',     stage: '入力' },
    { key: 'rag',        route: '#/rag',        icon: '🔎', label: '検索（RAG）',        stage: '検索' },
    { key: 'embedding',  route: '#/embedding',  icon: '🧮', label: 'ベクトル化',          stage: '表現' },
    { key: 'neural',     route: '#/neural',     icon: '🧠', label: '学習・重み',          stage: '学習' },
    { key: 'memory',     route: '#/memory',     icon: '📝', label: '想起・要約',          stage: '記憶' },
    { key: 'grammar',    route: '#/grammar',    icon: '🔧', label: '文法整形（回答）',     stage: '生成' },
    { key: 'agent',      route: '#/agent',      icon: '🤖', label: 'エージェントのループ', stage: '俯瞰' },
    { key: 'evaluation', route: '#/evaluation', icon: '📊', label: '検索品質の評価',       stage: '評価' }
  ];
  function flowIndex(k) { for (var i = 0; i < FLOW.length; i++) if (FLOW[i].key === k) return i; return -1; }

  /* ---- per-stage lens on the same run (detailed) ---------------------------- */
  var STAGE = {
    ask: function (run) {
      return '<p class="ns-empty__hint">質問:「<b>' + esc(run.query) + '</b>」</p>' +
        '<p class="ns-empty__hint">意図分類: <b>' + esc(run.intent || '—') + '</b></p>' +
        '<p class="ns-empty__hint">抽出キーワード（検索の核）: ' + (run.keyTerms && run.keyTerms.length ? chips(run.keyTerms) : '（特定語なし＝汎用検索）') + '</p>';
    },
    rag: function (run) {
      var docs = (run.topDocs && run.topDocs.length)
        ? '<p class="ns-empty__hint">① 索引から関連<b>文書を選定</b>（BM25＋タイトル一致）:</p><p class="ns-empty__hint">' + chips(run.topDocs) + '</p>' : '';
      return docs + '<p class="ns-empty__hint">② <b>チャンクを検索</b>（類似度順）:</p>' + hitList(run, 4) +
        '<p class="ns-empty__hint">→ この文脈を根拠に回答を構成します。</p>';
    },
    embedding: function (run) {
      var v = (run.qvec || []).slice(0, 12).map(function (x) { return Number(x).toFixed(2); }).join(', ');
      return '<p class="ns-empty__hint">クエリ「' + esc(run.query) + '」を<b>ベクトル化</b>（先頭12次元）:</p>' +
        '<pre class="ns-code">[' + v + ' …]</pre>' +
        '<p class="ns-empty__hint">このベクトルと各チャンクの<b>コサイン類似度</b>で検索順位を決めます ↓</p>' + hitList(run, 3);
    },
    neural: function (run) {
      return '<p class="ns-empty__hint">検索した文脈だけを<b>極小ニューラルが学習</b>' +
        (run.loss != null ? '（loss ' + Number(run.loss).toFixed(3) + '）' : '') + '、その重みで根拠文を選び直します。</p>' +
        '<p class="ns-empty__hint">「' + esc(run.query) + '」への回答:</p>' + answerHtml(run) +
        (run.learned ? '<p class="ns-empty__hint">👍 学習済みの回答を再利用しました。</p>' : '');
    },
    memory: function (run) {
      return (run.memo ? '<p class="ns-empty__hint">🧠 文脈を<b>圧縮・要約</b>したメモリ: ' + esc(run.memo) + '</p>' : '<p class="ns-empty__hint">この質問では要約メモリは作られませんでした。</p>') +
        '<p class="ns-empty__hint">「' + esc(run.query) + '」で<b>想起</b>した文脈（検索＝意味メモリの recall）:</p>' + hitList(run, 3);
    },
    grammar: function (run) {
      var sents = run.sml || [];
      var head = '<p class="ns-empty__hint">抽出文を<b>SML（意味単位）へ分解→自然文へ正規化</b>:</p>' +
        '<p class="ns-qa-answer__lead">' + esc(run.normalized || run.generated || '（回答なし）') + '</p>';
      if (!sents.length) return head;
      var KEYS = ['subject', 'time', 'place', 'object', 'destination', 'action', 'adjective', 'actionSurface'];
      return head + sents.slice(0, 3).map(function (p) {
        var sml = p.sml || {}, slots = KEYS.filter(function (k) { return sml[k]; }).map(function (k) { return k + '=' + sml[k]; }).join(' ／ ');
        return '<div class="ns-hit"><div class="ns-hit__head"><span>SML' + (p.applied ? '（正規化）' : '（原文保持）') + '</span></div><p class="ns-hit__text">' + esc(slots || '—') + '</p></div>';
      }).join('');
    },
    agent: function (run) {
      return '<p class="ns-empty__hint">Ask 全体を1つの<b>エージェントループ</b>として俯瞰すると:</p>' +
        '<pre class="ns-code">Plan    : 知識ベースを検索する\nAction  : search_kb("' + esc(run.query) + '")\nObserve : ' + ((run.hits || []).length) + ' 件の関連チャンク\nThink   : 極小ニューラルが文脈を学習' + (run.loss != null ? '（loss ' + Number(run.loss).toFixed(3) + '）' : '') + '\nAnswer  : 根拠から要約（自信が低ければ「該当なし」）</pre>' + answerHtml(run);
    },
    evaluation: function (run) {
      var sc = (run.hits || []).map(function (h) { return h.score || 0; });
      var top = sc.length ? Math.max.apply(null, sc) : 0;
      var mean = sc.length ? sc.reduce(function (a, b) { return a + b; }, 0) / sc.length : 0;
      return '<p class="ns-empty__hint">直近検索の品質指標（「' + esc(run.query) + '」・BM25スコア）:</p>' +
        NSCode.C.Table(['指標', '値'], [['ヒット数', String(sc.length)], ['最高 score', top.toFixed(2)], ['平均 score', mean.toFixed(2)]]);
    }
  };
  function generic(run) {
    return '<p class="ns-empty__hint">直近の質問:「' + esc(run.query) + '」</p>' + answerHtml(run);
  }
  /* body for one stage key (used by both the card and the How-To summary) */
  function stageBody(key, run) { run = run || current; if (!run) return ''; return (STAGE[key] || generic)(run); }

  /* INGESTION stage (PDF / Research): not a per-query step, but the upstream that
   * builds the corpus Ask searches. Connect it to the flow so every sidebar Lab is
   * traceable. */
  var INGEST = {
    pdf: '抽出',
    research: '解析'
  };
  function ingestBody(key, run) {
    var verb = INGEST[key] || '取り込み';
    return '<p class="ns-empty__hint">これは回答生成の<b>前段（取り込み）</b>です。ここで' + verb +
      'した文書は <b>Ask の知識</b>に加わり、質問時に <b>検索（RAG）の対象</b>になります。</p>' +
      '<p class="ns-empty__hint">直近の質問「' + esc(run.query) + '」の流れ → ' +
      '<a href="#/rag">🔎 検索（RAG）</a> ／ <a href="#/howto">🗺️ 全体の流れ（How To）</a></p>';
  }

  /* small prev/next flow nav so the user can trace the pipeline Lab-to-Lab */
  function flowNav(key) {
    var i = flowIndex(key); if (i < 0) return '';
    var prev = FLOW[i - 1], next = FLOW[i + 1];
    var L = prev ? '<a href="' + prev.route + '">← ' + prev.icon + ' ' + esc(prev.label) + '</a>' : '<span class="ns-empty__hint">（先頭）</span>';
    var R = next ? '<a href="' + next.route + '">' + next.icon + ' ' + esc(next.label) + ' →</a>' : '<a href="#/howto">全体の流れ →</a>';
    return '<div class="ns-flownav"><span>' + L + '</span><span class="ns-empty__hint">処理の流れ ' + (i + 1) + '/' + FLOW.length + '</span><span>' + R + '</span></div>';
  }

  /* HTML panel for a Lab's module key, or '' when there is no run / on Ask itself */
  function card(moduleKey) {
    var run = get();
    if (!run || !run.query || moduleKey === 'ask') return '';
    var body;
    if (flowIndex(moduleKey) >= 0) body = stageBody(moduleKey, run) + flowNav(moduleKey);   // per-query flow stage
    else if (INGEST[moduleKey]) body = ingestBody(moduleKey, run);                           // 取り込み（前段）
    else return '';
    return NSCode.C.Panel({ title: '🔗 Ask 連動ビュー（この段の実データ）', hint: '同じ質問「' + esc(run.query) + '」をこの Lab の観点で表示（Ask が更新元）', body: body });
  }

  /* apply the latest Ask run to a Lab's state ONCE per run (tracked by ts), so the
   * Lab's own tools run on the actual question without clobbering later edits. */
  function applyTo(state, fields) {
    if (!current || !current.ts || state._askTs === current.ts) return false;
    Object.keys(fields).forEach(function (k) {
      var src = fields[k];
      var val = src === 'context' ? context() : query();
      if (val) state[k] = val;
    });
    state._askTs = current.ts;
    return true;
  }

  NSCode.lastRun = {
    set: set, get: get, query: query, context: context, card: card, applyTo: applyTo,
    flow: FLOW, stageBody: stageBody, flowNav: flowNav, answerHtml: answerHtml
  };
})(window.NSCode);

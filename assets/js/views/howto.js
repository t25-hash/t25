/* How To Answer — the SUMMARY of Ask's answer-generation flow. Type a question (or
 * reuse the last Ask run) and see it travel the whole pipeline in order:
 * 質問・意図 → 検索(RAG) → ベクトル化 → 学習/重み → 想起/要約 → 文法整形 → 回答 → 評価.
 * Each stage shows the REAL data for that question (via NSCode.lastRun) and links to
 * the Lab that visualizes that step in detail. The flow order/labels come from
 * NSCode.lastRun.flow (single source of truth). */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, A = NSCode.askEngine, LR = NSCode.lastRun;
  function el(id) { return document.getElementById(id); }
  var EX = ['歯車の種類は？', '軸受の選び方は？', '安全率とは？', '熱処理にはどんな種類がある？'];

  function stepper(active) {
    return '<div class="ns-flowsteps">' + LR.flow.map(function (s, i) {
      return '<a class="ns-flowstep' + (s.key === active ? ' is-on' : '') + '" href="' + s.route + '" title="' + C.esc(s.label) + '">' +
        '<span class="ns-flowstep__n">' + (i + 1) + '</span><span class="ns-flowstep__ic">' + s.icon + '</span>' +
        '<span class="ns-flowstep__lb">' + C.esc(s.label) + '</span></a>' +
        (i < LR.flow.length - 1 ? '<span class="ns-flowstep__arr">→</span>' : '');
    }).join('') + '</div>';
  }

  function card(n, ic, title, body, route, labName) {
    return '<section class="ns-panel ns-howto-card"><div class="ns-panel__head">' +
      '<span class="ns-panel__title">' + ic + ' <b>' + n + '.</b> ' + C.esc(title) + '</span>' +
      (route ? '<a class="ns-panel__hint" href="' + route + '">詳細 → ' + C.esc(labName) + '</a>' : '') +
      '</div><div class="ns-panel__body">' + body + '</div></section>';
  }

  function flowHtml(run) {
    return LR.flow.map(function (s, i) {
      var c = card(i + 1, s.icon, s.label, LR.stageBody(s.key, run), s.key === 'ask' ? '#/ask' : s.route, s.key === 'ask' ? 'Ask' : s.label);
      // make the final answer explicit right after 文法整形
      if (s.key === 'grammar') c += card('＝', '💬', '回答（最終出力）', LR.answerHtml(run), '#/ask', 'Ask');
      return c;
    }).join('');
  }

  function body(run) {
    if (run && run.query) return flowHtml(run);
    return '<p class="ns-empty__hint">上の入力で質問するか、<a href="#/ask">Ask</a> で質問すると、ここに ' +
      '<b>検索 → ベクトル化 → 学習 → 要約 → 文法整形 → 回答 → 評価</b> の全段が、その質問の実データで表示されます。</p>';
  }

  function render() {
    var run = LR.get();
    return C.PageHeader({ title: '🗺️ How To Answer（Ask 処理の流れ）',
      purpose: 'Ask が回答を作るまでの流れを、実際の質問でたどるサマリー。各段の詳細は対応する Lab で確認できます。' }) +
      stepper() +
      '<div class="ns-howto-ask">' +
        '<input id="htQ" class="ns-input" placeholder="質問を入力して流れを見る…（例：歯車の種類は？）" value="' + C.esc(run && run.query || '') + '">' +
        '<button id="htBtn" class="ns-btn">流れを見る</button></div>' +
      '<div class="ns-howto-chips">' + EX.map(function (q) {
        return '<button class="ns-chat__chip" data-q="' + C.esc(q) + '">' + C.esc(q) + '</button>';
      }).join('') + '</div>' +
      '<div id="htFlow">' + body(run) + '</div>';
  }

  function onMount() {
    function run(q) {
      q = (q == null ? (el('htQ') ? el('htQ').value : '') : q).trim();
      if (!q || !A) return;
      var f = el('htFlow');
      if (f) f.innerHTML = '<p class="ns-empty__hint ns-msg__thinking">考え中… 検索 → ベクトル化 → ニューラル学習 → 要約 → 整形 …</p>';
      A.hybridAnswerKB(q, {}).then(function () { NSCode.renderCurrent(); })
        .catch(function (e) { if (f) f.innerHTML = '<p class="ns-empty__hint">エラー: ' + C.esc(e && e.message ? e.message : e) + '</p>'; });
    }
    var btn = el('htBtn'); if (btn) btn.addEventListener('click', function () { run(); });
    var inp = el('htQ'); if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    var chips = document.querySelectorAll('.ns-howto-chips .ns-chat__chip');
    for (var i = 0; i < chips.length; i++) chips[i].addEventListener('click', function () { var q = this.getAttribute('data-q'); if (el('htQ')) el('htQ').value = q; run(q); });
  }

  NSCode.registerView({ route: '#/howto', module: 'howto', title: 'How To', render: render, onMount: onMount });
})(window.NSCode);

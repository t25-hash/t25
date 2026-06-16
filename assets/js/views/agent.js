/* Agent Lab (AGENT) — a working, offline ReAct-style agent simulator on ONE
 * page (no tabs). The shared GOAL is entered once at the top; Loop / Plan /
 * Reflection / Retry are stacked sections below. State (goal, autoplay) is
 * shared and persisted. All output is produced by the DETERMINISTIC rule-based
 * simulator in agent-engine.js (no LLM, no network). */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, E = NSCode.agentSim;

  var DEFAULT_GOAL = 'ポンプ P-101 の軸振動アラームの原因を調査し、対応案をまとめる';

  var state = NSCode.api.labState('#/agent') || {};
  state = Object.assign({ goal: DEFAULT_GOAL, autoplay: false }, state);

  function persist() { NSCode.api.labState('#/agent', state); }
  function el(id) { return document.getElementById(id); }

  var SIM_HINT = 'ルールベースの決定論的シミュレーション（LLM/通信なし）';

  // phase -> css modifier (colored left border)
  var PHASE_CLASS = {
    Goal: 'goal', Plan: 'plan', Action: 'action',
    Observation: 'obs', Reflection: 'reflect', Retry: 'retry'
  };
  var PHASE_LABEL = {
    Goal: 'Goal', Plan: 'Plan', Action: 'Action',
    Observation: 'Observation', Reflection: 'Reflection', Retry: 'Retry'
  };

  // a single auto-play timer; cleared whenever we (re)render the loop
  var playTimer = null;
  function clearPlay() { if (playTimer) { clearInterval(playTimer); playTimer = null; } }

  /* ===================== single-page render ===================== */
  function render() {
    return C.PageHeader({
        title: 'Agent Lab',
        purpose: 'ReAct エージェントの Loop / Planner / Reflection / Retry を1ページで可視化',
        breadcrumb: ['Agent Lab']
      }) +
      // Shared goal — entered ONCE, drives every section below.
      C.Panel({ title: 'ゴール', hint: SIM_HINT + '・編集すると各セクションが即更新', body:
        '<input id="goal" class="ns-input" value="' + C.esc(state.goal) + '">' +
        '<div class="ns-actions">' +
          '<button id="runBtn" class="ns-btn">実行</button>' +
          '<label class="ns-control ns-control--inline"><span>ステップ再生</span>' +
            '<input id="autoplay" type="checkbox"' + (state.autoplay ? ' checked' : '') + '></label>' +
        '</div>' }) +

      // a) Loop Viewer
      C.Panel({ title: 'Loop Viewer — 実行サマリ', body: '<div id="loopSummary"></div>' }) +
      C.Panel({ title: 'Loop Viewer — トレース', hint: '色付き左ボーダー＝フェーズ。✗＝失敗（意図的に1回挿入）', body: '<div id="loopOut"></div>' }) +

      // b) Planner
      C.Panel({ title: 'Planner — 生成された計画', hint: 'キーワード（テスト/修正/作成/検索…）から決定論的に生成。末尾は必ず検証ステップ。', body: '<div id="planOut"></div>' }) +

      // c) Reflection
      C.Panel({ title: 'Reflection — 実行の結果', body: '<div id="reflectOutcome"></div>' }) +
      C.Panel({ title: 'Reflection — 改善提案（チェックリスト）', hint: 'トレースの失敗/リトライ/ステップ数からヒューリスティックに導出', body: '<div id="reflectOut"></div>' }) +

      // d) Retry
      C.Panel({ title: 'Retry — 指数バックオフ', hint: SIM_HINT + '・1000→2000→4000ms のバックオフで試行3に成功', body:
        '<div class="ns-actions"><button id="retryBtn" class="ns-btn">再試行を実行</button></div>' +
        '<div id="retrySummary"></div>' +
        '<div id="retryOut"></div>' });
  }

  function onMount() {
    el('goal').addEventListener('input', function () {
      state.goal = el('goal').value; persist();
      renderLoop(); renderPlan(); renderReflection();
    });
    el('autoplay').addEventListener('change', function () { state.autoplay = el('autoplay').checked; persist(); renderLoop(); });
    el('runBtn').addEventListener('click', function () {
      state.goal = el('goal').value; persist();
      renderLoop(); renderPlan(); renderReflection();
    });
    el('retryBtn').addEventListener('click', renderRetry);
    renderLoop(); renderPlan(); renderReflection(); renderRetry();
  }

  /* ===================== Loop Viewer ===================== */
  function traceCardHtml(t, hidden) {
    var cls = 'ns-trace ns-trace--' + (PHASE_CLASS[t.phase] || 'action') + (t.ok === false ? ' is-fail' : '');
    if (hidden) cls += ' is-hidden';
    var badge = (t.ok === false ? '✗' : '✓');
    return '<div class="' + cls + '">' +
      '<div class="ns-trace__head">' +
        '<span class="ns-trace__phase">' + C.esc(PHASE_LABEL[t.phase] || t.phase) + '</span>' +
        '<span class="ns-trace__iter">iter ' + t.iter + '</span>' +
        '<span class="ns-trace__status">' + badge + '</span>' +
      '</div>' +
      '<pre class="ns-trace__body">' + C.esc(t.text) + '</pre>' +
    '</div>';
  }

  function renderLoop() {
    clearPlay();
    var out = el('loopOut'), sum = el('loopSummary');
    if (!out) return;
    var trace = E.run(state.goal);
    var iters = trace.reduce(function (m, t) { return Math.max(m, t.iter); }, 0);
    var failed = trace.some(function (t) { return t.ok === false; });
    var verified = trace.some(function (t) { return t.phase === 'Observation' && /成功|緑/.test(t.text); });

    sum.innerHTML = '<div class="ns-grid" style="--cols:3">' +
      C.Metric({ label: '反復 (iteration)', value: iters }) +
      C.Metric({ label: 'トレース項目', value: trace.length }) +
      C.Metric({ label: '最終結果', value: verified ? '成功 ✓' : (failed ? '失敗' : '—') }) +
    '</div>';

    var auto = state.autoplay;
    out.innerHTML = trace.map(function (t) { return traceCardHtml(t, auto); }).join('');

    if (auto) {
      var cards = out.querySelectorAll('.ns-trace');
      var i = 0;
      playTimer = setInterval(function () {
        if (i >= cards.length) { clearPlay(); return; }
        cards[i].classList.remove('is-hidden');
        i++;
      }, 650);
    }
  }

  /* ===================== Planner ===================== */
  function renderPlan() {
    var out = el('planOut'); if (!out) return;
    var steps = E.plan(state.goal);
    if (!steps.length) { out.innerHTML = C.EmptyState({ icon: '🗺️', message: 'ゴールを入力してください。' }); return; }
    out.innerHTML = '<ol class="ns-plan">' + steps.map(function (s, i) {
      var verify = /検証/.test(s);
      return '<li class="ns-plan__step' + (verify ? ' is-verify' : '') + '">' +
        '<span class="ns-step__no">' + (i + 1) + '</span>' +
        '<span class="ns-plan__text">' + C.esc(s) + (verify ? ' <span class="ns-tag">verify</span>' : '') + '</span>' +
      '</li>';
    }).join('') + '</ol>';
  }

  /* ===================== Reflection ===================== */
  function renderReflection() {
    var out = el('reflectOut'), outcome = el('reflectOutcome'); if (!out) return;
    var trace = E.run(state.goal);
    var suggestions = E.reflect(trace);
    var fails = trace.filter(function (t) { return t.ok === false; }).length;
    var retries = trace.filter(function (t) { return t.phase === 'Retry'; }).length;
    var verified = trace.some(function (t) { return t.phase === 'Observation' && /成功|緑/.test(t.text); });

    outcome.innerHTML = '<div class="ns-grid" style="--cols:3">' +
      C.Metric({ label: '失敗 (observed)', value: fails }) +
      C.Metric({ label: 'リトライ', value: retries }) +
      C.Metric({ label: '最終結果', value: verified ? '成功 ✓' : '未達' }) +
    '</div>';

    out.innerHTML = '<ul class="ns-checklist">' + suggestions.map(function (s) {
      return '<li class="ns-checklist__item"><span class="ns-checklist__box">☑</span>' + C.esc(s) + '</li>';
    }).join('') + '</ul>';
  }

  /* ===================== Retry ===================== */
  function renderRetry() {
    var out = el('retryOut'), sum = el('retrySummary'); if (!out) return;
    var attempts = E.retryDemo();
    var total = attempts.reduce(function (s, a) { return s + a.backoff_ms; }, 0);
    var success = attempts.filter(function (a) { return a.ok; }).length;

    sum.innerHTML = '<div class="ns-grid" style="--cols:3">' +
      C.Metric({ label: '試行回数', value: attempts.length }) +
      C.Metric({ label: '累積待機', value: total, unit: 'ms' }) +
      C.Metric({ label: '結果', value: success ? '成功 ✓' : '失敗' }) +
    '</div>';

    out.innerHTML = '<div class="ns-retry">' + attempts.map(function (a) {
      var ok = a.ok;
      var pct = a.backoff_ms ? Math.round(a.backoff_ms / 4000 * 100) : 100;
      return '<div class="ns-retry__row ' + (ok ? 'is-ok' : 'is-bad') + '">' +
        '<span class="ns-retry__n">試行 ' + a.n + '</span>' +
        '<span class="ns-retry__status">' + (ok ? '✓' : '✗') + '</span>' +
        '<span class="ns-retry__action">' + C.esc(a.action) + '</span>' +
        '<span class="ns-retry__backoff">' + (a.backoff_ms ? 'backoff ' + a.backoff_ms + 'ms' : '即時') + '</span>' +
        '<div class="ns-progress ns-retry__bar"><div class="ns-progress__fill" style="width:' + pct + '%"></div></div>' +
      '</div>';
    }).join('') + '</div>' +
    '<p class="ns-empty__hint">※ バックオフ時間は決定論的な固定値です（実際の待機は行いません）。</p>';
  }

  /* ===================== route registration ===================== */
  // ONE page: base route + every former sub-route as an alias.
  var ROUTES = ['#/agent', '#/agent/loop', '#/agent/planner', '#/agent/reflection', '#/agent/retry'];
  ROUTES.forEach(function (route) {
    NSCode.registerView({ route: route, module: 'agent', title: 'Agent Lab', render: render, onMount: onMount });
  });
})(window.NSCode);

/* Tool Calling Lab (TOOL) — an offline, deterministic walkthrough of LLM
 * "tool use" on ONE page (no tabs). State (selected tool, goal, execution log)
 * is shared across sections and persisted.
 * Registry -> pick a tool, Selection -> see why a tool is chosen for a goal,
 * Execution -> run a tool and inspect the simulated call log. */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, T = NSCode.tools;

  var CAT_LABEL = { read: '読み取り', write: '書き込み', exec: '実行' };

  var DEFAULT_GOAL = '教科書から歯車に関する記述を検索して一覧化する';

  var state = NSCode.api.labState('#/tools') || {};
  state = Object.assign({
    selected: 'Search',   // tool selected from the Registry, used by Execution
    goal: DEFAULT_GOAL,   // Selection goal
    args: {},             // { ToolName: { paramName: value } } sticky arg inputs
    log: []               // execution log entries (most recent first)
  }, state);

  function persist() { NSCode.api.labState('#/tools', state); }
  function el(id) { return document.getElementById(id); }

  /* dynamic: the tool-selection goal reflects the latest Ask query */
  function syncFromAsk() {
    var r = NSCode.lastRun && NSCode.lastRun.get();
    if (r && r.query) { state.goal = r.query; persist(); }
  }
  function catBadge(cat) {
    return '<span class="ns-toolcat ns-toolcat--' + cat + '">' + C.esc(CAT_LABEL[cat] || cat) + '</span>';
  }
  function getArgs(toolName) {
    if (!state.args[toolName]) state.args[toolName] = {};
    return state.args[toolName];
  }

  /* ============================================================ Single page */
  function render() {
    var opts = T.list().map(function (t) {
      var sel = t.name === state.selected ? ' selected' : '';
      return '<option value="' + C.esc(t.name) + '"' + sel + '>' + C.esc(t.name) + ' (' + C.esc(CAT_LABEL[t.category]) + ')</option>';
    }).join('');

    return C.PageHeader({
        title: 'Tool Calling Lab',
        purpose: 'LLM の「ツール利用」をオフラインかつ決定論的に体験します。ツールを選び、ゴールに対する選択理由を見て、実行ログを確認します。'
      }) +
      // a) Tool Registry
      C.Panel({
        title: 'Tool Registry',
        hint: 'カードをクリックすると実行対象ツールになります（すべてモックツール）',
        body: '<div id="toolGrid"></div>'
      }) +
      // b) Selection Viewer
      C.Panel({
        title: 'Selection Viewer',
        hint: 'スコア = ゴール語のうち一致した割合（lexical overlap・LLM 不使用）',
        body:
          '<label class="ns-control"><span>ゴール</span>' +
          '<input id="goal" class="ns-input" value="' + C.esc(state.goal) + '" placeholder="例: ' + C.esc(DEFAULT_GOAL) + '"></label>' +
          '<div id="selOut"></div>'
      }) +
      // c) Execution Viewer
      '<div id="execMetrics"></div>' +
      C.Panel({
        title: 'Execution Viewer',
        hint: '出力・所要時間はすべて引数のハッシュから決定論的に生成（モック）',
        body:
          C.Controls([{ label: 'ツール', control: '<select id="execTool" class="ns-input">' + opts + '</select>' }]) +
          '<div id="execArgs" class="ns-controls"></div>' +
          '<div class="ns-actions"><button id="execRun" class="ns-btn">実行</button>' +
          '<button id="execClear" class="ns-btn ns-btn--ghost">ログをクリア</button></div>'
      }) +
      C.Panel({ title: '実行ログ', hint: '新しい呼び出しを先頭に追加', body: '<div id="execLog"></div>' });
  }

  function onMount() {
    syncFromAsk();
    if (el('goal')) el('goal').value = state.goal;
    // Registry
    var grid = el('toolGrid');
    grid.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.ns-toolcard') : null;
      if (!card) return;
      state.selected = card.getAttribute('data-tool');
      persist();
      renderRegistry();
      syncExecTool();
      renderArgFields();
    });

    // Selection
    el('goal').addEventListener('input', function () {
      state.goal = el('goal').value; persist(); renderSelection();
    });

    // Execution
    var sel = el('execTool');
    sel.addEventListener('change', function () {
      state.selected = sel.value; persist(); renderArgFields(); renderRegistry();
    });
    el('execRun').addEventListener('click', runExecution);
    el('execClear').addEventListener('click', function () {
      state.log = []; persist(); renderLog(); renderMetrics();
    });

    renderRegistry();
    renderSelection();
    renderArgFields();
    renderLog();
    renderMetrics();
  }

  function syncExecTool() {
    var sel = el('execTool'); if (sel) sel.value = state.selected;
  }

  /* ---- a) Tool Registry ---- */
  function renderRegistry() {
    var out = el('toolGrid'); if (!out) return;
    var cards = T.list().map(function (tool) {
      var active = tool.name === state.selected ? ' is-selected' : '';
      var params = tool.params.map(function (p) {
        return '<code class="ns-toolparam">' + C.esc(p.name) + ':' + C.esc(p.type) + '</code>';
      }).join(' ');
      return '<div class="ns-card ns-toolcard' + active + '" data-tool="' + C.esc(tool.name) + '" role="button" tabindex="0">' +
        '<div class="ns-toolcard__top"><span class="ns-toolcard__icon">' + tool.icon + '</span>' +
        catBadge(tool.category) + '</div>' +
        '<h3 class="ns-card__title">' + C.esc(tool.name) +
        (active ? ' <span class="ns-toolcard__pick">✓ 選択中</span>' : '') + '</h3>' +
        '<div class="ns-card__body">' + C.esc(tool.description) + '</div>' +
        '<div class="ns-toolcard__params">' + (params || '<span class="ns-empty__hint">引数なし</span>') + '</div>' +
        '</div>';
    }).join('');
    out.innerHTML = C.Grid(cards, 3) +
      '<p class="ns-empty__hint">選択中: <b>' + C.esc(state.selected) + '</b> — Execution Viewer で実行できます。</p>';
  }

  /* ---- b) Selection Viewer ---- */
  function renderSelection() {
    var out = el('selOut'); if (!out) return;
    var ranked = T.selectTool(state.goal);
    if (!state.goal.trim()) { out.innerHTML = C.EmptyState({ icon: '🎯', message: 'ゴールを入力するとツール候補が表示されます。' }); return; }
    out.innerHTML = ranked.map(function (r) {
      var pct = Math.round(r.score * 100);
      var chosen = r.chosen ? ' is-chosen' : '';
      var tool = r.tool;
      return '<div class="ns-toolrank' + chosen + '">' +
        '<div class="ns-toolrank__head">' +
          '<span class="ns-toolrank__name">' + tool.icon + ' ' + C.esc(tool.name) + ' ' + catBadge(tool.category) +
          (r.chosen ? ' <span class="ns-toolrank__chosen">★ 選択</span>' : '') + '</span>' +
          '<span class="ns-hit__score">' + pct + '%</span>' +
        '</div>' +
        '<div class="ns-progress"><div class="ns-progress__fill" style="width:' + pct + '%"></div></div>' +
        '<p class="ns-toolrank__reason">' + C.esc(r.reason) + '</p>' +
        '</div>';
    }).join('') +
    '<p class="ns-empty__hint">※ 実際のエージェントは説明文の意味やスキーマで選択しますが、ここでは決定論的なキーワード一致で近似しています。</p>';
  }

  /* ---- c) Execution Viewer ---- */
  function renderMetrics() {
    var out = el('execMetrics'); if (!out) return;
    var runs = state.log.length;
    var ok = state.log.filter(function (e) { return e.ok; }).length;
    var avg = runs ? Math.round(state.log.reduce(function (s, e) { return s + e.latency_ms; }, 0) / runs) : 0;
    out.innerHTML = '<div class="ns-grid" style="--cols:3">' +
      C.Metric({ label: '総実行回数', value: runs }) +
      C.Metric({ label: '成功 (ok)', value: ok }) +
      C.Metric({ label: '平均レイテンシ', value: avg, unit: 'ms' }) +
      '</div>';
  }

  function renderArgFields() {
    var out = el('execArgs'); if (!out) return;
    var tool = T.get(state.selected);
    if (!tool) { out.innerHTML = ''; return; }
    var stored = getArgs(tool.name);
    out.innerHTML = tool.params.map(function (p) {
      var val = stored[p.name] == null ? '' : stored[p.name];
      return '<label class="ns-control"><span>' + C.esc(p.name) + ' <em class="ns-toolparam__type">' + C.esc(p.type) + '</em></span>' +
        '<input class="ns-input ns-execarg" data-param="' + C.esc(p.name) + '" value="' + C.esc(val) + '" placeholder="' + C.esc(p.placeholder || '') + '"></label>';
    }).join('') || '<p class="ns-empty__hint">このツールに引数はありません。</p>';

    var inputs = out.querySelectorAll('.ns-execarg');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener('input', function (e) {
        getArgs(tool.name)[e.target.getAttribute('data-param')] = e.target.value;
        persist();
      });
    }
  }

  function runExecution() {
    var tool = T.get(state.selected); if (!tool) return;
    var args = {};
    var stored = getArgs(tool.name);
    tool.params.forEach(function (p) { args[p.name] = stored[p.name] == null ? '' : stored[p.name]; });
    var res = tool.execute(args);
    state.log.unshift({
      id: 't_' + Date.now(),
      tool: tool.name, icon: tool.icon, category: tool.category,
      args: args, ok: res.ok, output: res.output,
      latency_ms: res.latency_ms, steps: res.steps || [],
      at: new Date().toLocaleTimeString()
    });
    if (state.log.length > 50) state.log = state.log.slice(0, 50);
    persist();
    renderLog();
    renderMetrics();
  }

  function renderLog() {
    var out = el('execLog'); if (!out) return;
    if (!state.log.length) { out.innerHTML = C.EmptyState({ icon: '🧾', message: 'まだ実行ログはありません。「実行」を押してください。' }); return; }
    out.innerHTML = state.log.map(function (e) {
      var steps = e.steps.map(function (s, i) {
        return '<li><span class="ns-toollog__stepn">' + (i + 1) + '</span>' + C.esc(s) + '</li>';
      }).join('');
      return '<div class="ns-toollog ' + (e.ok ? 'is-ok' : 'is-bad') + '">' +
        '<div class="ns-toollog__head">' +
          '<span class="ns-toollog__name">' + e.icon + ' ' + C.esc(e.tool) + ' ' + catBadge(e.category) + '</span>' +
          '<span class="ns-toollog__meta">' +
            '<span class="ns-toollog__status">' + (e.ok ? '✓ ok' : '✗ fail') + '</span>' +
            '<span class="ns-hit__score">' + e.latency_ms + ' ms</span>' +
            '<span class="ns-toollog__time">' + C.esc(e.at) + '</span>' +
          '</span>' +
        '</div>' +
        '<div class="ns-toollog__args">args: <code>' + C.esc(JSON.stringify(e.args)) + '</code></div>' +
        '<div class="ns-toollog__cols">' +
          '<div><div class="ns-toollog__label">steps</div><ol class="ns-toollog__steps">' + steps + '</ol></div>' +
          '<div><div class="ns-toollog__label">output</div><pre class="ns-code">' + C.esc(e.output) + '</pre></div>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  /* ---- Register ONE page for base route + former sub-routes (aliases) ---- */
  ['#/tools', '#/tools/registry', '#/tools/selection', '#/tools/execution'].forEach(function (route) {
    NSCode.registerView({
      route: route, module: 'tools', title: 'Tool Calling Lab',
      render: render, onMount: onMount
    });
  });
})(window.NSCode);

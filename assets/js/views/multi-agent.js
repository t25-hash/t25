/* Multi-Agent Lab (MULTI) — visualize how a team of role-based agents
 * coordinate on a single goal. ONE page (no tabs): a shared goal control
 * at the top, then stacked sections — Chat (transcript), Task Distribution
 * (tasks + per-role summary), and Consensus (proposal + votes + decision).
 * Goal text is shared across sections and persisted. All simulation is
 * DETERMINISTIC and OFFLINE (rule-based, no LLM) — see multiagent-engine.js. */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, M = NSCode.multiAgent;

  var DEFAULT_GOAL = '新機能のログイン画面を設計・実装・テストする';
  var SIM_HINT = 'キーワード規則＋シード値による決定的シミュレーション（LLM 非使用）';

  var state = NSCode.api.labState('#/multi-agent') || {};
  state = Object.assign({ goal: DEFAULT_GOAL }, state);

  function persist() { NSCode.api.labState('#/multi-agent', state); }
  function el(id) { return document.getElementById(id); }

  /* role chip/avatar/tag helpers (deterministic colors from the engine) */
  function avatar(roleName) {
    var r = M.role(roleName);
    return '<span class="ma-avatar" style="background:' + r.color + '">' + r.icon + '</span>';
  }
  function roleTag(roleName) {
    var r = M.role(roleName);
    return '<span class="ma-tag" style="--ma-c:' + r.color + '">' + r.icon + ' ' + C.esc(r.name) + '</span>';
  }

  /* ---------- single page render ---------- */
  function render() {
    return C.PageHeader({
      title: 'Multi-Agent Lab',
      purpose: '1 つのゴールに対し、役割ベースのエージェント群が会話・タスク分担・合意形成で協調する様子を 1 ページで可視化',
      breadcrumb: ['Multi-Agent Lab']
    }) +
      // shared goal control — appears ONCE
      C.Panel({
        title: 'ゴール', hint: SIM_HINT,
        body: '<div class="ma-goalbar">' +
          '<input id="maGoal" class="ns-input" value="' + C.esc(state.goal) + '">' +
          '<button id="maRun" class="ns-btn">実行</button>' +
          '</div>'
      }) +
      // a) Chat
      C.Panel({ title: 'Chat — 会話トランスクリプト', hint: 'Manager が起点、各ロールが報告し収束', body: '<div id="maChatOut"></div>' }) +
      // b) Task Distribution
      C.Panel({ title: 'Task Distribution — タスク割当', hint: 'subtask / 担当 / 依存 / 状態', body: '<div id="maTaskOut"></div>' }) +
      C.Panel({ title: 'ロール別サマリー', body: '<div id="maRoleOut"></div>' }) +
      // c) Consensus
      C.Panel({ title: 'Consensus — 提案', body: '<div id="maPropOut"></div>' }) +
      C.Panel({ title: '投票', hint: '各ロールが 0〜1 でスコア。平均が 0.7 以上で承認', body: '<div id="maVoteOut"></div>' }) +
      C.Panel({ title: '合意結果', body: '<div id="maDecOut"></div>' });
  }

  function onMount() {
    var input = el('maGoal'), btn = el('maRun');
    function run() { state.goal = input.value; persist(); renderAll(); }
    btn.addEventListener('click', run);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
    input.addEventListener('input', function () { state.goal = input.value; persist(); });
    renderAll();
  }

  function renderAll() {
    renderChat();
    renderTasks();
    renderConsensus();
  }

  /* ---------- Chat ---------- */
  function renderChat() {
    var out = el('maChatOut'); if (!out) return;
    var msgs = M.chat(state.goal);
    var participants = {};
    msgs.forEach(function (m) { participants[m.role] = 1; });
    var count = Object.keys(participants).length;

    var bubbles = msgs.map(function (m, i) {
      var r = M.role(m.role);
      var side = (i % 2 === 0) ? 'left' : 'right';
      var to = m.to && m.to !== 'all' ? ('→ ' + C.esc(m.to)) : '→ 全員';
      return '<div class="ma-msg ma-msg--' + side + '">' +
        avatar(m.role) +
        '<div class="ma-bubble" style="--ma-c:' + r.color + '">' +
          '<div class="ma-bubble__head"><b style="color:' + r.color + '">' + r.icon + ' ' + C.esc(r.name) + '</b>' +
            '<span class="ma-bubble__to">' + to + '</span></div>' +
          '<p class="ma-bubble__text">' + C.esc(m.text) + '</p>' +
        '</div></div>';
    }).join('');

    out.innerHTML =
      '<div class="ns-grid" style="--cols:3">' +
        C.Metric({ label: '参加エージェント', value: count, unit: '体' }) +
        C.Metric({ label: 'メッセージ数', value: msgs.length }) +
        C.Metric({ label: 'ターン', value: msgs.length }) +
      '</div>' +
      '<div class="ma-chat">' + bubbles + '</div>' +
      '<p class="ns-empty__hint">※ ' + C.esc(SIM_HINT) + '。同じゴールからは常に同じ会話が生成されます。</p>';
  }

  /* ---------- Task Distribution ---------- */
  function statusBadge(st) {
    var map = { done: ['完了', 'is-done'], doing: ['進行中', 'is-doing'], todo: ['未着手', 'is-todo'] };
    var m = map[st] || map.todo;
    return '<span class="ma-status ' + m[1] + '">' + m[0] + '</span>';
  }

  function renderTasks() {
    var out = el('maTaskOut'), rout = el('maRoleOut'); if (!out) return;
    var tasks = M.distribute(state.goal);

    var rows = tasks.map(function (t) {
      var deps = t.depends_on.length
        ? t.depends_on.map(function (d) { return '<span class="ns-tag">' + C.esc(d) + '</span>'; }).join(' ')
        : '<span class="ma-dim">—</span>';
      return '<tr>' +
        '<td><b>' + C.esc(t.id) + '</b> ' + C.esc(t.subtask) + '</td>' +
        '<td>' + roleTag(t.role) + '</td>' +
        '<td>' + deps + '</td>' +
        '<td>' + statusBadge(t.status) + '</td>' +
        '</tr>';
    }).join('');

    out.innerHTML =
      '<div class="ns-table-wrap"><table class="ns-table"><thead><tr>' +
        '<th>subtask</th><th>担当ロール</th><th>依存</th><th>状態</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';

    // per-role summary
    var counts = {};
    tasks.forEach(function (t) { counts[t.role] = (counts[t.role] || 0) + 1; });
    var max = 0;
    M.roleOrder.forEach(function (r) { if ((counts[r] || 0) > max) max = counts[r]; });
    var cards = M.roleOrder.map(function (rn) {
      var n = counts[rn] || 0;
      var r = M.role(rn);
      var pct = max ? Math.round((n / max) * 100) : 0;
      return '<div class="ma-rolecard">' +
        '<div class="ma-rolecard__head">' + roleTag(rn) + '<b>' + n + '</b></div>' +
        '<div class="ma-rolecard__desc">' + C.esc(r.desc) + '</div>' +
        '<div class="ns-progress"><div class="ns-progress__fill" style="width:' + pct + '%;background:' + r.color + '"></div></div>' +
        '</div>';
    }).join('');
    if (rout) rout.innerHTML = '<div class="ns-grid" style="--cols:3">' + cards + '</div>';
  }

  /* ---------- Consensus ---------- */
  function renderConsensus() {
    var pout = el('maPropOut'), vout = el('maVoteOut'), dout = el('maDecOut'); if (!pout) return;
    var c = M.consensus(state.goal);

    pout.innerHTML = '<p class="ma-proposal">' + C.esc(c.proposal) + '</p>';

    vout.innerHTML = c.votes.map(function (v) {
      var r = M.role(v.role);
      var pct = Math.round(v.score * 100);
      return '<div class="ma-vote">' +
        '<div class="ma-vote__role">' + roleTag(v.role) + '</div>' +
        '<div class="ma-vote__bar">' +
          '<div class="ns-progress"><div class="ns-progress__fill" style="width:' + pct + '%;background:' + r.color + '"></div></div>' +
          '<span class="ma-vote__score">' + v.score.toFixed(2) + '</span>' +
        '</div>' +
        '<div class="ma-vote__comment">' + C.esc(v.comment) + '</div>' +
        '</div>';
    }).join('');

    var aggPct = Math.round(c.aggregate * 100);
    var approved = c.decision === 'approved';
    dout.innerHTML =
      '<div class="ns-grid" style="--cols:2">' +
        C.Metric({ label: '集計スコア（平均）', value: c.aggregate.toFixed(2) }) +
        '<div class="ns-stat"><div class="ns-stat__value">' +
          '<span class="ma-decision ' + (approved ? 'is-ok' : 'is-bad') + '">' +
          (approved ? '✓ 承認 (approved)' : '↻ 要修正 (revise)') + '</span></div>' +
          '<div class="ns-stat__label">判定（しきい値 0.70）</div></div>' +
      '</div>' +
      '<div class="ma-aggbar"><div class="ns-progress ma-aggbar__track">' +
        '<div class="ns-progress__fill" style="width:' + aggPct + '%;background:' + (approved ? '#34d399' : '#f59e0b') + '"></div>' +
        '<span class="ma-aggbar__mark" style="left:70%"></span>' +
      '</div><span class="ma-aggbar__label">合意度 ' + aggPct + '%（破線＝しきい値 70%）</span></div>' +
      '<p class="ns-empty__hint">※ ' + C.esc(SIM_HINT) + '。スコアはロールごとの観点に基づく規則ベースの擬似値です。</p>';
  }

  /* ---------- register the SAME page for base route + former sub-routes (aliases) ---------- */
  var routes = ['#/multi-agent', '#/multi-agent/chat', '#/multi-agent/tasks', '#/multi-agent/consensus'];
  routes.forEach(function (route) {
    NSCode.registerView({
      route: route, module: 'multi-agent', title: 'Multi-Agent Lab',
      render: render, onMount: onMount
    });
  });
})(window.NSCode);

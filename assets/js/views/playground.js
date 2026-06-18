/* Playground (PLAY) — LLM & Prompt experimentation on ONE page (no tabs).
 * Token counts and request assembly are REAL (NSCode.embeddings.tokenize).
 * Model responses are SIMULATED/deterministic (no backend) and labelled as such;
 * real completions require the backend in docs/05. Prompt scoring is heuristic. */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, T = NSCode.embeddings;

  var MODELS = ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
  // illustrative per-1K-token price estimates (USD) — for token-cost demo only
  var PRICE = { 'claude-opus-4-8': 0.015, 'claude-sonnet-4-6': 0.003, 'claude-haiku-4-5': 0.0008 };

  var state = Object.assign({
    model: 'claude-opus-4-8', temp: 0.7,
    system: 'あなたは簡潔で正確な日本語アシスタントです。',
    prompt: 'ポンプ P-101 の軸振動アラームが出たときの初動対応を3つ挙げてください。',
    promptEval: '設備について教えて。'
  }, NSCode.api.labState('#/playground') || {});

  function persist() { NSCode.api.labState('#/playground', state); }
  function syncAsk() { if (NSCode.lastRun && NSCode.lastRun.applyTo(state, { prompt: 'query' })) persist(); }
  function el(id) { return document.getElementById(id); }
  function tokCount(t) { return T.tokenize(t || '').length; }

  var CRITERIA = [
    { id: 'role', label: '役割/ペルソナ指定', test: function (p) { return /(あなたは|として|専門家|アシスタント|role|you are)/i.test(p); }, fix: 'あなたは{分野}の専門家です。' },
    { id: 'task', label: '明確なタスク動詞', test: function (p) { return /(説明|要約|生成|分類|抽出|作成|比較|list|explain|summarize|write|classify)/i.test(p); }, fix: '次のタスクを実行してください: {タスク}。' },
    { id: 'context', label: '文脈/入力の提示', test: function (p) { return p.length > 40 || /(以下|次の|context|入力)/i.test(p); }, fix: '# 入力\n{ここに対象データ}' },
    { id: 'examples', label: '例示 (few-shot)', test: function (p) { return /(例[:：]|例えば|example|e\.g\.|入力.*出力)/i.test(p); }, fix: '# 例\n入力: ... → 出力: ...' },
    { id: 'constraints', label: '制約条件', test: function (p) { return /(必ず|してはいけない|以内|字以内|制約|must|do not|only)/i.test(p); }, fix: '制約: {文字数/禁止事項} を守ること。' },
    { id: 'format', label: '出力形式の指定', test: function (p) { return /(形式|フォーマット|json|箇条書き|表|format|markdown|bullet)/i.test(p); }, fix: '出力形式: {JSON/箇条書き} で答えること。' }
  ];

  function render() {
    syncAsk();
    var opts = MODELS.map(function (m) { return '<option' + (m === state.model ? ' selected' : '') + '>' + m + '</option>'; }).join('');
    return C.PageHeader({ title: 'Playground', purpose: 'LLM 実験（応答はシミュレーション）とプロンプト評価を1ページで' }) +
      C.Panel({ title: 'LLM — 設定', hint: 'トークン数は実カウント / 応答はオフライン擬似生成', body: C.Controls([
        { label: 'Model', control: '<select id="pgModel" class="ns-input">' + opts + '</select>' },
        { label: 'Temperature: <b id="pgTempV">' + state.temp + '</b>', control: '<input id="pgTemp" class="ns-range" type="range" min="0" max="1" step="0.1" value="' + state.temp + '">' },
        { label: 'System Prompt', control: '<textarea id="pgSys" class="ns-input" rows="2">' + C.esc(state.system) + '</textarea>' }
      ]) }) +
      C.Panel({ title: 'LLM — プロンプト', body: '<textarea id="pgPrompt" class="ns-input" rows="4">' + C.esc(state.prompt) + '</textarea>' +
        '<div class="ns-actions"><button id="pgRun" class="ns-btn">実行</button></div>' }) +
      C.Panel({ title: 'LLM — リクエスト / トークン', hint: 'API へ送られる構造（実カウント）', body: '<div id="pgReq"></div>' }) +
      C.Panel({ title: 'LLM — 応答（シミュレーション）', hint: 'backend 未接続: 実モデル応答には API 接続が必要 (docs/05)', body: '<div id="pgResp"></div>' }) +
      C.Panel({ title: 'LLM — モデル別トークン/コスト試算', hint: '同一プロンプトでの概算（料金は例示値）', body: '<div id="pgCompare"></div>' }) +
      C.Panel({ title: 'Prompt — 評価対象', hint: 'プロンプトの品質をヒューリスティック評価・改善',
        body: '<textarea id="evPrompt" class="ns-input" rows="4">' + C.esc(state.promptEval) + '</textarea>' +
          '<div class="ns-actions"><button id="evImprove" class="ns-btn">改善案を生成</button></div>' }) +
      C.Panel({ title: 'Prompt — 評価', hint: '6観点のチェック（ルールベース）', body: '<div id="evScore"></div>' }) +
      C.Panel({ title: 'Prompt — 改善案 (Before / After)', body: '<div id="evImproved"></div>' });
  }

  function onMount() {
    el('pgModel').addEventListener('change', function () { state.model = el('pgModel').value; persist(); renderLLM(); });
    el('pgTemp').addEventListener('input', function () { state.temp = +el('pgTemp').value; el('pgTempV').textContent = state.temp; persist(); });
    el('pgSys').addEventListener('input', function () { state.system = el('pgSys').value; persist(); });
    el('pgPrompt').addEventListener('input', function () { state.prompt = el('pgPrompt').value; persist(); });
    el('pgRun').addEventListener('click', function () { state.prompt = el('pgPrompt').value; state.system = el('pgSys').value; persist(); renderLLM(); });
    el('evPrompt').addEventListener('input', function () { state.promptEval = el('evPrompt').value; persist(); renderEval(); });
    el('evImprove').addEventListener('click', function () { state.promptEval = el('evPrompt').value; persist(); renderImproved(); });
    renderLLM(); renderEval();
  }

  function simulateResponse() {
    var p = state.prompt.trim();
    var creativity = state.temp >= 0.7 ? '（temp高め: 多様な表現）' : state.temp <= 0.3 ? '（temp低め: 決定的）' : '';
    return '【擬似応答 ' + creativity + '】\n' +
      'これは ' + state.model + ' への送信内容に基づくオフラインのプレースホルダ応答です。\n' +
      '実際の生成にはバックエンド経由でモデル API を呼ぶ必要があります（docs/05 参照）。\n\n' +
      '入力プロンプト要旨: 「' + (p.length > 60 ? p.slice(0, 60) + '…' : p) + '」';
  }

  function renderLLM() {
    var req = el('pgReq'); if (!req) return;
    var sysT = tokCount(state.system), userT = tokCount(state.prompt);
    var reqObj = { model: state.model, temperature: state.temp,
      messages: [{ role: 'system', content: state.system }, { role: 'user', content: state.prompt }] };
    req.innerHTML = '<div class="ns-grid" style="--cols:3">' +
      C.Metric({ label: 'System tokens', value: sysT }) +
      C.Metric({ label: 'User tokens', value: userT }) +
      C.Metric({ label: '入力合計', value: sysT + userT }) +
      '</div>' + C.CodeBlock({ lang: 'json', code: JSON.stringify(reqObj, null, 2) });
    el('pgResp').innerHTML = '<pre class="ns-code">' + C.esc(simulateResponse()) + '</pre>';
    var total = sysT + userT;
    var rows = MODELS.map(function (m) { return [m, String(total), '$' + (total / 1000 * PRICE[m]).toFixed(5)]; });
    el('pgCompare').innerHTML = C.Table(['Model', '入力トークン', '概算コスト'], rows) +
      '<p class="ns-empty__hint">トークン数は実カウント、料金は例示用の単価です（正確な課金は各 API 仕様を参照）。</p>';
  }

  function evalResults(p) { return CRITERIA.map(function (c) { return { c: c, ok: c.test(p) }; }); }

  function renderEval() {
    var out = el('evScore'); if (!out) return;
    var res = evalResults(state.promptEval);
    var passed = res.filter(function (r) { return r.ok; }).length;
    var score = Math.round(passed / CRITERIA.length * 100);
    out.innerHTML = C.ProgressBar({ label: '総合スコア', percent: score }) +
      '<div class="ns-hal">' + res.map(function (r) {
        return '<div class="ns-hal__row ' + (r.ok ? 'is-ok' : 'is-bad') + '">' +
          '<span class="ns-hal__badge">' + (r.ok ? '✓' : '✗') + '</span>' + C.esc(r.c.label) + '</div>';
      }).join('') + '</div>';
  }

  function renderImproved() {
    var out = el('evImproved'); if (!out) return;
    var res = evalResults(state.promptEval);
    var missing = res.filter(function (r) { return !r.ok; });
    var improved = state.promptEval.trim();
    if (missing.length) improved += '\n\n' + missing.map(function (r) { return r.c.fix; }).join('\n');
    out.innerHTML = '<div class="ns-grid" style="--cols:2">' +
      C.Panel({ title: 'Before', body: '<pre class="ns-code">' + C.esc(state.promptEval) + '</pre>' }) +
      C.Panel({ title: 'After', body: '<pre class="ns-code">' + C.esc(improved) + '</pre>' }) +
      '</div>' +
      '<p class="ns-empty__hint">' + (missing.length ? '不足していた観点（' + missing.length + '件）をテンプレートで補完しました。' : '主要な観点は満たしています。') + '</p>';
  }

  ['#/playground', '#/playground/llm', '#/playground/prompt'].forEach(function (r) {
    NSCode.registerView({ route: r, module: 'playground', title: 'Playground', render: render, onMount: onMount });
  });
})(window.NSCode);

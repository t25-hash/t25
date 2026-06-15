/* Evaluation Lab (EVAL) — offline quality evaluation.
 * RAG target runs REAL Precision@k / Recall@k over a built-in labeled dataset
 * (NSCode.evaluation.evaluateRAG). Other targets show clearly-labeled estimates.
 * Latency / Cost / Hallucination are deterministic ESTIMATES (see hint text). */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, E = NSCode.evaluation;
  var TARGETS = ['RAG', 'Agent', 'Prompt', 'Tool'];

  var state = Object.assign({
    target: 'RAG',
    topK: 3,
    result: null   // last computed result (persisted so it survives reloads)
  }, NSCode.api.labState('#/evaluation') || {});

  function persist() { NSCode.api.labState('#/evaluation', state); }
  function el(id) { return document.getElementById(id); }
  function pct(x) { return Math.round(Math.max(0, Math.min(1, x)) * 100); }

  function range(id, min, max, step, val) {
    return '<input id="' + id + '" class="ns-range" type="range" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + val + '">';
  }

  function bar(label, value, real) {
    // value in 0..1; ProgressBar renders the % fill + value row.
    var tag = real ? '<span class="ns-eval-tag is-real">実測</span>' : '<span class="ns-eval-tag is-est">推定</span>';
    return '<div class="ns-eval-metric">' +
      '<div class="ns-eval-metric__head"><span>' + C.esc(label) + '</span>' + tag + '</div>' +
      C.ProgressBar({ label: '', percent: pct(value) }) +
      '</div>';
  }

  NSCode.registerView({
    route: '#/evaluation', module: 'evaluation', title: 'Evaluation Lab',
    render: function () {
      var sel = '<select id="evTarget" class="ns-input">' + TARGETS.map(function (t) {
        return '<option value="' + t + '"' + (t === state.target ? ' selected' : '') + '>' + t + '</option>';
      }).join('') + '</select>';

      var controls = C.Controls([
        { label: '評価対象 (Target)', control: sel },
        { label: 'TopK: <b id="evTopkVal">' + state.topK + '</b>', control: range('evTopk', 1, 8, 1, state.topK) }
      ]);

      return C.PageHeader({
        title: 'Evaluation Lab',
        purpose: 'RAGはラベル付きデータセットで Precision@k / Recall@k を実測。他対象は実ハーネス未接続のため推定値。',
        breadcrumb: ['Evaluation Lab', '品質評価']
      }) +
      C.Panel({
        title: '評価設定',
        hint: 'RAG=実測 / Agent・Prompt・Tool=推定（プレースホルダ）',
        body: controls +
          '<p id="evNote" class="ns-empty__hint"></p>' +
          '<div class="ns-actions"><button id="evRun" class="ns-btn">評価実行</button></div>'
      }) +
      C.Panel({
        title: '指標 (Metrics)',
        hint: 'Accuracy(RAGは≒F1) / Recall / Precision は0..1。Latency・Cost・Hallucination は推定。',
        body: '<div id="evMetrics"></div>'
      }) +
      C.Panel({
        title: 'クエリ別内訳 (Per-query, RAGのみ)',
        hint: 'P@k = |検索∩正解|/|検索| ・ R@k = |検索∩正解|/|正解|（実測）',
        body: '<div id="evBreakdown"></div>'
      });
    },

    onMount: function () {
      function syncNote() {
        var t = el('evTarget').value;
        el('evNote').innerHTML = t === 'RAG'
          ? '※ RAG: 内蔵の正解ラベル付きコーパス（' + E.corpus.length + '文書 / ' + E.queries.length + 'クエリ）で <b>Precision@k・Recall@k を実測</b>します。Latency/Cost/Hallucination は決定論的な推定です。'
          : '※ ' + C.esc(t) + ': 実評価ハーネス未接続のため、全指標は<b>例示用の推定値（プレースホルダ）</b>です。';
      }
      el('evTarget').addEventListener('change', function () {
        state.target = el('evTarget').value; persist(); syncNote();
      });
      el('evTopk').addEventListener('input', function () {
        state.topK = +el('evTopk').value;
        el('evTopkVal').textContent = state.topK;
        persist();
      });
      el('evRun').addEventListener('click', function () {
        state.result = (state.target === 'RAG')
          ? E.evaluateRAG({ topK: state.topK })
          : E.estimateTarget(state.target, state.topK);
        persist();
        renderResult();
      });
      syncNote();
      renderResult();
    }
  });

  function renderResult() {
    var m = el('evMetrics'), b = el('evBreakdown');
    if (!m || !b) return;
    var r = state.result;
    if (!r) {
      m.innerHTML = C.EmptyState({ icon: '🧪', message: '「評価実行」を押すと指標を計算します。' });
      b.innerHTML = '';
      return;
    }

    var realRAG = !r.estimated;   // RAG results have estimated == undefined

    // Accuracy ≈ F1 for RAG; for estimates it's the seeded F1.
    var rows =
      bar('Accuracy (≈F1)', r.f1, realRAG) +
      bar('Recall', r.macroRecall, realRAG) +
      bar('Precision', r.macroPrecision, realRAG);

    var summary =
      '<div class="ns-grid" style="--cols:3">' +
        C.Metric({ label: 'Latency (推定)', value: Math.round(r.latencyMs), unit: 'ms' }) +
        C.Metric({ label: 'Cost (推定)', value: '$' + r.costUsd.toFixed(5) }) +
        C.Metric({ label: 'Hallucination (推定)', value: pct(r.hallucinationRate) + '%' }) +
      '</div>';

    m.innerHTML =
      '<p class="ns-empty__hint">対象: <b>' + C.esc(r.target) + '</b> · TopK=' + state.topK +
        (realRAG ? ' · <span class="ns-eval-tag is-real">Precision/Recall/F1 は実測</span>'
                 : ' · <span class="ns-eval-tag is-est">全指標は推定（プレースホルダ）</span>') + '</p>' +
      '<div class="ns-eval-metrics">' + rows + '</div>' +
      summary +
      '<p class="ns-empty__hint">Latency・Cost は topK とコーパスサイズから算出した決定論的推定（実計測・課金なし）。Hallucination は語彙重なりヒューリスティックをサンプル回答に適用した推定です。</p>';

    if (realRAG && r.perQuery.length) {
      var headers = ['Query', 'P@k', 'R@k', 'Retrieved (ids)', 'Relevant (ids)'];
      var rowsData = r.perQuery.map(function (q) {
        return [
          q.query,
          q.precision.toFixed(2),
          q.recall.toFixed(2),
          '[' + q.retrievedIds.join(', ') + ']',
          '[' + q.relevantIds.join(', ') + ']'
        ];
      });
      b.innerHTML = C.Table(headers, rowsData) +
        '<p class="ns-empty__hint">各行は内蔵ラベルに対する実測値です。retrieved と relevant の重なりが P@k / R@k を決めます。</p>';
    } else {
      b.innerHTML = C.EmptyState({ icon: '📊', message: 'クエリ別内訳は RAG（実測）対象でのみ表示されます。' });
    }
  }
})(window.NSCode);

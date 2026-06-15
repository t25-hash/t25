/* Evaluation Lab (EVAL) — 品質評価 */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;
  var TARGETS = ['RAG', 'Agent', 'Prompt', 'Tool'];
  var METRICS = ['Accuracy', 'Recall', 'Precision', 'Latency', 'Cost', 'Hallucination'];

  NSCode.registerView({
    route: '#/evaluation', module: 'evaluation', title: 'Evaluation Lab',
    render: function () {
      var sel = '<select class="ns-input">' + TARGETS.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select>';
      var metrics = METRICS.map(function (m) { return C.Metric({ label: m, value: '—' }); }).join('');
      return C.PageHeader({ title: 'Evaluation Lab', purpose: '品質評価' }) +
        C.Panel({ title: '評価対象', body: C.Controls([{ label: 'Target', control: sel }]) +
          '<div class="ns-actions"><button class="ns-btn">評価実行</button></div>' }) +
        C.Panel({ title: '指標', body: '<div class="ns-grid" style="--cols:3">' + metrics + '</div>' });
    }
  });
})(window.NSCode);

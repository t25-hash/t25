/* SCR-DASH-01 Dashboard — 学習状況の可視化 */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;

  NSCode.registerView({
    route: '#/dashboard', module: 'dashboard', title: 'Dashboard',
    render: function () {
      var progress = NSCode.api.getProgress();
      var areas = [
        { id: 'llm', label: 'LLM' }, { id: 'prompt', label: 'Prompt' },
        { id: 'embedding', label: 'Embedding' }, { id: 'rag', label: 'RAG' },
        { id: 'agent', label: 'Agent' }, { id: 'multi', label: 'Multi-Agent' }
      ];
      var bars = areas.map(function (a) {
        var pct = (progress[a.id] && progress[a.id].percent) || 0;
        return C.ProgressBar({ label: a.label, percent: pct });
      }).join('');

      var artifacts = NSCode.api.listArtifacts();
      var artBody = artifacts.length
        ? C.Table(['名前', '種別', '作成'], artifacts.map(function (a) {
            return [a.name || '(無題)', a.kind || '-', (a.created_at || '').slice(0, 10)];
          }))
        : C.EmptyState({ icon: '📦', message: 'まだ成果物がありません。', hint: 'Build Lab で作成すると、ここに一覧表示されます。' });

      return C.PageHeader({ title: 'Dashboard', purpose: '学習状況の可視化' }) +
        C.Panel({ title: '学習進捗', body: '<div class="ns-grid" style="--cols:3">' + bars + '</div>' }) +
        '<div class="ns-grid" style="--cols:2">' +
          C.Panel({ title: '現在学習中', body: C.EmptyState({ icon: '📖', message: '学習を開始すると進捗がここに表示されます。', hint: 'Academy から始めましょう。' }) }) +
          C.Panel({ title: '推奨次ステップ', body: C.Grid(
            C.Card({ title: 'LLM の基礎', body: 'Token → Embedding → Transformer', href: '#/academy/llm' }) +
            C.Card({ title: 'RAG を試す', body: 'Chunk Simulator で体験', href: '#/rag/chunk' }), 2) }) +
        '</div>' +
        C.Panel({ title: '成果物一覧', body: artBody });
    }
  });
})(window.NSCode);

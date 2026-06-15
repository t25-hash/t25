/* Research Lab (RES) — 論文学習 */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;
  NSCode.registerView({
    route: '#/research', module: 'research', title: 'Research Lab',
    render: function () {
      return C.PageHeader({ title: 'Research Lab', purpose: '論文学習' }) +
        C.Panel({ title: '論文アップロード', body:
          '<div class="ns-upload"><input class="ns-input" type="file" accept="application/pdf"><p class="ns-empty__hint">PDF をアップロードすると解析されます（雛形）。</p></div>' }) +
        '<div class="ns-grid" style="--cols:2">' +
          C.Panel({ title: '要約', body: C.EmptyState({ icon: '📝', message: 'PDF 解析後に要約を表示。' }) }) +
          C.Panel({ title: '図解', body: C.EmptyState({ icon: '📊', message: '主要図表を抽出して表示。' }) }) +
        '</div>' +
        C.Panel({ title: '再現実験', body: C.EmptyState({ icon: '🔬', message: '論文手法を Lab で再現。' }) });
    }
  });
})(window.NSCode);

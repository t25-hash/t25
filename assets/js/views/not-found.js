/* SCR-COM-404 Not Found */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;
  NSCode.registerView({
    route: '#/404', module: null, title: 'Not Found',
    render: function (ctx) {
      return C.PageHeader({ title: '404 — Not Found',
        purpose: '指定の画面は見つかりませんでした' + (ctx.attempted ? '（' + ctx.attempted + '）' : '') }) +
        C.EmptyState({ icon: '🧭', message: 'ルートが未定義です。',
          hint: 'サイドバーから移動するか、Dashboard へ戻ってください。' }) +
        '<div class="ns-actions"><a class="ns-btn" href="#/dashboard">Dashboard へ</a></div>';
    }
  });
})(window.NSCode);

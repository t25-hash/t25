/* AI Coding Lab (AICODE) — AIコーディングツール比較 */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;
  var TARGETS = ['Claude Code', 'Cursor', 'OpenHands', 'Devin', 'Cline', 'RooCode', 'OpenAI Codex'];
  var CRITERIA = ['Architecture', 'Memory', 'Tool', 'Context', 'Agent', 'MultiAgent', 'Cost', 'Performance'];

  NSCode.registerView({
    route: '#/ai-coding', module: 'ai-coding', title: 'AI Coding Lab',
    render: function () {
      var rows = TARGETS.map(function (t) {
        return [t].concat(CRITERIA.map(function () { return '—'; }));
      });
      return C.PageHeader({ title: 'AI Coding Lab', purpose: 'AIコーディングツール比較' }) +
        C.Panel({ title: '比較マトリクス', hint: '各セルは雛形（未入力）',
          body: C.Table(['Tool'].concat(CRITERIA), rows) });
    }
  });
})(window.NSCode);

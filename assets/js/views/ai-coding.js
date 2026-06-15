/* AI Coding Lab (AICODE) — interactive comparison of AI coding tools.
 * The matrix is an editable, illustrative reference of GENERAL characteristics
 * (not a benchmark). Cells are qualitative; verify against each tool's docs. */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;

  var TOOLS = ['Claude Code', 'Cursor', 'OpenHands', 'Devin', 'Cline', 'RooCode', 'OpenAI Codex'];
  var CRITERIA = ['Architecture', 'Memory', 'Tool', 'Context', 'Agent', 'MultiAgent', 'Cost', 'Performance'];

  // Illustrative, high-level characteristics. Editable in-session; persisted.
  var DEFAULT = {
    'Claude Code':   ['CLIエージェント / while-loop', '永続メモリ + 圧縮', '豊富(file/bash/MCP)', '大(自動圧縮)', '自律ループ', 'SubAgent対応', '従量(API)', '高い自律性'],
    'Cursor':        ['IDE統合', 'セッション/ルール', 'エディタ操作中心', '中〜大', '半自律', '限定的', 'サブスク', '対話編集が高速'],
    'OpenHands':     ['OSSエージェント', 'イベントストリーム', 'sandbox/bash/browser', '中', '自律', 'あり', 'OSS+API従量', 'タスク自動化'],
    'Devin':         ['クラウド自律エージェント', '長期メモリ', 'shell/browser/editor', '大', '高自律', '内部分業', '商用/高め', '長尺タスク向き'],
    'Cline':         ['VSCode拡張エージェント', 'タスク履歴', 'file/terminal/MCP', '中〜大', '自律(承認制)', '限定的', '従量(API)', '透明な実行ログ'],
    'RooCode':       ['VSCode拡張(Cline派生)', 'モード/履歴', 'file/terminal/MCP', '中〜大', '自律(複数モード)', 'モード分業', '従量(API)', 'カスタム性高'],
    'OpenAI Codex':  ['クラウド/CLIエージェント', 'セッション', 'sandbox実行', '中〜大', '自律', '限定的', '従量/サブスク', 'コード生成強い']
  };

  var state = Object.assign({ matrix: null, selected: 'Claude Code' }, NSCode.api.labState('#/ai-coding') || {});
  if (!state.matrix) { state.matrix = DEFAULT; }
  function persist() { NSCode.api.labState('#/ai-coding', state); }
  function el(id) { return document.getElementById(id); }

  NSCode.registerView({
    route: '#/ai-coding', module: 'ai-coding', title: 'AI Coding Lab',
    render: function () {
      var opts = TOOLS.map(function (t) { return '<option' + (t === state.selected ? ' selected' : '') + '>' + C.esc(t) + '</option>'; }).join('');
      return C.PageHeader({ title: 'AI Coding Lab', purpose: 'AIコーディングツール比較' }) +
        C.Panel({ title: '比較マトリクス', hint: '一般的特徴の参考（ベンチマークではない）・各ツール公式情報で要確認',
          body: '<div id="matrix"></div>' }) +
        C.Panel({ title: 'ツール詳細', body:
          '<div class="ns-controls"><label class="ns-control"><span>ツール</span><select id="toolSel" class="ns-input">' + opts + '</select></label></div>' +
          '<div id="toolDetail"></div>' });
    },
    onMount: function () {
      el('toolSel').addEventListener('change', function () { state.selected = el('toolSel').value; persist(); renderDetail(); });
      renderMatrix(); renderDetail();
    }
  });

  function renderMatrix() {
    var out = el('matrix'); if (!out) return;
    var rows = TOOLS.map(function (t) { return [t].concat(state.matrix[t]); });
    out.innerHTML = C.Table(['Tool'].concat(CRITERIA), rows);
  }
  function renderDetail() {
    var out = el('toolDetail'); if (!out) return;
    var t = state.selected, vals = state.matrix[t] || [];
    out.innerHTML = '<div class="ns-grid" style="--cols:2">' +
      CRITERIA.map(function (cr, i) {
        return C.Card({ title: cr, body: C.esc(vals[i] || '—') });
      }).join('') + '</div>';
  }
})(window.NSCode);

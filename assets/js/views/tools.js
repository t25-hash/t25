/* Tool Calling Lab (TOOL) — Tool Use理解 */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;
  var tabs = [
    { id: 'registry', label: 'Tool Registry', route: '#/tools/registry' },
    { id: 'selection', label: 'Selection Viewer', route: '#/tools/selection' },
    { id: 'execution', label: 'Execution Viewer', route: '#/tools/execution' }
  ];
  var TOOLS = ['Search', 'ReadFile', 'WriteFile', 'Terminal', 'Browser', 'Database'];
  NSCode.registerLab({
    module: 'tools', title: 'Tool Calling Lab', purpose: 'Tool Use理解', tabs: tabs,
    screens: {
      '#/tools/registry': { title: 'Tool Registry', purpose: '利用可能なツール一覧', panels: [
        { title: 'Tools', body: C.Grid(TOOLS.map(function (t) { return C.Card({ title: t }); }).join(''), 3) }
      ] },
      '#/tools/selection': { title: 'Tool Selection Viewer', purpose: 'なぜそのツールを選んだか', panels: [
        { title: '選択理由', empty: 'ゴールに対するツール選択の根拠を表示。' }
      ] },
      '#/tools/execution': { title: 'Tool Execution Viewer', purpose: '実行ログの確認', panels: [
        { title: '実行ログ', empty: '入力引数・結果・所要時間を時系列表示。' }
      ] }
    }
  });
})(window.NSCode);

/* Claude Code Explorer (CCEX) — Claude Codeアーキテクチャ学習 */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;
  var tabs = [
    { id: 'architecture', label: 'Architecture', route: '#/claude-code/architecture' },
    { id: 'execution', label: 'Execution', route: '#/claude-code/execution' },
    { id: 'session', label: 'Session', route: '#/claude-code/session' },
    { id: 'tool', label: 'Tool', route: '#/claude-code/tool' },
    { id: 'memory', label: 'Memory', route: '#/claude-code/memory' }
  ];
  var systems = ['Context System', 'Permission System', 'Tool System', 'Memory System',
    'Planning', 'Reflection', 'Retry', 'Recovery', 'Checkpoint', 'SubAgent']
    .map(function (s) { return C.Card({ title: s }); }).join('');

  NSCode.registerLab({
    module: 'claude-code', title: 'Claude Code Explorer', purpose: 'Claude Codeアーキテクチャ学習', tabs: tabs,
    screens: {
      '#/claude-code/architecture': { title: 'Architecture Viewer', purpose: '構成要素の全体像', panels: [
        { title: '学習対象', body: C.Grid(systems, 3) }
      ] },
      '#/claude-code/execution': { title: 'Execution Viewer', purpose: '実行過程', panels: [
        { title: 'Agent Loop', empty: 'コンテキスト構築 → モデル呼出 → ツール実行 → 状態確定 の流れ。' }
      ] },
      '#/claude-code/session': { title: 'Session Viewer', purpose: 'セッション構造', panels: [
        { title: 'Session', empty: 'ターン/メッセージ/チェックポイントの構造。' }
      ] },
      '#/claude-code/tool': { title: 'Tool Viewer', purpose: 'ツール一覧', panels: [
        { title: 'Tools', empty: 'ツール定義と権限ゲートの関係。' }
      ] },
      '#/claude-code/memory': { title: 'Memory Viewer', purpose: 'メモリ構造', panels: [
        { title: 'Memory', empty: 'コンテキスト圧縮と永続メモリ。' }
      ] }
    }
  });
})(window.NSCode);

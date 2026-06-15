/* Agent Lab (AGENT) — Agent理解 */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;
  var tabs = [
    { id: 'loop', label: 'Loop Viewer', route: '#/agent/loop' },
    { id: 'planner', label: 'Planner', route: '#/agent/planner' },
    { id: 'reflection', label: 'Reflection', route: '#/agent/reflection' },
    { id: 'retry', label: 'Retry', route: '#/agent/retry' }
  ];
  var loopHtml = ['Goal', 'Plan', 'Action', 'Observation', 'Reflection', 'Retry']
    .map(function (s, i) { return '<li class="ns-step"><span class="ns-step__no">' + (i + 1) + '</span>' + s + '</li>'; })
    .join('<span class="ns-step__arrow">↓</span>');

  NSCode.registerLab({
    module: 'agent', title: 'Agent Lab', purpose: 'Agent理解', tabs: tabs,
    screens: {
      '#/agent/loop': { title: 'Agent Loop Viewer', purpose: 'Agent ループの可視化', panels: [
        { title: 'ループ', body: '<ol class="ns-steps">' + loopHtml + '</ol>' }
      ] },
      '#/agent/planner': { title: 'Planner Simulator', purpose: '計画生成', panels: [
        { title: '計画', empty: 'ゴールから実行ステップを生成。' }
      ] },
      '#/agent/reflection': { title: 'Reflection Simulator', purpose: '改善提案生成', panels: [
        { title: '改善提案', empty: '実行トレースから改善点を提示。' }
      ] },
      '#/agent/retry': { title: 'Retry Simulator', purpose: '再実行確認', panels: [
        { title: '再実行', empty: '失敗ステップの再試行を可視化。' }
      ] }
    }
  });
})(window.NSCode);

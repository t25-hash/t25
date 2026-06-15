/* Multi-Agent Lab (MULTI) — Multi-Agent理解 */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;
  var tabs = [
    { id: 'chat', label: 'Chat Viewer', route: '#/multi-agent/chat' },
    { id: 'tasks', label: 'Task Distribution', route: '#/multi-agent/tasks' },
    { id: 'consensus', label: 'Consensus', route: '#/multi-agent/consensus' }
  ];
  var roles = ['Manager', 'Planner', 'Researcher', 'Coder', 'Reviewer', 'Tester']
    .map(function (r) { return C.Card({ title: r }); }).join('');

  NSCode.registerLab({
    module: 'multi-agent', title: 'Multi-Agent Lab', purpose: 'Multi-Agent理解', tabs: tabs,
    screens: {
      '#/multi-agent/chat': { title: 'Agent Chat Viewer', purpose: 'エージェント間の会話可視化', panels: [
        { title: 'Agent 構成', body: C.Grid(roles, 3) },
        { title: '会話', empty: 'エージェント間のメッセージを時系列表示。' }
      ] },
      '#/multi-agent/tasks': { title: 'Task Distribution Viewer', purpose: '担当の可視化', panels: [
        { title: 'タスク割当', empty: '誰が何を担当するかを表示。' }
      ] },
      '#/multi-agent/consensus': { title: 'Consensus Viewer', purpose: '合意形成の可視化', panels: [
        { title: '合意形成', empty: '投票/議論による合意過程を表示。' }
      ] }
    }
  });
})(window.NSCode);

/* Challenge Mode (CHAL) — 段階的な構築課題 */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;
  var LEVELS = [
    { id: 'L1', level: 1, title: 'RAG構築' },
    { id: 'L2', level: 2, title: 'Agent構築' },
    { id: 'L3', level: 3, title: 'MCP構築' },
    { id: 'L4', level: 4, title: 'Multi-Agent構築' },
    { id: 'L5', level: 5, title: 'Claude Code Mini構築' },
    { id: 'L6', level: 6, title: '設計書からシステム生成' },
    { id: 'L7', level: 7, title: '自己改善Agent構築' }
  ];
  NSCode.challengeLevels = LEVELS;

  NSCode.registerView({
    route: '#/challenge', module: 'challenge', title: 'Challenge Mode',
    render: function () {
      var attempts = NSCode.api.listChallenges();
      var cards = LEVELS.map(function (l, i) {
        var prev = i === 0 ? null : LEVELS[i - 1].id;
        var unlocked = !prev || (attempts[prev] && attempts[prev].status === 'passed');
        var badge = (attempts[l.id] && attempts[l.id].status) || (unlocked ? 'open' : 'locked');
        return C.Card({ title: 'Level ' + l.level + ' · ' + l.title, badge: badge,
          href: '#/challenge/' + l.id });
      }).join('');
      return C.PageHeader({ title: 'Challenge Mode', purpose: 'L1 → L7 の段階的な構築課題' }) +
        C.Grid(cards, 2);
    }
  });

  NSCode.registerView({
    route: '#/challenge/:level', module: 'challenge', title: 'Challenge',
    render: function (ctx) {
      var l = LEVELS.filter(function (x) { return x.id === ctx.params.level; })[0];
      if (!l) return C.PageHeader({ title: 'Challenge' }) + C.EmptyState({ message: 'レベルが見つかりません。' });
      return C.PageHeader({ title: 'Level ' + l.level + ' · ' + l.title, purpose: '課題に挑戦',
          breadcrumb: ['Challenge', l.id] }) +
        C.Panel({ title: '課題説明', body: C.EmptyState({ icon: '🎯', message: '課題の要件と合格条件が入ります（雛形）。' }) }) +
        (l.id === 'L5' ? C.Panel({ title: '参考: 最小ハーネス', hint: 'Claude Code Mini の土台',
          body: '<p class="ns-lesson">mockLLM → 権限ゲート → tool → transcript/context loop の最小実装を、ブラウザで実行・Python ソースで確認できます。</p>' +
            '<div class="ns-actions"><a class="ns-btn" href="#/claude-code/harness">Mini Harness を開く</a></div>' }) : '') +
        C.Panel({ title: '提出', body: '<div class="ns-actions"><a class="ns-btn" href="#/build">Build Lab で作る</a><button class="ns-btn ns-btn--ghost">提出して採点</button></div>' });
    }
  });
})(window.NSCode);

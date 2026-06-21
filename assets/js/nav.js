/* Sidebar navigation (data-driven). Scope: Ask and ONLY the Labs that visualize a
 * real step of Ask's processing — Ask = 検索(RAG) → ベクトル化(Embedding) → 学習/重み
 * (Neural) → 想起(Memory) → 文法整形(Grammar) → エージェントのループ(Agent). 取り込み(PDF/
 * Research) と 検索品質の評価(Evaluation) を末尾に。静的な解説・テンプレ生成ページは除外。 */
(function (NSCode) {
  'use strict';
  NSCode.nav = [
    { group: 'Ask',          label: 'Ask (RAG)',       route: '#/ask' },

    { group: 'Ask の処理',    label: 'RAG Lab',         route: '#/rag' },
    { group: 'Ask の処理',    label: 'Embedding Lab',   route: '#/embedding' },
    { group: 'Ask の処理',    label: 'Neural Lab',      route: '#/neural' },
    { group: 'Ask の処理',    label: 'Memory Lab',      route: '#/memory' },
    { group: 'Ask の処理',    label: 'Grammar-agent',   route: '#/grammar' },
    { group: 'Ask の処理',    label: 'Agent Lab',       route: '#/agent' },

    { group: '取り込み・評価', label: 'PDF抽出',          route: '#/pdf' },
    { group: '取り込み・評価', label: 'Research Lab',     route: '#/research' },
    { group: '取り込み・評価', label: 'Evaluation Lab',  route: '#/evaluation' }
  ];
})(window.NSCode);

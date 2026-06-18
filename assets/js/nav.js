/* Sidebar navigation (data-driven), ordered by Ask's processing pipeline.
 * Ask = 検索(RAG) → ベクトル化(Embedding) → 学習/重み(Neural) → 生成(Playground)
 *       → 想起(Memory) → エージェントのループ(Agent). Agent applications follow,
 * and everything not on the answer path is grouped at the bottom. (UI only.) */
(function (NSCode) {
  'use strict';
  NSCode.nav = [
    { group: 'Ask',          label: 'Ask (RAG)',            route: '#/ask' },
    { group: 'Ask',          label: 'How To Answer',        route: '#/howto' },

    { group: 'Ask の処理順',  label: 'RAG Lab',              route: '#/rag' },
    { group: 'Ask の処理順',  label: 'Embedding Lab',        route: '#/embedding' },
    { group: 'Ask の処理順',  label: 'Neural Lab',           route: '#/neural' },
    { group: 'Ask の処理順',  label: 'Playground',           route: '#/playground' },
    { group: 'Ask の処理順',  label: 'Memory Lab',           route: '#/memory' },
    { group: 'Ask の処理順',  label: 'Agent Lab',            route: '#/agent' },
    { group: 'Ask の処理順',  label: '文法コンパイラ',        route: '#/grammar' },

    { group: 'エージェント応用', label: 'Multi-Agent Lab',     route: '#/multi-agent' },
    { group: 'エージェント応用', label: 'Tool Calling Lab',    route: '#/tools' },
    { group: 'エージェント応用', label: 'MCP Lab',             route: '#/mcp' },
    { group: 'エージェント応用', label: 'Claude Code Explorer', route: '#/claude-code' },

    { group: 'その他',        label: 'PDF抽出',              route: '#/pdf' },
    { group: 'その他',        label: 'Research Lab',         route: '#/research' },
    { group: 'その他',        label: 'Academy',              route: '#/academy' },
    { group: 'その他',        label: 'Doc 生成',             route: '#/generate' },
    { group: 'その他',        label: 'Build Lab',            route: '#/build' },
    { group: 'その他',        label: 'Evaluation Lab',       route: '#/evaluation' },
    { group: 'その他',        label: 'AI Coding Lab',        route: '#/ai-coding' }
  ];
})(window.NSCode);

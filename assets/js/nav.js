/* Sidebar navigation definition (see docs/01 §2, docs/02). Data-driven. */
(function (NSCode) {
  'use strict';
  NSCode.nav = [
    { group: 'Home',         label: 'Ask (RAG)',            route: '#/ask' },
    { group: 'Home',         label: 'How To Answer',        route: '#/howto' },
    { group: 'Home',         label: 'Doc 生成',             route: '#/generate' },
    { group: 'Learn',        label: 'Academy',              route: '#/academy' },
    { group: 'Experiment',   label: 'Playground',           route: '#/playground' },
    { group: 'Simulator',    label: 'Embedding Lab',        route: '#/embedding' },
    { group: 'Simulator',    label: 'RAG Lab',              route: '#/rag' },
    { group: 'Simulator',    label: 'Tool Calling Lab',     route: '#/tools' },
    { group: 'Simulator',    label: 'MCP Lab',              route: '#/mcp' },
    { group: 'Agent',        label: 'Agent Lab',            route: '#/agent' },
    { group: 'Agent',        label: 'Memory Lab',           route: '#/memory' },
    { group: 'Agent',        label: 'Multi-Agent Lab',      route: '#/multi-agent' },
    { group: 'Architecture', label: 'Claude Code Explorer', route: '#/claude-code' },
    { group: 'Architecture', label: 'AI Coding Lab',        route: '#/ai-coding' },
    { group: 'Build',        label: 'Build Lab',            route: '#/build' },
    { group: 'Quality',      label: 'Evaluation Lab',       route: '#/evaluation' },
    { group: 'Research',     label: 'Research Lab',         route: '#/research' },
    { group: 'Challenge',    label: 'Challenge Mode',       route: '#/challenge' }
  ];
})(window.NSCode);

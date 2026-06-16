/* Sidebar navigation (data-driven). Claude Code Explorer leads as the "map":
 * the rest of the sidebar mirrors Claude Code's subsystems, and each system in
 * the Explorer links to the matching group below.
 *   Context → Embedding / RAG     Tool → Tool Calling / MCP
 *   Memory  → Memory              Agent(loop/SubAgent) → Agent / Multi-Agent */
(function (NSCode) {
  'use strict';
  NSCode.nav = [
    { group: 'Claude Code', label: 'Claude Code Explorer', route: '#/claude-code' },

    { group: 'Home',        label: 'Ask (RAG)',            route: '#/ask' },
    { group: 'Home',        label: 'How To Answer',        route: '#/howto' },
    { group: 'Home',        label: 'Doc 生成',             route: '#/generate' },

    { group: 'Foundations', label: 'Academy',              route: '#/academy' },
    { group: 'Foundations', label: 'Playground',           route: '#/playground' },

    { group: 'Context',     label: 'Embedding Lab',        route: '#/embedding' },
    { group: 'Context',     label: 'RAG Lab',              route: '#/rag' },

    { group: 'Tool',        label: 'Tool Calling Lab',     route: '#/tools' },
    { group: 'Tool',        label: 'MCP Lab',              route: '#/mcp' },

    { group: 'Memory',      label: 'Memory Lab',           route: '#/memory' },

    { group: 'Agent',       label: 'Agent Lab',            route: '#/agent' },
    { group: 'Agent',       label: 'Multi-Agent Lab',      route: '#/multi-agent' },

    { group: 'Build',       label: 'Build Lab',            route: '#/build' },
    { group: 'Build',       label: 'Evaluation Lab',       route: '#/evaluation' },
    { group: 'Build',       label: 'Research Lab',         route: '#/research' },
    { group: 'Build',       label: 'AI Coding Lab',        route: '#/ai-coding' },

    { group: 'Challenge',   label: 'Challenge Mode',       route: '#/challenge' }
  ];
})(window.NSCode);

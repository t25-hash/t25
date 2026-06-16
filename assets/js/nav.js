/* Sidebar navigation (data-driven). Structure mirrors Claude Code Explorer:
 * groups are named after Claude Code's subsystems, so each Lab sits under the
 * subsystem it teaches.
 *   Context → Embedding / RAG     Tool → Tool Calling / MCP
 *   Memory  → Memory              Agent(loop/SubAgent) → Agent / Multi-Agent
 * Practical tools (Ask/Doc) and foundations (Academy/Playground) lead;
 * build/evaluate and Challenge close. */
(function (NSCode) {
  'use strict';
  NSCode.nav = [
    { group: 'Home',        label: 'Ask (RAG)',            route: '#/ask' },
    { group: 'Home',        label: 'How To Answer',        route: '#/howto' },
    { group: 'Home',        label: 'Doc 生成',             route: '#/generate' },

    { group: 'Foundations', label: 'Academy',              route: '#/academy' },
    { group: 'Foundations', label: 'Playground',           route: '#/playground' },

    { group: 'Claude Code', label: 'Claude Code Explorer', route: '#/claude-code' },
    { group: 'Claude Code', label: 'AI Coding Lab',        route: '#/ai-coding' },

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

    { group: 'Challenge',   label: 'Challenge Mode',       route: '#/challenge' }
  ];
})(window.NSCode);

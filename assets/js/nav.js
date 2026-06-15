/* Sidebar navigation definition (see docs/01 §2, docs/02). Data-driven. */
(function (NSCode) {
  'use strict';
  NSCode.nav = [
    { group: 'Home',         label: 'Ask (RAG)',            route: '#/ask' },
    { group: 'Home',         label: 'Dashboard',            route: '#/dashboard' },
    { group: 'Learn',        label: 'Academy',              route: '#/academy' },
    { group: 'Experiment',   label: 'LLM Playground',       route: '#/playground/llm' },
    { group: 'Experiment',   label: 'Prompt Playground',    route: '#/playground/prompt' },
    { group: 'Simulator',    label: 'Embedding Lab',        route: '#/embedding/token' },
    { group: 'Simulator',    label: 'RAG Lab',              route: '#/rag/chunk' },
    { group: 'Simulator',    label: 'Tool Calling Lab',     route: '#/tools/registry' },
    { group: 'Simulator',    label: 'MCP Lab',              route: '#/mcp/explorer' },
    { group: 'Agent',        label: 'Agent Lab',            route: '#/agent/loop' },
    { group: 'Agent',        label: 'Memory Lab',           route: '#/memory/viewer' },
    { group: 'Agent',        label: 'Multi-Agent Lab',      route: '#/multi-agent/chat' },
    { group: 'Architecture', label: 'Claude Code Explorer', route: '#/claude-code/architecture' },
    { group: 'Architecture', label: 'AI Coding Lab',        route: '#/ai-coding' },
    { group: 'Build',        label: 'Build Lab',            route: '#/build' },
    { group: 'Quality',      label: 'Evaluation Lab',       route: '#/evaluation' },
    { group: 'Research',     label: 'Research Lab',         route: '#/research' },
    { group: 'Challenge',    label: 'Challenge Mode',       route: '#/challenge' }
  ];
})(window.NSCode);

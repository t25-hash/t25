/* Build Lab (BUILD) — Agent構築 */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;
  var BUILDERS = [
    { id: 'rag', label: 'RAG Builder', route: '#/build/rag' },
    { id: 'agent', label: 'Agent Builder', route: '#/build/agent' },
    { id: 'multi-agent', label: 'MultiAgent Builder', route: '#/build/multi-agent' },
    { id: 'mcp', label: 'MCP Builder', route: '#/build/mcp' },
    { id: 'workflow', label: 'Workflow Builder', route: '#/build/workflow' }
  ];

  NSCode.registerView({
    route: '#/build', module: 'build', title: 'Build Lab',
    render: function () {
      var cards = BUILDERS.map(function (b) {
        return C.Card({ title: b.label, body: '構成を編集 → JSON/YAML/Python/LangGraph 出力', href: b.route });
      }).join('');
      return C.PageHeader({ title: 'Build Lab', purpose: 'Agent構築' }) + C.Grid(cards, 3);
    }
  });

  BUILDERS.forEach(function (b) {
    NSCode.registerView({
      route: b.route, module: 'build', title: b.label,
      render: function () {
        return C.PageHeader({ title: b.label, purpose: '構成を編集して成果物を出力',
            breadcrumb: ['Build Lab', b.label] }) +
          '<div class="ns-grid" style="--cols:2">' +
            C.Panel({ title: '構成', body: C.EmptyState({ icon: '🧩', message: 'コンポーネントを配置して構成を編集（雛形）。' }) }) +
            C.Panel({ title: '出力', hint: 'JSON / YAML / Python / LangGraph',
              body: C.CodeBlock({ lang: 'json', code: '{\n  "kind": "' + b.id + '",\n  "spec": {}\n}' }) }) +
          '</div>';
      }
    });
  });
})(window.NSCode);

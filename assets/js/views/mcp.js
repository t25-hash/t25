/* MCP Lab (MCP) — MCP理解 */
(function (NSCode) {
  'use strict';
  var tabs = [
    { id: 'explorer', label: 'MCP Explorer', route: '#/mcp/explorer' },
    { id: 'builder', label: 'Server Builder', route: '#/mcp/builder' },
    { id: 'inspector', label: 'MCP Inspector', route: '#/mcp/inspector' }
  ];
  NSCode.registerLab({
    module: 'mcp', title: 'MCP Lab', purpose: 'MCP理解', tabs: tabs,
    screens: {
      '#/mcp/explorer': { title: 'MCP Explorer', purpose: 'Client–Server の接続構造', panels: [
        { title: '接続構造', empty: 'Client / Server / Protocol の関係を図示。' }
      ] },
      '#/mcp/builder': { title: 'MCP Server Builder', purpose: 'Tool / Resource / Prompt を定義', panels: [
        { title: 'Tool', empty: '公開するツールを定義。' },
        { title: 'Resource', empty: '公開するリソースを定義。' },
        { title: 'Prompt', empty: '提供するプロンプトを定義。' }
      ] },
      '#/mcp/inspector': { title: 'MCP Inspector', purpose: '通信内容の確認', panels: [
        { title: '通信ログ', empty: 'JSON-RPC メッセージを表示。' }
      ] }
    }
  });
})(window.NSCode);

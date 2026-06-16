/* MCP Lab (MCP) — explore, build, and inspect an MCP server, fully offline,
 * on ONE page (no tabs). A single server spec (tools / resources / prompts) is
 * shared across sections and persisted. The Explorer diagrams it, the Builder
 * edits it and live-renders the generated config, and the Inspector shows a
 * SIMULATED JSON-RPC handshake. */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, E = NSCode.mcp;

  var DEFAULT_SPEC = {
    name: 'demo-server',
    tools: [
      { name: 'get_weather', description: '指定した都市の現在の天気を返す', params: [{ name: 'city', type: 'string' }, { name: 'units', type: 'string' }] },
      { name: 'add', description: '2 つの数値を加算する', params: [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }] }
    ],
    resources: [
      { uri: 'file:///readme.md', name: 'README' }
    ],
    prompts: [
      { name: 'summarize', args: ['text', 'language'] }
    ]
  };

  var state = NSCode.api.labState('#/mcp') || {};
  state = Object.assign({ spec: null }, state);
  if (!state.spec) state.spec = JSON.parse(JSON.stringify(DEFAULT_SPEC));
  // backfill missing collections defensively
  var s = state.spec;
  s.name = s.name || 'demo-server';
  s.tools = s.tools || [];
  s.resources = s.resources || [];
  s.prompts = s.prompts || [];

  function persist() { NSCode.api.labState('#/mcp', state); }
  function el(id) { return document.getElementById(id); }
  function copyButton(id) {
    return '<div class="ns-actions"><button id="' + id + '" class="ns-btn ns-btn--ghost">コピー</button></div>';
  }
  function wireCopy(btnId, getText) {
    var b = el(btnId); if (!b) return;
    b.addEventListener('click', function () {
      var t = getText();
      if (navigator.clipboard) navigator.clipboard.writeText(t);
      b.textContent = 'コピーしました ✓';
      setTimeout(function () { b.textContent = 'コピー'; }, 1400);
    });
  }

  /* ============================================================ Single page */
  function render() {
    var sp = state.spec;
    return C.PageHeader({
        title: 'MCP Lab',
        purpose: 'MCP サーバーをオフラインで探索・構築・検査します。1 つのサーバー定義（tools / resources / prompts）を全セクションで共有します。'
      }) +
      // a) Explorer
      C.Panel({ title: 'Explorer — メトリクス', body: '<div id="mcpMetrics"></div>' }) +
      C.Panel({ title: 'Explorer — 接続図', hint: 'Client ⇄ MCP Server ⇄ 公開機能（JSON-RPC over stdio / HTTP・概念図）', body: '<div id="mcpDiagram" class="ns-mcp-diagram"></div>' }) +
      // b) Server Builder
      C.Panel({ title: 'Server Builder — サーバー名', body:
        '<label class="ns-control"><span>name</span><input id="srvName" class="ns-input" value="' + C.esc(sp.name) + '"></label>' }) +
      C.Panel({ title: 'Server Builder — Tools', hint: 'name / description / params', body:
        '<div id="toolsList"></div>' +
        '<div class="ns-mcp-form">' +
          '<input id="tName" class="ns-input" placeholder="tool name (例: search)">' +
          '<input id="tDesc" class="ns-input" placeholder="description">' +
          '<input id="tParams" class="ns-input" placeholder="params: name:type, name:type">' +
          '<div class="ns-actions"><button id="tAdd" class="ns-btn">Tool を追加</button></div>' +
        '</div>' }) +
      C.Panel({ title: 'Server Builder — Resources', hint: 'uri / name', body:
        '<div id="resList"></div>' +
        '<div class="ns-mcp-form">' +
          '<input id="rUri" class="ns-input" placeholder="uri (例: file:///data.json)">' +
          '<input id="rName" class="ns-input" placeholder="name">' +
          '<div class="ns-actions"><button id="rAdd" class="ns-btn">Resource を追加</button></div>' +
        '</div>' }) +
      C.Panel({ title: 'Server Builder — Prompts', hint: 'name / args (カンマ区切り)', body:
        '<div id="prmList"></div>' +
        '<div class="ns-mcp-form">' +
          '<input id="pName" class="ns-input" placeholder="prompt name (例: review)">' +
          '<input id="pArgs" class="ns-input" placeholder="args: a, b, c">' +
          '<div class="ns-actions"><button id="pAdd" class="ns-btn">Prompt を追加</button></div>' +
        '</div>' }) +
      C.Panel({ title: 'Server Builder — 生成された MCP 構成', hint: 'toConfig(spec)', body:
        copyButton('cfgCopy') + '<pre id="cfgOut" class="ns-code"></pre>' }) +
      // c) Inspector
      C.Panel({ title: 'Inspector — 通信シーケンス', hint: 'initialize → tools/list → tools/call ※ シミュレートされた JSON-RPC メッセージです（実際の通信は行いません）', body: '<div id="mcpSeq" class="ns-mcp-seq"></div>' });
  }

  function onMount() {
    // Builder wiring
    el('srvName').addEventListener('input', function () {
      state.spec.name = el('srvName').value || 'mcp-server';
      persist(); renderConfig(); renderExplorer(); renderInspector();
    });
    el('tAdd').addEventListener('click', function () {
      var name = (el('tName').value || '').trim();
      if (!name) return;
      var params = parseParams(el('tParams').value);
      state.spec.tools.push({ name: name, description: (el('tDesc').value || '').trim(), params: params });
      el('tName').value = ''; el('tDesc').value = ''; el('tParams').value = '';
      persist(); renderBuilderLists(); renderConfig(); renderExplorer(); renderInspector();
    });
    el('rAdd').addEventListener('click', function () {
      var uri = (el('rUri').value || '').trim();
      if (!uri) return;
      state.spec.resources.push({ uri: uri, name: (el('rName').value || '').trim() || uri });
      el('rUri').value = ''; el('rName').value = '';
      persist(); renderBuilderLists(); renderConfig(); renderExplorer(); renderInspector();
    });
    el('pAdd').addEventListener('click', function () {
      var name = (el('pName').value || '').trim();
      if (!name) return;
      var args = (el('pArgs').value || '').split(',').map(function (a) { return a.trim(); }).filter(Boolean);
      state.spec.prompts.push({ name: name, args: args });
      el('pName').value = ''; el('pArgs').value = '';
      persist(); renderBuilderLists(); renderConfig(); renderExplorer(); renderInspector();
    });

    wireCopy('cfgCopy', function () { return el('cfgOut').textContent; });

    renderExplorer();
    renderBuilderLists();
    renderConfig();
    renderInspector();
  }

  /* ---- a) Explorer ---- */
  function chips(items, kind) {
    if (!items.length) return '<span class="ns-mcp-chip ns-mcp-chip--empty">なし</span>';
    return items.map(function (it) {
      return '<span class="ns-mcp-chip ns-mcp-chip--' + kind + '">' + C.esc(it) + '</span>';
    }).join('');
  }

  function renderExplorer() {
    var sp = state.spec;
    var m = el('mcpMetrics');
    if (m) {
      m.innerHTML = '<div class="ns-grid" style="--cols:4">' +
        C.Metric({ label: 'Server', value: sp.name }) +
        C.Metric({ label: 'Tools', value: sp.tools.length }) +
        C.Metric({ label: 'Resources', value: sp.resources.length }) +
        C.Metric({ label: 'Prompts', value: sp.prompts.length }) +
        '</div>';
    }
    var d = el('mcpDiagram');
    if (!d) return;
    var toolNames = sp.tools.map(function (t) { return t.name; });
    var resNames = sp.resources.map(function (r) { return r.name || r.uri; });
    var promptNames = sp.prompts.map(function (p) { return p.name; });

    d.innerHTML =
      '<div class="ns-mcp-node ns-mcp-node--client">' +
        '<span class="ns-mcp-node__title">Client</span>' +
        '<span class="ns-mcp-node__sub">NSCode MCP Lab</span>' +
      '</div>' +
      '<div class="ns-mcp-arrow"><span>⇄</span><i>JSON-RPC</i></div>' +
      '<div class="ns-mcp-node ns-mcp-node--server">' +
        '<span class="ns-mcp-node__title">MCP Server</span>' +
        '<span class="ns-mcp-node__sub">' + C.esc(sp.name) + '</span>' +
      '</div>' +
      '<div class="ns-mcp-arrow"><span>⇄</span><i>capabilities</i></div>' +
      '<div class="ns-mcp-caps">' +
        '<div class="ns-mcp-cap ns-mcp-cap--tools"><h4>Tools <em>' + sp.tools.length + '</em></h4><div class="ns-mcp-chips">' + chips(toolNames, 'tools') + '</div></div>' +
        '<div class="ns-mcp-cap ns-mcp-cap--resources"><h4>Resources <em>' + sp.resources.length + '</em></h4><div class="ns-mcp-chips">' + chips(resNames, 'resources') + '</div></div>' +
        '<div class="ns-mcp-cap ns-mcp-cap--prompts"><h4>Prompts <em>' + sp.prompts.length + '</em></h4><div class="ns-mcp-chips">' + chips(promptNames, 'prompts') + '</div></div>' +
      '</div>';
  }

  /* ---- b) Server Builder ---- */
  function parseParams(raw) {
    return (raw || '').split(',').map(function (p) {
      var t = p.trim(); if (!t) return null;
      var kv = t.split(':');
      return { name: kv[0].trim(), type: (kv[1] || 'string').trim() };
    }).filter(Boolean);
  }

  function removeBtn(kind, idx) {
    return '<button class="ns-btn ns-btn--ghost ns-mcp-del" data-kind="' + kind + '" data-idx="' + idx + '">削除</button>';
  }

  function renderBuilderLists() {
    var sp = state.spec;
    var tl = el('toolsList');
    if (tl) {
      tl.innerHTML = sp.tools.length ? sp.tools.map(function (t, i) {
        var ps = (t.params || []).map(function (p) { return p.name + ':' + p.type; }).join(', ');
        return '<div class="ns-mcp-item">' +
          '<div class="ns-mcp-item__main"><b>' + C.esc(t.name) + '</b>' +
          (t.description ? '<span class="ns-mcp-item__desc">' + C.esc(t.description) + '</span>' : '') +
          (ps ? '<span class="ns-mcp-item__meta">(' + C.esc(ps) + ')</span>' : '') + '</div>' +
          removeBtn('tools', i) + '</div>';
      }).join('') : emptyRow('Tool がありません');
    }
    var rl = el('resList');
    if (rl) {
      rl.innerHTML = sp.resources.length ? sp.resources.map(function (r, i) {
        return '<div class="ns-mcp-item">' +
          '<div class="ns-mcp-item__main"><b>' + C.esc(r.name || r.uri) + '</b>' +
          '<span class="ns-mcp-item__meta">' + C.esc(r.uri) + '</span></div>' +
          removeBtn('resources', i) + '</div>';
      }).join('') : emptyRow('Resource がありません');
    }
    var pl = el('prmList');
    if (pl) {
      pl.innerHTML = sp.prompts.length ? sp.prompts.map(function (p, i) {
        var args = (p.args || []).join(', ');
        return '<div class="ns-mcp-item">' +
          '<div class="ns-mcp-item__main"><b>' + C.esc(p.name) + '</b>' +
          (args ? '<span class="ns-mcp-item__meta">args: ' + C.esc(args) + '</span>' : '') + '</div>' +
          removeBtn('prompts', i) + '</div>';
      }).join('') : emptyRow('Prompt がありません');
    }
    // delegate delete clicks
    ['toolsList', 'resList', 'prmList'].forEach(function (id) {
      var box = el(id); if (!box || box._wired) return; box._wired = true;
      box.addEventListener('click', function (ev) {
        var btn = ev.target.closest ? ev.target.closest('.ns-mcp-del') : null;
        if (!btn) return;
        var kind = btn.getAttribute('data-kind'), idx = +btn.getAttribute('data-idx');
        state.spec[kind].splice(idx, 1);
        persist(); renderBuilderLists(); renderConfig(); renderExplorer(); renderInspector();
      });
    });
  }

  function emptyRow(msg) {
    return '<div class="ns-mcp-item ns-mcp-item--empty">' + C.esc(msg) + '</div>';
  }

  function renderConfig() {
    var out = el('cfgOut'); if (!out) return;
    out.textContent = E.toConfig(state.spec);
  }

  /* ---- c) Inspector ---- */
  function renderInspector() {
    var box = el('mcpSeq'); if (!box) return;
    var msgs = E.handshake(state.spec);
    box.innerHTML = msgs.map(function (m) {
      var isReq = m.dir.indexOf('request') !== -1;
      var cls = isReq ? 'is-request' : 'is-response';
      var arrow = isReq ? '→' : '←';
      var dirLabel = isReq ? 'Client → Server (request)' : 'Server → Client (response)';
      return '<div class="ns-mcp-msg ' + cls + '">' +
        '<div class="ns-mcp-msg__head">' +
          '<span class="ns-mcp-msg__arrow">' + arrow + '</span>' +
          '<span class="ns-mcp-msg__method">' + C.esc(m.method) + '</span>' +
          '<span class="ns-mcp-msg__dir">' + C.esc(dirLabel) + '</span>' +
        '</div>' +
        '<pre class="ns-code">' + C.esc(m.json) + '</pre>' +
      '</div>';
    }).join('');
  }

  /* ---- Register ONE page for base route + former sub-routes (aliases) ---- */
  ['#/mcp', '#/mcp/explorer', '#/mcp/builder', '#/mcp/inspector'].forEach(function (route) {
    NSCode.registerView({
      route: route, module: 'mcp', title: 'MCP Lab',
      render: render, onMount: onMount
    });
  });
})(window.NSCode);

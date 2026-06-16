/* Build Lab (BUILD) — Agent/RAG/MCP/Workflow 構築。
 * 左にフォーム（spec をライブ編集・永続化）、右に生成物（JSON/YAML/Python/LangGraph）。
 * 保存で NSCode.api.createArtifact({kind,name,spec}) → Dashboard に表示。 */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;
  var CG = NSCode.codegen;

  var BUILDERS = [
    { id: 'rag', label: 'RAG Builder', route: '#/build/rag', desc: 'チャンク/検索/再ランクの RAG 構成を生成' },
    { id: 'agent', label: 'Agent Builder', route: '#/build/agent', desc: '単一エージェント（ツール・最大ステップ）' },
    { id: 'multi-agent', label: 'MultiAgent Builder', route: '#/build/multi-agent', desc: 'マネージャ＋複数ロールのチーム構成' },
    { id: 'mcp', label: 'MCP Builder', route: '#/build/mcp', desc: 'MCP サーバとツール定義' },
    { id: 'workflow', label: 'Workflow Builder', route: '#/build/workflow', desc: '順序付きステップのワークフロー' }
  ];

  var FORMATS = [
    { id: 'json', label: 'JSON' },
    { id: 'yaml', label: 'YAML' },
    { id: 'python', label: 'Python' },
    { id: 'langgraph', label: 'LangGraph' }
  ];

  var DEFAULTS = {
    rag: { chunkSize: 512, overlap: 64, topK: 4, embeddingModel: 'text-embedding-3-small', rerank: true, threshold: 0.2 },
    agent: { name: 'Researcher', goal: 'ユーザーの質問を調べて簡潔に回答する', tools: ['search', 'read_file'], maxSteps: 8 },
    'multi-agent': { manager: 'Orchestrator', roles: ['Planner', 'Researcher', 'Coder', 'Reviewer'], rounds: 3 },
    mcp: { serverName: 'my-mcp-server', tools: [{ name: 'get_weather', description: '都市の天気を取得する' }] },
    workflow: { name: 'support-triage', steps: [{ name: 'classify', type: 'llm' }, { name: 'lookup', type: 'tool' }, { name: 'needs_human', type: 'condition' }] }
  };

  var EMBEDDING_MODELS = ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002', 'voyage-3', 'bge-large-en'];
  var AGENT_TOOLS = ['search', 'read_file', 'write_file', 'terminal', 'browser', 'database'];
  var ROLE_OPTS = ['Planner', 'Researcher', 'Coder', 'Reviewer', 'Tester'];
  var STEP_TYPES = ['llm', 'tool', 'condition'];

  function el(id) { return document.getElementById(id); }

  function loadSpec(kind) {
    var saved = NSCode.api.labState('#/build/' + kind);
    var d = DEFAULTS[kind];
    if (!saved) return JSON.parse(JSON.stringify(d));
    // shallow-merge to keep new default keys if any
    var merged = JSON.parse(JSON.stringify(d));
    for (var k in saved) { if (Object.prototype.hasOwnProperty.call(saved, k)) merged[k] = saved[k]; }
    return merged;
  }
  function persist(kind, spec) { NSCode.api.labState('#/build/' + kind, spec); }

  function range(id, min, max, step, val) {
    return '<input id="' + id + '" class="ns-range" type="range" min="' + min + '" max="' + max +
      '" step="' + (step || 1) + '" value="' + C.esc(val) + '">';
  }
  function selectEl(id, opts, val) {
    return '<select id="' + id + '" class="ns-input">' + opts.map(function (o) {
      var v = typeof o === 'string' ? o : o.value;
      var lbl = typeof o === 'string' ? o : o.label;
      return '<option value="' + C.esc(v) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + C.esc(lbl) + '</option>';
    }).join('') + '</select>';
  }
  function checkboxList(name, opts, selected) {
    var sel = {}; (selected || []).forEach(function (s) { sel[s] = 1; });
    return '<div class="bl-checks">' + opts.map(function (o) {
      return '<label class="bl-check"><input type="checkbox" data-' + name + '="' + C.esc(o) + '"' +
        (sel[o] ? ' checked' : '') + '> <span>' + C.esc(o) + '</span></label>';
    }).join('') + '</div>';
  }

  /* ---------- landing ---------- */
  NSCode.registerView({
    route: '#/build', module: 'build', title: 'Build Lab',
    render: function () {
      var cards = BUILDERS.map(function (b) {
        return C.Card({ title: b.label, badge: b.id, body: C.esc(b.desc), href: b.route });
      }).join('');
      return C.PageHeader({ title: 'Build Lab', purpose: '構成を編集して JSON / YAML / Python / LangGraph を生成し、成果物として保存' }) +
        C.Grid(cards, 3);
    }
  });

  /* ---------- shared builder shell ---------- */
  function builderView(b, formBody, wire) {
    return {
      route: b.route, module: 'build', title: b.label,
      render: function () {
        return C.PageHeader({ title: b.label, purpose: '構成を編集すると 4 形式の出力が即時更新されます',
            breadcrumb: ['Build Lab', b.label] }) +
          '<p class="bl-back"><a href="#/build" class="ns-tab">&larr; Build Lab に戻る</a></p>' +
          '<div class="ns-grid bl-cols" style="--cols:2">' +
            C.Panel({ title: '構成', body: formBody() }) +
            C.Panel({ title: '出力', hint: 'JSON / YAML / Python / LangGraph', body:
              C.Controls([{ label: '形式', control: '<select id="blFmt" class="ns-input">' +
                FORMATS.map(function (f) { return '<option value="' + f.id + '">' + f.label + '</option>'; }).join('') + '</select>' }]) +
              '<pre id="blOut" class="ns-code"></pre>' +
              '<div class="ns-actions">' +
                '<button id="blCopy" class="ns-btn ns-btn--ghost">コピー</button>' +
                '<button id="blSave" class="ns-btn">保存（成果物に追加）</button>' +
                '<span id="blMsg" class="bl-msg"></span>' +
              '</div>' }) +
          '</div>';
      },
      onMount: function () {
        var kind = b.id;
        var spec = loadSpec(kind);
        var fmt = 'json';

        function refresh() {
          var out = el('blOut'); if (!out) return;
          out.textContent = CG.generate(kind, spec, fmt);
          out.setAttribute('data-lang', fmt);
        }
        function commit() { persist(kind, spec); refresh(); }

        // format selector
        var fmtSel = el('blFmt');
        if (fmtSel) { fmtSel.value = fmt; fmtSel.addEventListener('change', function () { fmt = fmtSel.value; refresh(); }); }

        el('blCopy').addEventListener('click', function () {
          var t = el('blOut').textContent;
          if (navigator.clipboard) navigator.clipboard.writeText(t);
          el('blCopy').textContent = 'コピーしました ✓';
          setTimeout(function () { var c = el('blCopy'); if (c) c.textContent = 'コピー'; }, 1500);
        });
        el('blSave').addEventListener('click', function () {
          var name = (spec.name || spec.serverName || spec.manager || b.label);
          var art = NSCode.api.createArtifact({
            kind: kind, name: name,
            spec: JSON.parse(JSON.stringify(spec))
          });
          var msg = el('blMsg');
          if (msg) msg.textContent = '保存しました ✓ (id: ' + art.id + ') — Dashboard に表示';
        });

        // builder-specific wiring; gets {spec, commit, refresh}
        wire({ spec: spec, commit: commit, refresh: refresh });
        refresh();
      }
    };
  }

  /* ---------- RAG ---------- */
  NSCode.registerView(builderView(BUILDERS[0],
    function () {
      var s = loadSpec('rag');
      return C.Controls([
        { label: 'Chunk Size: <b id="vChunk">' + s.chunkSize + '</b>', control: range('fChunk', 64, 2048, 16, s.chunkSize) },
        { label: 'Overlap: <b id="vOver">' + s.overlap + '</b>', control: range('fOver', 0, 512, 8, s.overlap) },
        { label: 'TopK: <b id="vTopK">' + s.topK + '</b>', control: range('fTopK', 1, 20, 1, s.topK) },
        { label: 'Threshold: <b id="vThr">' + s.threshold + '</b>', control: range('fThr', 0, 1, 0.05, s.threshold) },
        { label: 'Embedding Model', control: selectEl('fEmb', EMBEDDING_MODELS, s.embeddingModel) },
        { label: '<label class="bl-inline"><input type="checkbox" id="fRerank"' + (s.rerank ? ' checked' : '') + '> ReRank を有効化</label>', control: '' }
      ]);
    },
    function (ctx) {
      var s = ctx.spec;
      function upd() {
        s.chunkSize = +el('fChunk').value;
        s.overlap = Math.min(+el('fOver').value, s.chunkSize);
        s.topK = +el('fTopK').value;
        s.threshold = +el('fThr').value;
        s.embeddingModel = el('fEmb').value;
        s.rerank = el('fRerank').checked;
        el('vChunk').textContent = s.chunkSize;
        el('vOver').textContent = s.overlap;
        el('vTopK').textContent = s.topK;
        el('vThr').textContent = s.threshold;
        ctx.commit();
      }
      ['fChunk', 'fOver', 'fTopK', 'fThr'].forEach(function (id) { el(id).addEventListener('input', upd); });
      el('fEmb').addEventListener('change', upd);
      el('fRerank').addEventListener('change', upd);
    }
  ));

  /* ---------- Agent ---------- */
  NSCode.registerView(builderView(BUILDERS[1],
    function () {
      var s = loadSpec('agent');
      return C.Controls([
        { label: 'Name', control: '<input id="fName" class="ns-input" value="' + C.esc(s.name) + '">' },
        { label: 'Goal', control: '<textarea id="fGoal" class="ns-input" rows="2">' + C.esc(s.goal) + '</textarea>' },
        { label: 'Tools', control: checkboxList('tool', AGENT_TOOLS, s.tools) },
        { label: 'Max Steps: <b id="vSteps">' + s.maxSteps + '</b>', control: range('fSteps', 1, 50, 1, s.maxSteps) }
      ]);
    },
    function (ctx) {
      var s = ctx.spec;
      function collect(name) {
        var out = [], n = document.querySelectorAll('[data-' + name + ']');
        for (var i = 0; i < n.length; i++) if (n[i].checked) out.push(n[i].getAttribute('data-' + name));
        return out;
      }
      function upd() {
        s.name = el('fName').value;
        s.goal = el('fGoal').value;
        s.tools = collect('tool');
        s.maxSteps = +el('fSteps').value;
        el('vSteps').textContent = s.maxSteps;
        ctx.commit();
      }
      el('fName').addEventListener('input', upd);
      el('fGoal').addEventListener('input', upd);
      el('fSteps').addEventListener('input', upd);
      var checks = document.querySelectorAll('[data-tool]');
      for (var i = 0; i < checks.length; i++) checks[i].addEventListener('change', upd);
    }
  ));

  /* ---------- MultiAgent ---------- */
  NSCode.registerView(builderView(BUILDERS[2],
    function () {
      var s = loadSpec('multi-agent');
      return C.Controls([
        { label: 'Manager', control: '<input id="fMgr" class="ns-input" value="' + C.esc(s.manager) + '">' },
        { label: 'Roles', control: checkboxList('role', ROLE_OPTS, s.roles) },
        { label: 'Rounds: <b id="vRounds">' + s.rounds + '</b>', control: range('fRounds', 1, 10, 1, s.rounds) }
      ]);
    },
    function (ctx) {
      var s = ctx.spec;
      function collect() {
        var out = [], n = document.querySelectorAll('[data-role]');
        for (var i = 0; i < n.length; i++) if (n[i].checked) out.push(n[i].getAttribute('data-role'));
        return out;
      }
      function upd() {
        s.manager = el('fMgr').value;
        s.roles = collect();
        s.rounds = +el('fRounds').value;
        el('vRounds').textContent = s.rounds;
        ctx.commit();
      }
      el('fMgr').addEventListener('input', upd);
      el('fRounds').addEventListener('input', upd);
      var checks = document.querySelectorAll('[data-role]');
      for (var i = 0; i < checks.length; i++) checks[i].addEventListener('change', upd);
    }
  ));

  /* ---------- MCP ---------- */
  NSCode.registerView(builderView(BUILDERS[3],
    function () {
      var s = loadSpec('mcp');
      return '<div class="ns-controls">' +
        '<label class="ns-control"><span>Server Name</span><input id="fServer" class="ns-input" value="' + C.esc(s.serverName) + '"></label>' +
        '</div>' +
        '<div class="ns-actions"><button id="fAddTool" class="ns-btn ns-btn--ghost">+ ツール追加</button></div>' +
        '<div id="fTools" class="bl-list"></div>';
    },
    function (ctx) {
      var s = ctx.spec;
      if (!s.tools) s.tools = [];
      function renderTools() {
        var box = el('fTools'); if (!box) return;
        box.innerHTML = s.tools.map(function (t, i) {
          return '<div class="bl-row">' +
            '<input class="ns-input" data-tname="' + i + '" placeholder="tool name" value="' + C.esc(t.name) + '">' +
            '<input class="ns-input" data-tdesc="' + i + '" placeholder="description" value="' + C.esc(t.description) + '">' +
            '<button class="ns-btn ns-btn--ghost" data-trm="' + i + '">×</button>' +
          '</div>';
        }).join('') || '<p class="ns-empty__hint">ツールがありません。「+ ツール追加」で追加してください。</p>';
        bindRows();
      }
      function bindRows() {
        var names = document.querySelectorAll('[data-tname]');
        for (var i = 0; i < names.length; i++) (function (inp) {
          inp.addEventListener('input', function () { s.tools[+inp.getAttribute('data-tname')].name = inp.value; ctx.commit(); });
        })(names[i]);
        var descs = document.querySelectorAll('[data-tdesc]');
        for (var j = 0; j < descs.length; j++) (function (inp) {
          inp.addEventListener('input', function () { s.tools[+inp.getAttribute('data-tdesc')].description = inp.value; ctx.commit(); });
        })(descs[j]);
        var rms = document.querySelectorAll('[data-trm]');
        for (var k = 0; k < rms.length; k++) (function (btn) {
          btn.addEventListener('click', function () { s.tools.splice(+btn.getAttribute('data-trm'), 1); ctx.commit(); renderTools(); });
        })(rms[k]);
      }
      el('fServer').addEventListener('input', function () { s.serverName = el('fServer').value; ctx.commit(); });
      el('fAddTool').addEventListener('click', function () {
        s.tools.push({ name: 'new_tool', description: '' }); ctx.commit(); renderTools();
      });
      renderTools();
    }
  ));

  /* ---------- Workflow ---------- */
  NSCode.registerView(builderView(BUILDERS[4],
    function () {
      var s = loadSpec('workflow');
      return '<div class="ns-controls">' +
        '<label class="ns-control"><span>Name</span><input id="fWfName" class="ns-input" value="' + C.esc(s.name) + '"></label>' +
        '</div>' +
        '<div class="ns-actions"><button id="fAddStep" class="ns-btn ns-btn--ghost">+ ステップ追加</button></div>' +
        '<div id="fSteps2" class="bl-list"></div>';
    },
    function (ctx) {
      var s = ctx.spec;
      if (!s.steps) s.steps = [];
      function renderSteps() {
        var box = el('fSteps2'); if (!box) return;
        box.innerHTML = s.steps.map(function (st, i) {
          return '<div class="bl-row bl-row--step">' +
            '<span class="bl-num">' + (i + 1) + '</span>' +
            '<input class="ns-input" data-sname="' + i + '" placeholder="step name" value="' + C.esc(st.name) + '">' +
            selectEl2('stype-' + i, STEP_TYPES, st.type, i) +
            '<button class="ns-btn ns-btn--ghost" data-sup="' + i + '" title="上へ">↑</button>' +
            '<button class="ns-btn ns-btn--ghost" data-sdn="' + i + '" title="下へ">↓</button>' +
            '<button class="ns-btn ns-btn--ghost" data-srm="' + i + '">×</button>' +
          '</div>';
        }).join('') || '<p class="ns-empty__hint">ステップがありません。「+ ステップ追加」で追加してください。</p>';
        bindSteps();
      }
      function selectEl2(id, opts, val, i) {
        return '<select class="ns-input" data-stype="' + i + '">' + opts.map(function (o) {
          return '<option value="' + o + '"' + (o === val ? ' selected' : '') + '>' + o + '</option>';
        }).join('') + '</select>';
      }
      function bindSteps() {
        var names = document.querySelectorAll('[data-sname]');
        for (var i = 0; i < names.length; i++) (function (inp) {
          inp.addEventListener('input', function () { s.steps[+inp.getAttribute('data-sname')].name = inp.value; ctx.commit(); });
        })(names[i]);
        var types = document.querySelectorAll('[data-stype]');
        for (var j = 0; j < types.length; j++) (function (sel) {
          sel.addEventListener('change', function () { s.steps[+sel.getAttribute('data-stype')].type = sel.value; ctx.commit(); });
        })(types[j]);
        var ups = document.querySelectorAll('[data-sup]');
        for (var k = 0; k < ups.length; k++) (function (btn) {
          btn.addEventListener('click', function () { move(+btn.getAttribute('data-sup'), -1); });
        })(ups[k]);
        var dns = document.querySelectorAll('[data-sdn]');
        for (var m = 0; m < dns.length; m++) (function (btn) {
          btn.addEventListener('click', function () { move(+btn.getAttribute('data-sdn'), 1); });
        })(dns[m]);
        var rms = document.querySelectorAll('[data-srm]');
        for (var n = 0; n < rms.length; n++) (function (btn) {
          btn.addEventListener('click', function () { s.steps.splice(+btn.getAttribute('data-srm'), 1); ctx.commit(); renderSteps(); });
        })(rms[n]);
      }
      function move(i, dir) {
        var j = i + dir;
        if (j < 0 || j >= s.steps.length) return;
        var tmp = s.steps[i]; s.steps[i] = s.steps[j]; s.steps[j] = tmp;
        ctx.commit(); renderSteps();
      }
      el('fWfName').addEventListener('input', function () { s.name = el('fWfName').value; ctx.commit(); });
      el('fAddStep').addEventListener('click', function () {
        s.steps.push({ name: 'step_' + (s.steps.length + 1), type: 'llm' }); ctx.commit(); renderSteps();
      });
      renderSteps();
    }
  ));
})(window.NSCode);

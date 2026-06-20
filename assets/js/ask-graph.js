/* NSCode Ask Graph — an Obsidian-style force-directed "knowledge / system map" for
 * the Ask lab's desktop right rail. Two hubs — KB(知識) and JS(システム) — branch into
 * category nodes, then topic / 用語(意味単位) nodes (from the curated DEFAULT_DOCS and the
 * glossary), webbed together by shared-meaning edges (cosine similarity of topic text).
 * Clicking a KB node seeds a question into the Ask input (#askQ) — a trigger for the
 * asker; clicking a JS node navigates to that Lab. Layout is seeded by PCA then relaxed
 * with a tiny force simulation that settles and STOPS (battery-safe). Pure in-browser,
 * no external libraries. Desktop-only — gated by matchMedia and hidden on mobile via CSS,
 * so the phone UI is untouched. */
(function (NSCode) {
  'use strict';

  var DESKTOP = '(min-width: 1024px)';
  var VW = 100, VH = 140, CX = 50, CY = 66;                 // SVG viewBox + center
  var PALETTE = { kb: '#6ea8fe', cat: '#5ee0c0', topic: '#8ab4ff', term: '#c792ea', calc: '#f6bd60', formula: '#f6bd60', table: '#f0975a' };

  // mechanical-engineering KB topics: clean short labels keyed by DEFAULT_DOCS prefix.
  var TOPIC_LABEL = {
    20: '機械要素', 21: '歯車', 22: '歯車の強度', 23: '軸', 24: '軸受',
    25: 'ねじ・ばね', 26: '材料力学', 27: '公差', 28: '強度評価',
    30: '機械工学', 31: '機械設計', 32: 'パルプ紙'
  };
  // a topic that names a FAMILY of parts → ask for its kinds, otherwise ask "とは".
  var KINDS = { '機械要素': 1, '歯車': 1, '軸受': 1, 'ねじ・ばね': 1 };

  var GRAPH = null;     // cached settled model { nodes, edges, byId, adj }
  var container = null, raf = 0, hoverId = '', filter = '', mql = null, mqlHandler = null;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function trunc(s, n) { s = String(s || ''); return s.length > (n || 8) ? s.slice(0, n || 8) + '…' : s; }
  function emb(t) { return NSCode.embeddings.embed(t, 64); }

  /* ---- build the node/edge model (positions filled later by layout) ---- */
  function buildModel() {
    var A = NSCode.askEngine, docs = (A && A.DEFAULT_DOCS) || [];
    var nodes = [], edges = [], byId = {};
    function add(n) { n.x = CX + (Math.random() - 0.5) * 6; n.y = CY + (Math.random() - 0.5) * 6; n.vx = 0; n.vy = 0; nodes.push(n); byId[n.id] = n; return n; }
    function link(a, b, rest) { edges.push([a, b, rest]); }

    var kb = add({ id: 'hub-kb', label: 'KB 知識', type: 'kb', vec: emb('機械工学 知識 KB') });
    var calc = add({ id: 'hub-calc', label: '計算式・表', type: 'calc', vec: emb('計算式 公式 表 設計計算') });

    // KB categories
    var cats = { mech: '機械工学概説', elem: '機械要素・材料', term: '用語' };
    Object.keys(cats).forEach(function (k) {
      add({ id: 'cat-' + k, label: cats[k], type: 'cat', vec: emb(cats[k]) });
      link('hub-kb', 'cat-' + k, 22);
    });

    // KB topic nodes from the curated mechanical docs (20–32)
    var topics = [];
    docs.forEach(function (d) {
      var pre = parseInt(d.name, 10);
      if (!TOPIC_LABEL[pre]) return;
      var label = TOPIC_LABEL[pre];
      var cat = pre >= 30 ? 'cat-mech' : 'cat-elem';
      var snippet = (d.text || '').slice(0, 240);
      var n = add({ id: 'topic-' + pre, label: label, type: 'topic', vec: emb(label + ' ' + snippet) });
      n.doc = { kind: 'md', title: label, text: d.text || '', source: d.name };   // 全文 (curated Md)
      link(cat, n.id, 14);
      topics.push(n);
    });

    // cross-links: web related topics by cosine similarity (top-3 neighbours each)
    var C = NSCode.embeddings.cosine, seen = {};
    topics.forEach(function (a) {
      var sims = topics.filter(function (b) { return b !== a; })
        .map(function (b) { return { b: b, s: C(a.vec, b.vec) }; })
        .sort(function (x, y) { return y.s - x.s; }).slice(0, 3);
      sims.forEach(function (o) {
        if (o.s < 0.45) return;
        var key = [a.id, o.b.id].sort().join('|'); if (seen[key]) return; seen[key] = 1;
        link(a.id, o.b.id, 16);
      });
    });

    // 用語(意味単位) leaves from the glossary doc (40): 「Xは、…」 → X
    var gloss = docs.filter(function (d) { return /^40[-_]/.test(d.name) || /用語集/.test(d.name); })[0];
    if (gloss) {
      var terms = [], tseen = {};
      (gloss.text || '').split(/\n\n+/).forEach(function (p) {
        var m = p.match(/^([^\s、，。]{2,8}?)は[、，]/);
        if (m && !tseen[m[1]]) { tseen[m[1]] = 1; terms.push({ t: m[1], p: p.trim() }); }
      });
      terms.slice(0, 24).forEach(function (e, i) {
        var n = add({ id: 'term-' + i, label: e.t, type: 'term', vec: emb(e.t) });
        n.doc = { kind: 'md', title: e.t, text: e.p, source: gloss.name };   // 用語の定義(全文)
        link('cat-term', n.id, 11);
      });
    }

    // 計算式・表(計算式DB Md) ノード: NSCode.calc の式/表レジストリ(意味単位)。各式・表は
    // その「トリガ語」または埋め込み類似で関連KBトピック/用語へ接続し、知識と計算を webbing する。
    var CALC = NSCode.calc || { FORMULAS: [], TABLES: [] };
    var kbNodes = nodes.filter(function (n) { return n.type === 'topic' || n.type === 'term'; });
    function shortName(s) { return String(s || '').replace(/（[^）]*）|\([^)]*\)/g, '').trim(); }
    function bestKB(vec, terms) {
      return kbNodes.map(function (k) {
        var ov = terms.some(function (t) { return k.label && (k.label.indexOf(t) >= 0 || t.indexOf(k.label) >= 0); }) ? 1 : 0;
        return { k: k, s: C(vec, k.vec) + 0.4 * ov };
      }).sort(function (a, b) { return b.s - a.s; }).slice(0, 2).filter(function (o) { return o.s > 0.34; });
    }
    (CALC.FORMULAS || []).forEach(function (f) {
      var lbl = shortName(f.name), tr = f.terms || [];
      var n = add({ id: 'f-' + f.id, label: lbl, type: 'formula', q: lbl + 'はどう求めますか？', vec: emb(f.name + ' ' + tr.join(' ')) });
      n.doc = { kind: 'formula', title: f.name, formula: f };
      link('hub-calc', n.id, 18);
      bestKB(n.vec, tr).forEach(function (o) { link(n.id, o.k.id, 15); });
    });
    (CALC.TABLES || []).forEach(function (t) {
      var lbl = shortName(t.name), tr = t.terms || [];
      var n = add({ id: 't-' + t.id, label: lbl, type: 'table', q: lbl + 'は？', vec: emb(t.name + ' ' + tr.join(' ')) });
      n.doc = { kind: 'table', title: t.name, table: t };
      link('hub-calc', n.id, 18);
      bestKB(n.vec, tr).forEach(function (o) { link(n.id, o.k.id, 15); });
    });

    // adjacency for hover highlighting
    var adj = {}; nodes.forEach(function (n) { adj[n.id] = {}; });
    edges.forEach(function (e) { adj[e[0]][e[1]] = 1; adj[e[1]][e[0]] = 1; });

    return { nodes: nodes, edges: edges, byId: byId, adj: adj };
  }

  /* ---- seed positions with PCA, then relax with a small force simulation ---- */
  function seedPCA(model) {
    var pts;
    try { pts = NSCode.embeddings.pca2(model.nodes.map(function (n) { return n.vec; })); }
    catch (e) { pts = null; }
    if (!pts) return;
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var mnx = Math.min.apply(null, xs), mxx = Math.max.apply(null, xs);
    var mny = Math.min.apply(null, ys), mxy = Math.max.apply(null, ys);
    var sx = function (x) { return 12 + (mxx > mnx ? (x - mnx) / (mxx - mnx) : 0.5) * (VW - 24); };
    var sy = function (y) { return 14 + (mxy > mny ? (y - mny) / (mxy - mny) : 0.5) * (VH - 28); };
    model.nodes.forEach(function (n, i) { n.x = sx(pts[i][0]); n.y = sy(pts[i][1]); });
  }

  // anchors keep the KB cluster and JS cluster visually apart (Obsidian feel)
  var ANCHOR = { 'hub-kb': [32, 80], 'hub-calc': [70, 36] };
  function step(model) {
    var ns = model.nodes, i, j, a, b, dx, dy, d2, d, f;
    // repulsion
    for (i = 0; i < ns.length; i++) {
      a = ns[i];
      for (j = i + 1; j < ns.length; j++) {
        b = ns[j]; dx = a.x - b.x; dy = a.y - b.y; d2 = dx * dx + dy * dy + 0.02; d = Math.sqrt(d2);
        f = 16 / d2; var ux = dx / d, uy = dy / d;
        a.vx += f * ux; a.vy += f * uy; b.vx -= f * ux; b.vy -= f * uy;
      }
    }
    // springs (edges)
    model.edges.forEach(function (e) {
      a = model.byId[e[0]]; b = model.byId[e[1]]; var rest = e[2] || 14;
      dx = b.x - a.x; dy = b.y - a.y; d = Math.sqrt(dx * dx + dy * dy) + 0.001;
      f = 0.02 * (d - rest); var ux = dx / d, uy = dy / d;
      a.vx += f * ux; a.vy += f * uy; b.vx -= f * ux; b.vy -= f * uy;
    });
    // centering + anchors
    var energy = 0;
    ns.forEach(function (n) {
      var ax = ANCHOR[n.id] ? ANCHOR[n.id][0] : CX, ay = ANCHOR[n.id] ? ANCHOR[n.id][1] : CY;
      var k = ANCHOR[n.id] ? 0.03 : 0.006;
      n.vx += (ax - n.x) * k; n.vy += (ay - n.y) * k;
      n.vx *= 0.85; n.vy *= 0.85;
      n.x += n.vx; n.y += n.vy;
      n.x = Math.max(4, Math.min(VW - 4, n.x)); n.y = Math.max(5, Math.min(VH - 5, n.y));
      energy += n.vx * n.vx + n.vy * n.vy;
    });
    return energy;
  }

  /* ---- render one SVG from current positions ---- */
  function radius(n) { return n.type === 'kb' || n.type === 'calc' ? 3 : n.type === 'cat' ? 2.2 : n.type === 'term' ? 1.2 : 1.7; }
  function fontSize(n) { return n.type === 'kb' || n.type === 'calc' ? 3.4 : n.type === 'cat' ? 2.9 : n.type === 'term' ? 2.3 : 2.7; }
  function render() {
    if (!container || !GRAPH) return;
    var hi = hoverId, nb = hi ? GRAPH.adj[hi] : null;
    function dim(id) {
      var n = GRAPH.byId[id];
      if (filter && (!n.label || n.label.toLowerCase().indexOf(filter) < 0)) return true;   // search filter
      return hi && id !== hi && !(nb && nb[id]);                                            // hover focus
    }
    var out = '<svg class="ns-graph-svg" viewBox="0 0 ' + VW + ' ' + VH + '" preserveAspectRatio="xMidYMid meet">';
    GRAPH.edges.forEach(function (e) {
      var a = GRAPH.byId[e[0]], b = GRAPH.byId[e[1]], on = hi && (e[0] === hi || e[1] === hi);
      out += '<line x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) +
        '" stroke="' + (on ? 'rgba(150,180,240,.65)' : 'rgba(150,170,210,.16)') + '" stroke-width="' + (on ? 0.5 : 0.28) + '"/>';
    });
    GRAPH.nodes.forEach(function (n) {
      var o = dim(n.id) ? 0.16 : 1, col = PALETTE[n.type] || '#9aa4bf';
      out += '<g data-id="' + n.id + '" class="ns-graph-node" opacity="' + o + '">' +
        '<circle cx="' + n.x.toFixed(1) + '" cy="' + n.y.toFixed(1) + '" r="' + radius(n) + '" fill="' + col + '" stroke="#0c0e14" stroke-width="0.3"/>' +
        '<text x="' + (n.x + radius(n) + 0.6).toFixed(1) + '" y="' + (n.y + 0.9).toFixed(1) + '" font-size="' + fontSize(n) + '" fill="#dfe6f5">' + esc(trunc(n.label, n.type === 'term' ? 7 : 9)) + '</text>' +
        '</g>';
    });
    out += '</svg>';
    container.innerHTML = out;
  }

  function animate(model, tick) {
    var energy = step(model);
    render();
    if (tick < 320 && energy > 0.05) { raf = window.requestAnimationFrame(function () { animate(model, tick + 1); }); }
    else { raf = 0; model.settled = true; }   // settled — stop the loop (battery), remember it
  }

  /* ---- interactions (delegated on the container so they survive re-render) ---- */
  function setQ(q) {
    var inp = document.getElementById('askQ'); if (!inp) return;
    inp.value = q;
    inp.dispatchEvent(new Event('input', { bubbles: true }));   // lets ask.js sync state.query + persist
    inp.focus();
  }
  // selecting a node OUTPUTS its source as an answer in the chat (Md全文 / 式・表).
  function open(n) {
    if (!n) return;
    if (n.doc && NSCode.askChat && NSCode.askChat.showNode) { NSCode.askChat.showNode(n.doc); return; }
    if (n.type === 'kb' || n.type === 'calc') { var inp = document.getElementById('askQ'); if (inp) inp.focus(); return; }
    setQ(KINDS[n.label] ? n.label + 'の種類は？' : n.label + 'とは？');   // category fallback → seed a question
  }
  function onClick(e) {
    var g = e.target.closest && e.target.closest('[data-id]'); if (!g || !GRAPH) return;
    open(GRAPH.byId[g.getAttribute('data-id')]);
  }
  /* node search (input lives below the map): filter dims non-matches; Enter opens the best match */
  function norm(s) { return String(s == null ? '' : s).toLowerCase().trim(); }
  function search(str) { filter = norm(str); if (!raf) render(); }
  function selectFirst(str) {
    var f = norm(str); if (!f || !GRAPH) return;
    var hits = GRAPH.nodes.filter(function (n) { return n.doc && norm(n.label).indexOf(f) >= 0; })
      .sort(function (a, b) { return (norm(a.label).indexOf(f) - norm(b.label).indexOf(f)) || (a.label.length - b.label.length); });
    if (!hits.length) return;
    hoverId = hits[0].id; if (!raf) render();
    open(hits[0]);
  }
  function onHover(e) {
    var g = e.target.closest && e.target.closest('[data-id]');
    var id = g ? g.getAttribute('data-id') : '';
    if (id !== hoverId) { hoverId = id; if (!raf) render(); }   // re-render only when idle (post-settle)
  }

  /* ---- public mount / unmount ---- */
  function build() {
    if (!GRAPH) { GRAPH = buildModel(); seedPCA(GRAPH); }
    render();
    if (!GRAPH.settled && !raf) animate(GRAPH, 0);   // re-visits reuse the settled layout (no re-jiggle)
  }
  function mount(el) {
    container = el; if (!container || !NSCode.embeddings || !NSCode.askEngine) return;
    container.addEventListener('click', onClick);
    container.addEventListener('mousemove', onHover);
    container.addEventListener('mouseleave', function () { if (hoverId) { hoverId = ''; if (!raf) render(); } });
    mql = window.matchMedia(DESKTOP);
    if (mql.matches) build();
    else {                                                  // mobile: defer build until the rail is actually shown
      mqlHandler = function (ev) { if ((ev.matches != null ? ev.matches : mql.matches) && container) build(); };
      if (mql.addEventListener) mql.addEventListener('change', mqlHandler); else if (mql.addListener) mql.addListener(mqlHandler);
    }
  }
  function unmount() {
    if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
    if (mql && mqlHandler) { if (mql.removeEventListener) mql.removeEventListener('change', mqlHandler); else if (mql.removeListener) mql.removeListener(mqlHandler); }
    mqlHandler = null; mql = null; container = null; hoverId = ''; filter = '';
  }

  NSCode.askGraph = { mount: mount, unmount: unmount, search: search, selectFirst: selectFirst, _build: buildModel };
})(window.NSCode);

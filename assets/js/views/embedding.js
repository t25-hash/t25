/* Embedding Lab (EMB) — working, offline embedding exploration.
 * Token Visualizer / Embedding Viewer / Similarity Viewer / Cluster Viewer.
 * Vectors are local hashing-trick embeddings (lexical, deterministic); the UI
 * states this so the difference from neural embeddings is clear. */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, E = NSCode.embeddings;
  var DIM = 64;

  var tabs = [
    { id: 'token', label: 'Token Visualizer', route: '#/embedding/token' },
    { id: 'vector', label: 'Embedding Viewer', route: '#/embedding/vector' },
    { id: 'similarity', label: 'Similarity Viewer', route: '#/embedding/similarity' },
    { id: 'cluster', label: 'Cluster Viewer', route: '#/embedding/cluster' }
  ];

  var state = Object.assign({
    tokenText: 'Embeddings は文を数値ベクトルに変換します。',
    embText: 'retrieval augmented generation',
    simA: 'cat dog animal pet',
    simB: 'dog cat pet animal',
    clusterText: ['cat dog pet animal', 'lion tiger wild animal', 'fish bird small pet',
      'python javascript code function', 'java rust compiler code', 'variable loop function code',
      'pizza sushi food meal', 'burger pasta dinner food', 'rice noodle lunch food'].join('\n')
  }, NSCode.api.labState('#/embedding') || {});

  function persist() { NSCode.api.labState('#/embedding', state); }
  function el(id) { return document.getElementById(id); }
  function header(s) { return C.PageHeader({ title: s.title, purpose: s.purpose, breadcrumb: ['Embedding Lab', s.title] }) + C.Tabs(tabs, s.route); }

  /* ---------- Token Visualizer ---------- */
  NSCode.registerView({
    route: '#/embedding/token', module: 'embedding', title: 'Token Visualizer',
    render: function () {
      return header({ title: 'Token Visualizer', purpose: '入力文 → Token分解 → Token ID（簡易トークナイザ）', route: '#/embedding/token' }) +
        C.Panel({ title: '入力文', body: '<textarea id="tkText" class="ns-input" rows="3">' + C.esc(state.tokenText) + '</textarea>' }) +
        C.Panel({ title: 'Token 分解 / ID', hint: 'BPE ではない簡易分割（語/数字/CJK字/記号）', body: '<div id="tkOut"></div>' });
    },
    onMount: function () {
      el('tkText').addEventListener('input', function () { state.tokenText = el('tkText').value; persist(); renderTokens(); });
      renderTokens();
    }
  });
  function renderTokens() {
    var out = el('tkOut'); if (!out) return;
    var toks = E.tokenize(state.tokenText);
    out.innerHTML = '<div class="ns-grid" style="--cols:3">' +
      C.Metric({ label: 'トークン数', value: toks.length }) +
      C.Metric({ label: '文字数', value: state.tokenText.length }) +
      C.Metric({ label: '語彙(模擬)', value: '50,000' }) + '</div>' +
      '<div class="ns-tokens">' + toks.map(function (t, i) {
        return '<span class="ns-token ns-chunk--' + (i % 4) + '">' + C.esc(t.text) + '<i>' + t.id + '</i></span>';
      }).join('') + '</div>';
  }

  /* ---------- Embedding Viewer ---------- */
  NSCode.registerView({
    route: '#/embedding/vector', module: 'embedding', title: 'Embedding Viewer',
    render: function () {
      return header({ title: 'Embedding Viewer', purpose: 'ベクトル / 次元数 / モデル', route: '#/embedding/vector' }) +
        C.Panel({ title: '入力文', body: '<input id="emText" class="ns-input" value="' + C.esc(state.embText) + '">' }) +
        C.Panel({ title: 'ベクトル', hint: 'local hashing embedding（signed, L2正規化）', body: '<div id="emOut"></div>' });
    },
    onMount: function () {
      el('emText').addEventListener('input', function () { state.embText = el('emText').value; persist(); renderEmbedding(); });
      renderEmbedding();
    }
  });
  function barViz(vec) {
    var max = 0; vec.forEach(function (x) { max = Math.max(max, Math.abs(x)); }); max = max || 1;
    var w = 100 / vec.length;
    var bars = vec.map(function (x, i) {
      var h = Math.abs(x) / max * 48;
      var y = x >= 0 ? 50 - h : 50;
      var col = x >= 0 ? 'var(--accent)' : '#f6bd60';
      return '<rect x="' + (i * w) + '%" y="' + y + '%" width="' + (w * 0.8) + '%" height="' + h + '%" fill="' + col + '"></rect>';
    }).join('');
    return '<svg class="ns-vec" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="0" y1="50%" x2="100%" y2="50%" stroke="var(--border)"></line>' + bars + '</svg>';
  }
  function renderEmbedding() {
    var out = el('emOut'); if (!out) return;
    var v = E.embed(state.embText, DIM);
    var preview = v.slice(0, 8).map(function (x) { return x.toFixed(3); }).join(', ');
    out.innerHTML = '<div class="ns-grid" style="--cols:3">' +
      C.Metric({ label: '次元数', value: DIM }) +
      C.Metric({ label: 'モデル', value: 'hashing' }) +
      C.Metric({ label: 'L2ノルム', value: '1.000' }) + '</div>' +
      barViz(v) +
      C.CodeBlock({ lang: 'text', code: '[' + preview + ', … ] (' + DIM + 'd)' });
  }

  /* ---------- Similarity Viewer ---------- */
  NSCode.registerView({
    route: '#/embedding/similarity', module: 'embedding', title: 'Similarity Viewer',
    render: function () {
      return header({ title: 'Similarity Viewer', purpose: 'Cos Similarity / Euclidean / Dot Product', route: '#/embedding/similarity' }) +
        '<div class="ns-grid" style="--cols:2">' +
          C.Panel({ title: 'テキスト A', body: '<textarea id="simA" class="ns-input" rows="3">' + C.esc(state.simA) + '</textarea>' }) +
          C.Panel({ title: 'テキスト B', body: '<textarea id="simB" class="ns-input" rows="3">' + C.esc(state.simB) + '</textarea>' }) +
        '</div>' +
        C.Panel({ title: '類似度', body: '<div id="simOut"></div>' });
    },
    onMount: function () {
      ['simA', 'simB'].forEach(function (id) { el(id).addEventListener('input', function () { state[id] = el(id).value; persist(); renderSim(); }); });
      renderSim();
    }
  });
  function renderSim() {
    var out = el('simOut'); if (!out) return;
    var a = E.embed(state.simA, DIM), b = E.embed(state.simB, DIM);
    var cos = E.cosine(a, b), euc = E.euclidean(a, b), d = E.dot(a, b);
    var verdict = cos > 0.7 ? '非常に近い' : cos > 0.4 ? 'やや近い' : cos > 0.15 ? '弱い関連' : 'ほぼ無関係';
    out.innerHTML = '<div class="ns-grid" style="--cols:3">' +
      C.Metric({ label: 'Cosine', value: cos.toFixed(3) }) +
      C.Metric({ label: 'Euclidean', value: euc.toFixed(3) }) +
      C.Metric({ label: 'Dot', value: d.toFixed(3) }) + '</div>' +
      '<div class="ns-metric"><div class="ns-metric__row"><span>Cosine 類似度</span><span>' + verdict + '</span></div>' +
      '<div class="ns-progress"><div class="ns-progress__fill" style="width:' + Math.round(Math.max(0, cos) * 100) + '%"></div></div></div>';
  }

  /* ---------- Cluster Viewer ---------- */
  NSCode.registerView({
    route: '#/embedding/cluster', module: 'embedding', title: 'Cluster Viewer',
    render: function () {
      return header({ title: 'Cluster Viewer', purpose: '埋め込みを PCA で 2D 可視化', route: '#/embedding/cluster' }) +
        C.Panel({ title: 'テキスト（1行=1点）', body: '<textarea id="clText" class="ns-input" rows="6">' + C.esc(state.clusterText) + '</textarea>' +
          C.Controls([{ label: '次元削減', control: '<select id="clMethod" class="ns-input"><option value="pca">PCA (2D)</option><option value="umap" disabled>UMAP (要ライブラリ)</option></select>' }]) }) +
        C.Panel({ title: '2D 散布図', hint: '近い点＝似た文', body: '<div id="clOut"></div>' });
    },
    onMount: function () {
      el('clText').addEventListener('input', function () { state.clusterText = el('clText').value; persist(); renderCluster(); });
      renderCluster();
    }
  });
  function renderCluster() {
    var out = el('clOut'); if (!out) return;
    var texts = state.clusterText.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    if (texts.length < 2) { out.innerHTML = C.EmptyState({ message: '2行以上のテキストを入力してください。' }); return; }
    var vecs = texts.map(function (t) { return E.embed(t, DIM); });
    var pts = E.pca2(vecs);
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var pad = 8, W = 100 - pad * 2;
    function sx(x) { return pad + (maxX - minX ? (x - minX) / (maxX - minX) : 0.5) * W; }
    function sy(y) { return pad + (maxY - minY ? (maxY - y) / (maxY - minY) : 0.5) * W; }
    var palette = ['#6ea8fe', '#5ee0c0', '#f6bd60', '#c792ea', '#ff6b6b', '#4ade80'];
    var dots = pts.map(function (p, i) {
      var col = palette[E.hash(texts[i].split(/\s+/)[0]) % palette.length];
      var label = C.esc(texts[i].slice(0, 16));
      return '<g><circle cx="' + sx(p[0]) + '" cy="' + sy(p[1]) + '" r="2.2" fill="' + col + '"></circle>' +
        '<text x="' + (sx(p[0]) + 2.6) + '" y="' + (sy(p[1]) + 1.2) + '" font-size="3" fill="var(--text-dim)">' + label + '</text></g>';
    }).join('');
    out.innerHTML = '<svg class="ns-scatter" viewBox="0 0 100 100">' + dots + '</svg>' +
      '<p class="ns-empty__hint">PCA は語彙ベース埋め込みの上位2主成分です。3D/UMAP は可視化ライブラリ前提のため雛形では PCA(2D) のみ実装。</p>';
  }
})(window.NSCode);

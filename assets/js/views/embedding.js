/* Embedding Lab (EMB) — working, offline embedding exploration.
 * ONE page (no tabs): Token Visualizer / Embedding Viewer / Similarity Viewer / Cluster Viewer.
 * Vectors are local hashing-trick embeddings (lexical, deterministic); the UI
 * states this so the difference from neural embeddings is clear. */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, E = NSCode.embeddings;
  var DIM = 64;

  var state = Object.assign({
    tokenText: '歯車は動力を伝達する機械要素です。',
    embText: '歯車 かみ合い 動力 伝達',
    simA: '歯車 かみ合い 動力 伝達',
    simB: '動力 伝達 歯車 かみ合い',
    clusterText: ['歯車 かみ合い 動力 伝達', 'インボリュート 歯形 圧力角 歯車', '平歯車 はすば歯車 減速',
      '転がり軸受 内輪 外輪 転動体', 'すべり軸受 油膜 潤滑 荷重', '軸受 摩擦 回転 支持',
      'はり 曲げ 応力 たわみ', '断面係数 中立軸 曲げ応力', '片持ちはり せん断 荷重 変形'].join('\n')
  }, NSCode.api.labState('#/embedding') || {});

  function persist() { NSCode.api.labState('#/embedding', state); }
  function el(id) { return document.getElementById(id); }

  /* dynamic: all viewers reflect the latest Ask run.
   * Token/Embedding ← the question; Similarity ← question vs answer;
   * Cluster ← the retrieved chunks (so the scatter shows THIS run's passages). */
  function syncFromAsk() {
    var r = NSCode.lastRun && NSCode.lastRun.get();
    if (!r || !r.query) return;
    state.tokenText = r.query;
    state.embText = r.query;
    state.simA = r.query;
    state.simB = r.generated || (r.answer && r.answer[0]) || ((r.hits && r.hits[0] && r.hits[0].text) || '').slice(0, 50) || r.query;
    var lines = (r.hits || []).map(function (h) { return (h.text || '').replace(/\s+/g, ' ').trim().slice(0, 48); }).filter(Boolean);
    if (lines.length >= 2) state.clusterText = lines.join('\n');
    persist();
  }

  /* ---------- One page render ---------- */
  function render() {
    return C.PageHeader({
      title: 'Embedding Lab',
      purpose: 'Token分解 → ベクトル化 → 類似度 → クラスタ可視化（signed hashing trick・語彙ベース）',
      breadcrumb: ['Embedding Lab']
    }) +

      /* a) Token Visualizer */
      C.Panel({
        title: 'Token Visualizer',
        hint: 'BPE ではない簡易分割（語/数字/CJK字/記号）',
        body: '<textarea id="tkText" class="ns-input" rows="3">' + C.esc(state.tokenText) + '</textarea>' +
          '<div id="tkOut"></div>'
      }) +

      /* b) Embedding Viewer */
      C.Panel({
        title: 'Embedding Viewer',
        hint: 'local hashing embedding（signed, L2正規化）',
        body: '<input id="emText" class="ns-input" value="' + C.esc(state.embText) + '">' +
          '<div id="emOut"></div>'
      }) +

      /* c) Similarity Viewer */
      C.Panel({
        title: 'Similarity Viewer',
        hint: 'Cosine / Euclidean / Dot Product',
        body: '<div class="ns-grid" style="--cols:2">' +
            '<label class="ns-control"><span>テキスト A</span><textarea id="simA" class="ns-input" rows="3">' + C.esc(state.simA) + '</textarea></label>' +
            '<label class="ns-control"><span>テキスト B</span><textarea id="simB" class="ns-input" rows="3">' + C.esc(state.simB) + '</textarea></label>' +
          '</div>' +
          '<div id="simOut"></div>'
      }) +

      /* d) Cluster Viewer */
      C.Panel({
        title: 'Cluster Viewer',
        hint: '近い点＝似た文（PCA 2D）',
        body: '<textarea id="clText" class="ns-input" rows="6">' + C.esc(state.clusterText) + '</textarea>' +
          C.Controls([{ label: '次元削減', control: '<select id="clMethod" class="ns-input"><option value="pca">PCA (2D)</option><option value="umap" disabled>UMAP (要ライブラリ)</option></select>' }]) +
          '<div id="clOut"></div>'
      });
  }

  function onMount() {
    syncFromAsk();
    if (el('tkText')) el('tkText').value = state.tokenText;
    if (el('emText')) el('emText').value = state.embText;
    if (el('simA')) el('simA').value = state.simA;
    if (el('simB')) el('simB').value = state.simB;
    if (el('clText')) el('clText').value = state.clusterText;
    el('tkText').addEventListener('input', function () { state.tokenText = el('tkText').value; persist(); renderTokens(); });
    el('emText').addEventListener('input', function () { state.embText = el('emText').value; persist(); renderEmbedding(); });
    ['simA', 'simB'].forEach(function (id) { el(id).addEventListener('input', function () { state[id] = el(id).value; persist(); renderSim(); }); });
    el('clText').addEventListener('input', function () { state.clusterText = el('clText').value; persist(); renderCluster(); });
    renderTokens();
    renderEmbedding();
    renderSim();
    renderCluster();
  }

  /* ---------- Token Visualizer ---------- */
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

  /* ---------- Register: base route + former sub-routes as aliases ---------- */
  ['#/embedding', '#/embedding/token', '#/embedding/vector', '#/embedding/similarity', '#/embedding/cluster']
    .forEach(function (route) {
      NSCode.registerView({ route: route, module: 'embedding', title: 'Embedding Lab', render: render, onMount: onMount });
    });
})(window.NSCode);

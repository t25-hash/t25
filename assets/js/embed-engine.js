/* NSCode Embedding engine — runs fully offline (no model server).
 * Embeddings use the signed hashing trick over token uni/bi-grams (a real
 * technique): deterministic, and similar texts get similar vectors — but it is
 * LEXICAL, not a learned neural embedding. Dimensionality reduction is real PCA
 * (power iteration). The UI labels these trade-offs. */
(function (NSCode) {
  'use strict';

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* Simplified tokenizer (NOT BPE): latin words / digits / single CJK char / punct. */
  function tokenize(text) {
    var re = /[A-Za-z]+|[0-9]+|[぀-ヿ一-鿿ｦ-ﾟ]|[^\sA-Za-z0-9぀-ヿ一-鿿ｦ-ﾟ]/g;
    var tokens = [], m;
    while ((m = re.exec(text)) !== null) {
      var t = m[0];
      tokens.push({ text: t, id: hash(t.toLowerCase()) % 50000 }); // simulated vocab id
    }
    return tokens;
  }

  /* Signed hashing-trick embedding, L2-normalized. */
  function embed(text, dim) {
    dim = dim || 64;
    var v = new Array(dim);
    for (var i = 0; i < dim; i++) v[i] = 0;
    var toks = tokenize(text).map(function (t) { return t.text.toLowerCase(); });
    var feats = toks.slice();
    for (var j = 0; j < toks.length - 1; j++) feats.push(toks[j] + '_' + toks[j + 1]);
    feats.forEach(function (f) {
      var h = hash(f);
      var idx = h % dim;
      var sign = ((h >>> 16) & 1) ? 1 : -1;
      v[idx] += sign;
    });
    var n = 0; for (var k = 0; k < dim; k++) n += v[k] * v[k];
    n = Math.sqrt(n) || 1;
    for (var l = 0; l < dim; l++) v[l] /= n;
    return v;
  }

  function dot(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  function cosine(a, b) {
    var na = Math.sqrt(dot(a, a)), nb = Math.sqrt(dot(b, b));
    return (na && nb) ? dot(a, b) / (na * nb) : 0;
  }
  function euclidean(a, b) { var s = 0; for (var i = 0; i < a.length; i++) { var d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }

  /* PCA -> 2D via power iteration on the covariance (implicit X^T X). */
  function pca2(vectors) {
    var n = vectors.length, d = vectors[0].length;
    var mean = new Array(d); for (var i = 0; i < d; i++) mean[i] = 0;
    vectors.forEach(function (v) { for (var k = 0; k < d; k++) mean[k] += v[k]; });
    for (var m = 0; m < d; m++) mean[m] /= n;
    var X = vectors.map(function (v) { return v.map(function (x, k) { return x - mean[k]; }); });

    function covMul(vec) { // (X^T X) vec
      var Xv = X.map(function (row) { return dot(row, vec); });
      var res = new Array(d); for (var a = 0; a < d; a++) res[a] = 0;
      for (var r = 0; r < n; r++) for (var c = 0; c < d; c++) res[c] += X[r][c] * Xv[r];
      return res;
    }
    function unit() { var v = new Array(d), s = 0, x; for (var a = 0; a < d; a++) { x = Math.sin(a * 12.9898 + 1) * 43758.5453; x -= Math.floor(x); v[a] = x - 0.5; s += v[a] * v[a]; } s = Math.sqrt(s) || 1; return v.map(function (e) { return e / s; }); }
    function power(prev) {
      var v = unit();
      for (var it = 0; it < 60; it++) {
        var w = covMul(v);
        prev.forEach(function (u) { var p = dot(w, u); for (var a = 0; a < d; a++) w[a] -= p * u[a]; });
        var nrm = Math.sqrt(dot(w, w)) || 1;
        v = w.map(function (e) { return e / nrm; });
      }
      return v;
    }
    var pc1 = power([]), pc2 = power([pc1]);
    return X.map(function (row) { return [dot(row, pc1), dot(row, pc2)]; });
  }

  NSCode.embeddings = {
    tokenize: tokenize, embed: embed, cosine: cosine, euclidean: euclidean, dot: dot, pca2: pca2, hash: hash
  };
})(window.NSCode);

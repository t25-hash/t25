/* NSCode neural LM — a REAL (tiny) NEURAL network language model that trains
 * fully in the browser, no API, no library. Unlike the n-gram baby LM
 * (llm-engine.js, pure counting), this one LEARNS weights by gradient descent:
 *
 *   context (previous C tokens) --embedding lookup--> x
 *      x --W1,b1--> tanh hidden h --W2,b2--> logits --softmax--> p(next token)
 *
 * Trained with cross-entropy loss and plain SGD (backprop through the net,
 * including the embeddings). It is a Bengio-style feed-forward neural LM —
 * small enough to train in ~1s, real enough to show a falling loss curve and
 * generate by next-token prediction. Tokens come from NSCode.babyLLM.tokenize. */
(function (NSCode) {
  'use strict';

  var ENDERS = /[。．！？!?]/;

  function tok(text) { return NSCode.babyLLM.tokenize(text); }

  /* build a capped vocabulary (most frequent tokens) + <unk> */
  function buildVocab(tokens, cap) {
    var freq = {};
    for (var i = 0; i < tokens.length; i++) freq[tokens[i]] = (freq[tokens[i]] || 0) + 1;
    var items = Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; });
    if (cap && items.length > cap - 1) items = items.slice(0, cap - 1);
    var stoi = { '<unk>': 0 }, itos = ['<unk>'];
    items.forEach(function (t) { stoi[t] = itos.length; itos.push(t); });
    return { stoi: stoi, itos: itos, size: itos.length };
  }

  function idOf(model, t) { var v = model.vocab.stoi[t]; return v == null ? 0 : v; }

  function rnd(n, scale) {
    var a = new Float32Array(n);
    for (var i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * scale;
    return a;
  }

  /* create model + initial weights. C = context length (tokens), D = embedding
   * dim, H = hidden units, V = vocab size. */
  function create(text, opts) {
    opts = opts || {};
    var tokens = tok(text);
    var vocab = buildVocab(tokens, opts.maxVocab || 480);
    var C = opts.context || 2, D = opts.dim || 16, H = opts.hidden || 40, V = vocab.size;
    var ids = new Int32Array(tokens.length);
    for (var i = 0; i < tokens.length; i++) ids[i] = idOf({ vocab: vocab }, tokens[i]);
    return {
      vocab: vocab, ids: ids, C: C, D: D, H: H, V: V,
      Emb: rnd(V * D, 0.5),
      W1: rnd(C * D * H, Math.sqrt(1 / (C * D))), b1: new Float32Array(H),
      W2: rnd(H * V, Math.sqrt(1 / H)),          b2: new Float32Array(V),
      steps: 0, loss: 0
    };
  }

  /* forward pass for a context (array of C token ids). Returns intermediates. */
  function forward(m, ctx) {
    var C = m.C, D = m.D, H = m.H, V = m.V;
    var x = new Float32Array(C * D);
    for (var c = 0; c < C; c++) {
      var base = ctx[c] * D;
      for (var d = 0; d < D; d++) x[c * D + d] = m.Emb[base + d];
    }
    var h = new Float32Array(H), hpre;
    for (var j = 0; j < H; j++) {
      hpre = m.b1[j];
      for (var k = 0; k < C * D; k++) hpre += x[k] * m.W1[k * H + j];
      h[j] = Math.tanh(hpre);
    }
    var logits = new Float32Array(V), max = -1e30;
    for (var v = 0; v < V; v++) {
      var s = m.b2[v];
      for (var jj = 0; jj < H; jj++) s += h[jj] * m.W2[jj * V + v];
      logits[v] = s; if (s > max) max = s;
    }
    var sum = 0;
    for (var v2 = 0; v2 < V; v2++) { logits[v2] = Math.exp(logits[v2] - max); sum += logits[v2]; }
    for (var v3 = 0; v3 < V; v3++) logits[v3] /= sum; // now probabilities
    return { x: x, h: h, p: logits };
  }

  /* one SGD step on (ctx -> target). Returns the cross-entropy loss. */
  function step(m, ctx, target, lr) {
    var C = m.C, D = m.D, H = m.H, V = m.V;
    var f = forward(m, ctx), p = f.p, h = f.h, x = f.x;
    var loss = -Math.log(Math.max(p[target], 1e-9));

    // dlogits = p - onehot(target)
    var dlog = p; dlog[target] -= 1;
    // grads into W2/b2 and back into h
    var dh = new Float32Array(H);
    for (var j = 0; j < H; j++) {
      var hj = h[j], row = j * V, g = 0;
      for (var v = 0; v < V; v++) {
        var dl = dlog[v];
        g += dl * m.W2[row + v];
        m.W2[row + v] -= lr * dl * hj;
      }
      dh[j] = g;
    }
    for (var v2 = 0; v2 < V; v2++) m.b2[v2] -= lr * dlog[v2];
    // through tanh
    var dhpre = new Float32Array(H);
    for (var j2 = 0; j2 < H; j2++) dhpre[j2] = dh[j2] * (1 - h[j2] * h[j2]);
    // grads into W1/b1 and back into x
    var dx = new Float32Array(C * D);
    for (var kk = 0; kk < C * D; kk++) {
      var krow2 = kk * H, dxk = 0, xkk = x[kk];
      for (var jj = 0; jj < H; jj++) {
        var dp = dhpre[jj];
        dxk += dp * m.W1[krow2 + jj];
        m.W1[krow2 + jj] -= lr * dp * xkk;
      }
      dx[kk] = dxk;
    }
    for (var j3 = 0; j3 < H; j3++) m.b1[j3] -= lr * dhpre[j3];
    // grads into the two context embeddings
    for (var c = 0; c < C; c++) {
      var base = ctx[c] * D;
      for (var d = 0; d < D; d++) m.Emb[base + d] -= lr * dx[c * D + d];
    }
    return loss;
  }

  /* train asynchronously in chunks so the UI stays responsive. Calls
   * onProgress({ step, total, loss }) after each chunk; resolves with model. */
  function trainAsync(m, opts) {
    opts = opts || {};
    var total = opts.steps || 6000, chunk = opts.chunk || 400;
    var lr0 = opts.lr || 0.1, N = m.ids.length, C = m.C;
    var onProgress = opts.onProgress, done = 0, emaLoss = 0;
    return new Promise(function (resolve) {
      function runChunk() {
        var end = Math.min(done + chunk, total);
        for (; done < end; done++) {
          var lr = lr0 * (1 - 0.7 * done / total);        // light decay
          var t = C + ((Math.random() * (N - C)) | 0);     // random target position
          if (t >= N) t = N - 1;
          var ctx = [];
          for (var c = C; c >= 1; c--) ctx.push(m.ids[t - c]);
          var l = step(m, ctx, m.ids[t], lr);
          emaLoss = emaLoss ? emaLoss * 0.99 + l * 0.01 : l;
        }
        m.steps = done; m.loss = emaLoss;
        if (onProgress) onProgress({ step: done, total: total, loss: emaLoss });
        if (done < total) setTimeout(runChunk, 0);
        else resolve(m);
      }
      runChunk();
    });
  }

  /* sample next id from probabilities with temperature + top-k */
  function sampleNext(p, temperature, topK) {
    var T = Math.max(0.05, temperature || 1), V = p.length;
    var e = new Array(V);
    for (var i = 0; i < V; i++) e[i] = [i, Math.pow(p[i], 1 / T)];
    e.sort(function (a, b) { return b[1] - a[1]; });
    if (topK) e = e.slice(0, topK);
    var sum = 0, i2; for (i2 = 0; i2 < e.length; i2++) sum += e[i2][1];
    var r = Math.random() * sum, acc = 0;
    for (i2 = 0; i2 < e.length; i2++) { acc += e[i2][1]; if (r <= acc) return e[i2][0]; }
    return e[0][0];
  }

  /* autoregressive generation from seed tokens (strings) */
  function generate(m, seedToks, opts) {
    opts = opts || {};
    var maxTok = opts.maxTokens || 50, T = opts.temperature == null ? 0.8 : opts.temperature, K = opts.topK || 8;
    var C = m.C;
    var ids = [];
    seedToks.forEach(function (t) { ids.push(idOf(m, t)); });
    while (ids.length < C) ids.unshift(0);
    var outToks = seedToks.slice(), produced = 0, counts = {};
    for (var i = 0; i < maxTok; i++) {
      var ctx = ids.slice(ids.length - C);
      var f = forward(m, ctx), p = f.p;
      // light repetition penalty (reuse the same idea as the n-gram LM)
      for (var v = 0; v < p.length; v++) if (counts[v]) p[v] /= Math.pow(1.4, counts[v]);
      var nid = sampleNext(p, T, K);
      counts[nid] = (counts[nid] || 0) + 1;
      ids.push(nid);
      var t2 = m.vocab.itos[nid];
      if (nid !== 0) { outToks.push(t2); produced++; }
      if (ENDERS.test(t2) && produced >= 8) break;
    }
    return outToks;
  }

  NSCode.neuralLM = {
    tokenize: tok, buildVocab: buildVocab, create: create,
    forward: forward, step: step, trainAsync: trainAsync, generate: generate
  };
})(window.NSCode);

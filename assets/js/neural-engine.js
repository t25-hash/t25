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

  /* next-token probabilities for a context string (for "show the internals"):
   * returns the top-k tokens the net predicts, with their softmax probability. */
  function nextProbs(m, contextText, k) {
    var toks = tok(contextText), ids = [];
    toks.forEach(function (t) { ids.push(idOf(m, t)); });
    while (ids.length < m.C) ids.unshift(0);
    var ctx = ids.slice(ids.length - m.C);
    var p = forward(m, ctx).p, arr = [];
    for (var i = 0; i < p.length; i++) arr.push([i, p[i]]);
    arr.sort(function (a, b) { return b[1] - a[1]; });
    return arr.slice(0, k || 8).map(function (x) { return { tok: m.vocab.itos[x[0]], prob: x[1] }; });
  }

  /* autoregressive generation from seed tokens (strings) */
  function generate(m, seedToks, opts) {
    opts = opts || {};
    var maxTok = opts.maxTokens || 50, T = opts.temperature == null ? 0.8 : opts.temperature, K = opts.topK || 8;
    var rep = opts.repetitionPenalty || 1.4, C = m.C;
    // map "avoid" token strings (e.g. the separator 「・」) to vocab ids once
    var avoidIds = null;
    if (opts.avoid) { avoidIds = {}; for (var key in opts.avoid) { var aid = m.vocab.stoi[key]; if (aid != null) avoidIds[aid] = opts.avoid[key]; } }
    var ids = [];
    seedToks.forEach(function (t) { ids.push(idOf(m, t)); });
    while (ids.length < C) ids.unshift(0);
    var outToks = seedToks.slice(), produced = 0, counts = {};
    // no-repeat bigram: never emit the same (prev → next) pair twice. This is
    // what stops the phrase loops a tiny LM falls into (e.g. reciting a heading
    // over and over). Opt-in so the Neural Lab's raw demo is unaffected.
    var blockBigram = opts.noRepeatBigram, seenBg = {};
    for (var i = 0; i < maxTok; i++) {
      var ctx = ids.slice(ids.length - C);
      var prevId = ids[ids.length - 1];
      var f = forward(m, ctx), p = f.p;
      for (var v = 0; v < p.length; v++) {
        if (counts[v]) p[v] /= Math.pow(rep, counts[v]);          // repetition penalty
        if (avoidIds && avoidIds[v] != null) p[v] *= avoidIds[v]; // down-weight separators etc.
        if (blockBigram && seenBg[prevId + ',' + v]) p[v] *= 0.001; // block repeated bigram
      }
      var nid = sampleNext(p, T, K);
      seenBg[prevId + ',' + nid] = 1;
      counts[nid] = (counts[nid] || 0) + 1;
      ids.push(nid);
      var t2 = m.vocab.itos[nid];
      if (nid !== 0) { outToks.push(t2); produced++; }
      if (ENDERS.test(t2) && produced >= 8) break;
    }
    return outToks;
  }

  /* mean log-probability of a token sequence under the model — how "confident"
   * (well-recalled) the net is about it. Used to pick the cleanest generation. */
  function seqLogProb(m, toks) {
    var ids = toks.map(function (t) { return m.vocab.stoi[t] == null ? 0 : m.vocab.stoi[t]; });
    var lp = 0, n = 0;
    for (var i = m.C; i < ids.length; i++) {
      var p = forward(m, ids.slice(i - m.C, i)).p;
      lp += Math.log(Math.max(p[ids[i]], 1e-9)); n++;
    }
    return n ? lp / n : -1e9;
  }

  /* seed the answer from the most specific term in the question that the net
   * actually learned (longest in-vocab kanji/katakana/latin run). */
  function keySeed(m, question) {
    var runs = (question.match(/[一-鿿ァ-ヶー]{2,}|[A-Za-z][A-Za-z0-9]+/g) || []);
    runs.sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < runs.length; i++) {
      var t = tok(runs[i]);
      if (t.filter(function (x) { return m.vocab.stoi[x] != null; }).length) return t.slice(0, m.C);
    }
    var qt = tok(question).filter(function (t) { return m.vocab.stoi[t] != null && !/[、。，．！？!?…・\n\s]/.test(t); });
    return qt.length ? qt.slice(0, m.C) : null;
  }

  /* ANSWER a question from the net's weights (no document search): seed from a
   * question keyword, sample several continuations, keep the one the net is most
   * confident in. This is neural recall — the text comes from learned weights. */
  function answer(m, question, opts) {
    opts = opts || {};
    var seed = keySeed(m, question);
    if (!seed) return { text: '', seed: '' };
    // down-weight separator/list tokens so the answer doesn't come out looking
    // character-separated (the corpus is full of e.g. 「軸振動・軸受温度・…」),
    // and use a stronger repetition penalty to avoid phrase loops.
    var avoid = { '・': 0.02, '、': 0.45, '，': 0.05, '…': 0.05, '·': 0.02 };
    var K = opts.candidates || 12, best = null, bestScore = -1e9;
    for (var i = 0; i < K; i++) {
      var temp = (opts.temperature || 0.45) * (0.8 + 0.4 * (i % 5) / 4);   // vary around the set temp
      var g = generate(m, seed, { temperature: temp, topK: opts.topK || 6, maxTokens: opts.maxTokens || 52,
        repetitionPenalty: 1.9, avoid: avoid, noRepeatBigram: true });
      var sc = seqLogProb(m, g);
      if (sc > bestScore) { bestScore = sc; best = g; }
    }
    var join = NSCode.babyLLM.join;
    return { text: trimToSentence(join(best)), seed: join(seed), score: bestScore };
  }

  /* cut a generated string at its last sentence ender so the answer doesn't end
   * on a dangling, half-formed clause. Falls back to the whole string. */
  function trimToSentence(s) {
    var m2 = String(s || '').match(/^[\s\S]*[。．！？!?]/);
    if (m2 && m2[0].replace(/[\s、,・]/g, '').length >= 8) return m2[0].trim();
    return String(s || '').trim();
  }

  NSCode.neuralLM = {
    tokenize: tok, buildVocab: buildVocab, create: create,
    forward: forward, step: step, trainAsync: trainAsync, generate: generate, nextProbs: nextProbs,
    seqLogProb: seqLogProb, keySeed: keySeed, answer: answer
  };

  /* ---- shared singleton: Ask's "base neural" model ----
   * Both the Ask page and the Neural Lab use THIS one instance, trained on the
   * shared knowledge base (NSCode.askEngine docs). Subscribers are notified on
   * every training-progress tick and on completion so the UI can show the real
   * model as it learns. */
  NSCode.neuralLab = (function () {
    var DEFAULT_OPTS = { context: 3, dim: 24, hidden: 64, maxVocab: 480, steps: 14000, lr: 0.15 };
    var state = { model: null, sig: '', training: false, prog: null, params: 0, opts: assign({}, DEFAULT_OPTS) };
    var listeners = [];

    function assign(t, s) { for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k]; return t; }
    function sigOf(docs) { return docs.map(function (d) { return d.name + ':' + (d.text || '').length; }).join('|') + '|' + JSON.stringify(state.opts); }
    function notify() { for (var i = 0; i < listeners.length; i++) { try { listeners[i](state); } catch (e) {} } }

    /* scale capacity with corpus size so larger (e.g. PDF-extracted) text is
     * actually learned — bounded so training stays a few seconds in-browser.
     * Never goes below the user/base opts (Neural Lab sliders can push higher). */
    function scaledOpts(corpus) {
      var T = corpus.length;                                  // ≈ tokens for CJK text
      var o = assign({}, state.opts);
      o.maxVocab = Math.max(o.maxVocab, Math.min(900, 480 + Math.round(T / 80)));
      o.hidden   = Math.max(o.hidden,   Math.min(80, T > 30000 ? 80 : 64));
      o.steps    = Math.max(o.steps,    Math.min(24000, 14000 + Math.round(T / 6)));
      return o;
    }

    function ensure(force) {
      var docs = NSCode.askEngine.getDocs(), sig = sigOf(docs);
      if (!force && ((state.model && state.sig === sig) || (state.training && state.sig === sig))) { notify(); return; }
      var corpus = docs.map(function (d) { return d.text; }).join('\n');
      var opts = scaledOpts(corpus);
      state.sig = sig; state.training = true; state.model = null; state.prog = { step: 0, total: opts.steps, loss: 0 };
      var m = create(corpus, opts);
      state.params = (m.V * m.D) + (m.C * m.D * m.H) + (m.H * m.V);
      notify();
      trainAsync(m, { steps: opts.steps, chunk: 500, lr: opts.lr, onProgress: function (s) {
        if (state.sig !== sig) return; state.prog = s; notify();
      } }).then(function () {
        if (state.sig !== sig) return; state.model = m; state.training = false; notify();
      });
    }

    return {
      DEFAULT_OPTS: DEFAULT_OPTS,
      state: state,
      onChange: function (fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
      ensure: ensure,
      retrain: function (opts) { if (opts) assign(state.opts, opts); ensure(true); },
      generate: function (seed, gopts) { return state.model ? generate(state.model, seed, gopts) : null; },
      nextProbs: function (ctxText, k) { return state.model ? nextProbs(state.model, ctxText, k) : null; },
      answer: function (question, gopts) { return state.model ? answer(state.model, question, gopts) : null; }
    };
  })();
})(window.NSCode);

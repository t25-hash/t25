/* NSCode GRU LM — a REAL recurrent (GRU) neural language model that trains fully
 * in the browser by backprop-through-time (BPTT). No API, no library.
 *
 * The feed-forward net (neural-engine.js) only sees a FIXED window of C previous
 * tokens, so it forgets anything older and its free generation drifts. A GRU keeps
 * a RECURRENT hidden state that carries information across the whole sequence:
 *
 *   z = σ(Wz·x + Uz·h + bz)          (update gate — how much to refresh)
 *   r = σ(Wr·x + Ur·h + br)          (reset gate — how much past to forget)
 *   ĥ = tanh(Wh·x + Uh·(r⊙h) + bh)   (candidate state)
 *   h = (1−z)⊙h + z⊙ĥ                (new hidden state)
 *   logits = Wo·h + bo → softmax → p(next token)
 *
 * Trained with cross-entropy + plain SGD (gradient-clipped BPTT). This lifts the
 * quality of FREE (unconstrained) generation — goal #2 — while reusing the same
 * subword tokenizer/vocabulary as neural-engine so the two are interchangeable. */
(function (NSCode) {
  'use strict';

  var ENDERS = /[。．！？!?]/;

  function rnd(n, scale) { var a = new Float32Array(n); for (var i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * scale; return a; }
  function zeros(n) { return new Float32Array(n); }
  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

  /* create a GRU model. Reuses neuralLM's subword tokenization (BPE merges +
   * capped vocab) so the GRU and the FF net share one vocabulary. D = embedding
   * dim, H = hidden units, V = vocab size. */
  function create(text, opts) {
    opts = opts || {};
    var base = NSCode.neuralLM.create(text, opts);   // { vocab, ids, merges, D, ... }
    var D = opts.dim || 24, H = opts.hidden || 48, V = base.vocab.size;
    var si = Math.sqrt(1 / D), sh = Math.sqrt(1 / H);
    return {
      vocab: base.vocab, ids: base.ids, merges: base.merges, D: D, H: H, V: V,
      Emb: rnd(V * D, 0.5),
      Wz: rnd(H * D, si), Wr: rnd(H * D, si), Wh: rnd(H * D, si),
      Uz: rnd(H * H, sh), Ur: rnd(H * H, sh), Uh: rnd(H * H, sh),
      bz: zeros(H), br: zeros(H), bh: zeros(H),
      Wo: rnd(V * H, sh), bo: zeros(V),
      steps: 0, loss: 0
    };
  }

  /* one GRU step. x = embedding (D), hprev (H). Returns the cache needed for BPTT. */
  function cell(m, x, hprev) {
    var H = m.H, D = m.D;
    var z = new Float32Array(H), r = new Float32Array(H), hh = new Float32Array(H), h = new Float32Array(H), rh = new Float32Array(H);
    for (var i = 0; i < H; i++) {
      var zi = m.bz[i], ri = m.br[i], iD = i * D, iH = i * H;
      for (var d = 0; d < D; d++) { var xd = x[d]; zi += m.Wz[iD + d] * xd; ri += m.Wr[iD + d] * xd; }
      for (var j = 0; j < H; j++) { var hj = hprev[j]; zi += m.Uz[iH + j] * hj; ri += m.Ur[iH + j] * hj; }
      z[i] = sigmoid(zi); r[i] = sigmoid(ri);
    }
    for (var i2 = 0; i2 < H; i2++) rh[i2] = r[i2] * hprev[i2];   // reset-gated previous state
    for (var i3 = 0; i3 < H; i3++) {
      var hi = m.bh[i3], iD3 = i3 * D, iH3 = i3 * H;
      for (var d3 = 0; d3 < D; d3++) hi += m.Wh[iD3 + d3] * x[d3];
      for (var j3 = 0; j3 < H; j3++) hi += m.Uh[iH3 + j3] * rh[j3];
      hh[i3] = Math.tanh(hi);
      h[i3] = (1 - z[i3]) * hprev[i3] + z[i3] * hh[i3];
    }
    return { z: z, r: r, hh: hh, h: h, rh: rh, x: x, hprev: hprev };
  }

  /* softmax over output logits for a hidden state h → probabilities (Float32Array V) */
  function outProbs(m, h) {
    var V = m.V, H = m.H, p = new Float32Array(V), max = -1e30;
    for (var v = 0; v < V; v++) { var s = m.bo[v], vH = v * H; for (var i = 0; i < H; i++) s += m.Wo[vH + i] * h[i]; p[v] = s; if (s > max) max = s; }
    var sum = 0; for (var v2 = 0; v2 < V; v2++) { p[v2] = Math.exp(p[v2] - max); sum += p[v2]; }
    for (var v3 = 0; v3 < V; v3++) p[v3] /= sum;
    return p;
  }

  function emb(m, id) { var D = m.D, x = new Float32Array(D), b = id * D; for (var d = 0; d < D; d++) x[d] = m.Emb[b + d]; return x; }

  /* forward + BPTT over one token window seq (array of ids, length L+1: predict
   * seq[t+1] from seq[0..t]). Accumulates grads into g, returns summed loss. */
  function bptt(m, seq, g, h0) {
    var H = m.H, D = m.D, V = m.V, L = seq.length - 1;
    var caches = [], h = h0 || new Float32Array(H), ps = [], loss = 0;
    for (var t = 0; t < L; t++) {
      var c = cell(m, emb(m, seq[t]), h); caches.push(c); h = c.h;
      var p = outProbs(m, h); ps.push(p);
      loss += -Math.log(Math.max(p[seq[t + 1]], 1e-9));
    }
    var dhNext = new Float32Array(H);
    for (var t2 = L - 1; t2 >= 0; t2--) {
      var c2 = caches[t2], p2 = ps[t2], target = seq[t2 + 1];
      // output grads: dlogits = p - onehot(target)
      var dlog = p2; dlog[target] -= 1;
      var dh = new Float32Array(H);
      for (var v = 0; v < V; v++) {
        var dl = dlog[v]; if (dl === 0) continue; var vH = v * H;
        g.bo[v] += dl;
        for (var i = 0; i < H; i++) { g.Wo[vH + i] += dl * c2.h[i]; dh[i] += dl * m.Wo[vH + i]; }
      }
      for (var i0 = 0; i0 < H; i0++) dh[i0] += dhNext[i0];
      // GRU cell backward
      var z = c2.z, r = c2.r, hh = c2.hh, hprev = c2.hprev, x = c2.x, rh = c2.rh;
      var dx = new Float32Array(D), dhprev = new Float32Array(H);
      var dzPre = new Float32Array(H), drPre = new Float32Array(H), dhhPre = new Float32Array(H), drh = new Float32Array(H);
      for (var i1 = 0; i1 < H; i1++) {
        var dhh = dh[i1] * z[i1];
        var dz = dh[i1] * (hh[i1] - hprev[i1]);
        dhprev[i1] += dh[i1] * (1 - z[i1]);
        dhhPre[i1] = dhh * (1 - hh[i1] * hh[i1]);   // through tanh
        dzPre[i1] = dz * z[i1] * (1 - z[i1]);        // through σ
      }
      // candidate ĥ: grads to Wh, bh, x, and rh (= r⊙hprev)
      for (var i4 = 0; i4 < H; i4++) {
        var gp = dhhPre[i4], iD = i4 * D, iH = i4 * H;
        g.bh[i4] += gp;
        for (var d = 0; d < D; d++) { g.Wh[iD + d] += gp * x[d]; dx[d] += gp * m.Wh[iD + d]; }
        for (var j = 0; j < H; j++) { g.Uh[iH + j] += gp * rh[j]; drh[j] += gp * m.Uh[iH + j]; }
      }
      // rh = r⊙hprev → split to dr and dhprev
      for (var j2 = 0; j2 < H; j2++) { drPre[j2] = (drh[j2] * hprev[j2]) * r[j2] * (1 - r[j2]); dhprev[j2] += drh[j2] * r[j2]; }
      // update gate z: grads to Wz, bz, x, Uz, hprev
      for (var i5 = 0; i5 < H; i5++) {
        var gz = dzPre[i5], iD5 = i5 * D, iH5 = i5 * H;
        g.bz[i5] += gz;
        for (var d5 = 0; d5 < D; d5++) { g.Wz[iD5 + d5] += gz * x[d5]; dx[d5] += gz * m.Wz[iD5 + d5]; }
        for (var j5 = 0; j5 < H; j5++) { g.Uz[iH5 + j5] += gz * hprev[j5]; dhprev[j5] += gz * m.Uz[iH5 + j5]; }
      }
      // reset gate r: grads to Wr, br, x, Ur, hprev
      for (var i6 = 0; i6 < H; i6++) {
        var gr = drPre[i6], iD6 = i6 * D, iH6 = i6 * H;
        g.br[i6] += gr;
        for (var d6 = 0; d6 < D; d6++) { g.Wr[iD6 + d6] += gr * x[d6]; dx[d6] += gr * m.Wr[iD6 + d6]; }
        for (var j6 = 0; j6 < H; j6++) { g.Ur[iH6 + j6] += gr * hprev[j6]; dhprev[j6] += gr * m.Ur[iH6 + j6]; }
      }
      // embedding grad for this step's input token
      var base = seq[t2] * D; for (var d7 = 0; d7 < D; d7++) g.Emb[base + d7] += dx[d7];
      dhNext = dhprev;
    }
    return loss / Math.max(1, L);
  }

  function gradBuf(m) {
    return { Emb: zeros(m.Emb.length), Wz: zeros(m.Wz.length), Wr: zeros(m.Wr.length), Wh: zeros(m.Wh.length),
      Uz: zeros(m.Uz.length), Ur: zeros(m.Ur.length), Uh: zeros(m.Uh.length),
      bz: zeros(m.H), br: zeros(m.H), bh: zeros(m.H), Wo: zeros(m.Wo.length), bo: zeros(m.V) };
  }
  var PARAMS = ['Emb', 'Wz', 'Wr', 'Wh', 'Uz', 'Ur', 'Uh', 'bz', 'br', 'bh', 'Wo', 'bo'];

  /* SGD update with global-norm gradient clipping (BPTT can explode otherwise) */
  function apply(m, g, lr, clip) {
    var norm = 0, k, a, i;
    for (k = 0; k < PARAMS.length; k++) { a = g[PARAMS[k]]; for (i = 0; i < a.length; i++) norm += a[i] * a[i]; }
    norm = Math.sqrt(norm);
    var scale = (clip && norm > clip) ? clip / norm : 1;
    for (k = 0; k < PARAMS.length; k++) { var gg = g[PARAMS[k]], mm = m[PARAMS[k]]; for (i = 0; i < gg.length; i++) mm[i] -= lr * scale * gg[i]; }
  }

  /* train asynchronously in chunks (UI stays responsive). Each step = one random
   * BPTT window of length `seq`. onProgress({step,total,loss}); resolves model. */
  function trainAsync(m, opts) {
    opts = opts || {};
    var total = opts.steps || 4000, chunk = opts.chunk || 80, seqLen = opts.seq || 16;
    var lr0 = opts.lr || 0.1, clip = opts.clip || 5, N = m.ids.length;
    var onProgress = opts.onProgress, done = 0, ema = 0;
    return new Promise(function (resolve) {
      function runChunk() {
        var end = Math.min(done + chunk, total);
        for (; done < end; done++) {
          var L = Math.min(seqLen, N - 1);
          var start = (Math.random() * (N - L - 1)) | 0;
          var seq = []; for (var i = 0; i <= L; i++) seq.push(m.ids[start + i]);
          var g = gradBuf(m);
          var lr = lr0 * (1 - 0.6 * done / total);
          var l = bptt(m, seq, g, null);
          apply(m, g, lr, clip);
          ema = ema ? ema * 0.98 + l * 0.02 : l;
        }
        m.steps = done; m.loss = ema;
        if (onProgress) onProgress({ step: done, total: total, loss: ema });
        if (done < total) setTimeout(runChunk, 0); else resolve(m);
      }
      runChunk();
    });
  }

  function idOf(m, t) { var v = m.vocab.stoi[t]; return v == null ? 0 : v; }
  function encode(m, text) { return NSCode.neuralLM.encode(m, text); }

  /* run the seed through the GRU to get a warm hidden state + last id */
  function primeState(m, seedToks) {
    var h = new Float32Array(m.H), ids = seedToks.map(function (t) { return idOf(m, t); });
    if (!ids.length) ids = [0];
    for (var i = 0; i < ids.length; i++) h = cell(m, emb(m, ids[i]), h).h;
    return { h: h, last: ids[ids.length - 1] };
  }

  function sampleNext(p, T, topK, counts, rep) {
    var V = p.length, e = [];
    for (var i = 0; i < V; i++) {
      var pr = Math.pow(Math.max(p[i], 1e-9), 1 / Math.max(0.05, T));
      if (counts && counts[i]) pr /= Math.pow(rep || 1.4, counts[i]);
      e.push([i, pr]);
    }
    e.sort(function (a, b) { return b[1] - a[1]; });
    if (topK) e = e.slice(0, topK);
    var sum = 0, k; for (k = 0; k < e.length; k++) sum += e[k][1];
    var rr = Math.random() * sum, acc = 0;
    for (k = 0; k < e.length; k++) { acc += e[k][1]; if (rr <= acc) return e[k][0]; }
    return e[0][0];
  }

  /* autoregressive free generation from seed tokens (strings). Carries the GRU
   * hidden state forward (true recurrence), so context isn't truncated. */
  function generate(m, seedToks, opts) {
    opts = opts || {};
    var maxTok = opts.maxTokens || 50, T = opts.temperature == null ? 0.8 : opts.temperature;
    var K = opts.topK || 8, rep = opts.repetitionPenalty || 1.4, minProduced = opts.minProduced || 8;
    var st = primeState(m, seedToks), h = st.h, last = st.last;
    var out = seedToks.slice(), counts = {}, produced = 0;
    for (var i = 0; i < maxTok; i++) {
      var p = outProbs(m, h);
      var nid = sampleNext(p, T, K, counts, rep);
      counts[nid] = (counts[nid] || 0) + 1;
      var t = m.vocab.itos[nid];
      if (nid !== 0) { out.push(t); produced++; }
      h = cell(m, emb(m, nid), h).h;   // advance recurrent state
      last = nid;
      if (ENDERS.test(t) && produced >= minProduced) break;
    }
    return out;
  }

  /* top-k next-token probabilities after a context string (for the lab panel) */
  function nextProbs(m, contextText, k) {
    var st = primeState(m, encode(m, contextText));
    var p = outProbs(m, st.h), arr = [];
    for (var i = 0; i < p.length; i++) arr.push([i, p[i]]);
    arr.sort(function (a, b) { return b[1] - a[1]; });
    return arr.slice(0, k || 8).map(function (x) { return { tok: m.vocab.itos[x[0]], prob: x[1] }; });
  }

  /* mean log-prob of a token sequence under the GRU (fluency / confidence) */
  function seqLogProb(m, toks) {
    var ids = toks.map(function (t) { return idOf(m, t); });
    if (ids.length < 2) return -1e9;
    var h = new Float32Array(m.H), lp = 0, n = 0;
    for (var i = 0; i < ids.length - 1; i++) {
      h = cell(m, emb(m, ids[i]), h).h;
      var p = outProbs(m, h); lp += Math.log(Math.max(p[ids[i + 1]], 1e-9)); n++;
    }
    return n ? lp / n : -1e9;
  }

  NSCode.gruLM = {
    create: create, trainAsync: trainAsync, generate: generate, nextProbs: nextProbs,
    seqLogProb: seqLogProb, encode: encode, cell: cell, outProbs: outProbs, _bptt: bptt
  };

  /* ---- lazy GRU lab singleton ----
   * Trains a GRU on the SAME knowledge base as the FF net, but only when first
   * requested (it's a heavier model) — the Neural Lab uses this to SHOW that a
   * recurrent net free-generates more coherent Japanese than the fixed-window FF
   * net (goal #2). Subscribers are notified on every progress tick. */
  NSCode.gruLab = (function () {
    var OPTS = { dim: 24, hidden: 48, maxVocab: 420, steps: 3000, lr: 0.1, seq: 16 };
    var state = { model: null, sig: '', training: false, prog: null, params: 0 };
    var listeners = [];
    function notify() { for (var i = 0; i < listeners.length; i++) { try { listeners[i](state); } catch (e) {} } }
    function sigOf(docs) { return docs.map(function (d) { return d.name + ':' + (d.text || '').length; }).join('|'); }

    function ensure(force) {
      if (!NSCode.askEngine) return;
      var docs = NSCode.askEngine.getDocs(), sig = sigOf(docs);
      if (!force && ((state.model && state.sig === sig) || (state.training && state.sig === sig))) { notify(); return; }
      var corpus = docs.map(function (d) { return d.text; }).join('\n');
      var m = create(corpus, OPTS);
      state.sig = sig; state.training = true; state.model = null;
      state.params = m.V * m.D + 3 * m.H * m.D + 3 * m.H * m.H + m.V * m.H;
      state.prog = { step: 0, total: OPTS.steps, loss: 0 }; notify();
      trainAsync(m, { steps: OPTS.steps, chunk: 120, lr: OPTS.lr, seq: OPTS.seq, onProgress: function (s) {
        if (state.sig !== sig) return; state.prog = s; notify();
      } }).then(function () { if (state.sig !== sig) return; state.model = m; state.training = false; notify(); });
    }

    return {
      OPTS: OPTS, state: state,
      onChange: function (fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
      ensure: ensure,
      generate: function (seedToks, gopts) { return state.model ? generate(state.model, seedToks, gopts) : null; }
    };
  })();
})(window.NSCode);

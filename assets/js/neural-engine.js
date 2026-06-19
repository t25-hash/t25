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
  var BARRIER = /^[、。，．！？!?…・]$|^\n$/;   // never merge punctuation / newlines into a word

  function tok(text) { return NSCode.babyLLM.tokenize(text); }

  /* ---- mini-BPE subword tokenizer (learned in-browser from the corpus) -------
   * The base tokens are single CJK chars (+ latin runs). On their own the net
   * predicts character-by-character and tends to produce non-words. Here we LEARN
   * the most frequent adjacent pairs and merge them into subword units (e.g.
   * 機械, 歯車, 軸受) so the net models meaningful chunks → far more fluent,
   * synthesis-like output. Fully local, no download. */
  function learnMerges(chars, numMerges, minFreq) {
    var seq = chars.slice(), merges = [];
    for (var it = 0; it < (numMerges || 300); it++) {
      var freq = {}, best = null, bestC = 0;
      for (var i = 0; i < seq.length - 1; i++) {
        var a = seq[i], b = seq[i + 1];
        if (BARRIER.test(a) || BARRIER.test(b)) continue;
        var key = a + '' + b, c = (freq[key] = (freq[key] || 0) + 1);
        if (c > bestC) { bestC = c; best = key; }
      }
      if (!best || bestC < (minFreq || 3)) break;
      var p = best.split(''), A = p[0], B = p[1], AB = A + B, out = [];
      for (var j = 0; j < seq.length; j++) {
        if (j < seq.length - 1 && seq[j] === A && seq[j + 1] === B) { out.push(AB); j++; }
        else out.push(seq[j]);
      }
      seq = out; merges.push([A, B]);
    }
    return merges;
  }
  function applyMerges(chars, merges) {
    if (!merges || !merges.length) return chars;
    var seq = chars.slice();
    for (var m = 0; m < merges.length; m++) {
      var A = merges[m][0], B = merges[m][1], AB = A + B, out = [];
      for (var j = 0; j < seq.length; j++) {
        if (j < seq.length - 1 && seq[j] === A && seq[j + 1] === B) { out.push(AB); j++; }
        else out.push(seq[j]);
      }
      seq = out;
    }
    return seq;
  }
  function encodeWith(m, text) { return applyMerges(tok(text), m.merges); }

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
    // learn subword merges from the corpus, then tokenize with them so the net
    // models word/phrase units instead of single characters.
    var chars = tok(text);
    var merges = opts.merges != null ? opts.merges
      : (opts.subword === false ? [] : learnMerges(chars, opts.numMerges || 300, opts.minMerge || 3));
    var tokens = applyMerges(chars, merges);
    var vocab = buildVocab(tokens, opts.maxVocab || 480);
    var C = opts.context || 2, D = opts.dim || 16, H = opts.hidden || 40, V = vocab.size;
    var ids = new Int32Array(tokens.length);
    for (var i = 0; i < tokens.length; i++) ids[i] = idOf({ vocab: vocab }, tokens[i]);
    return {
      vocab: vocab, ids: ids, merges: merges, C: C, D: D, H: H, V: V,
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
    var toks = encodeWith(m, contextText), ids = [];
    toks.forEach(function (t) { ids.push(idOf(m, t)); });
    while (ids.length < m.C) ids.unshift(0);
    var ctx = ids.slice(ids.length - m.C);
    var p = forward(m, ctx).p, arr = [];
    for (var i = 0; i < p.length; i++) arr.push([i, p[i]]);
    arr.sort(function (a, b) { return b[1] - a[1]; });
    return arr.slice(0, k || 8).map(function (x) { return { tok: m.vocab.itos[x[0]], prob: x[1] }; });
  }

  function hasKeys(o) { for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) return true; return false; }

  /* observed next-token transitions from the model's own training tokens
   * (m.ids). bi: prevId → {nextId:1}; tri: "p2,p1" → {nextId:1}. Used to mask
   * generation to corpus-real continuations (longest context wins, back-off). */
  function transitions(m) {
    var ids = m.ids, bi = {}, tri = {};
    for (var i = 1; i < ids.length; i++) {
      var a = ids[i - 1], b = ids[i];
      (bi[a] || (bi[a] = {}))[b] = 1;
      if (i >= 2) { var key = ids[i - 2] + ',' + a; (tri[key] || (tri[key] = {}))[b] = 1; }
    }
    return { bi: bi, tri: tri };
  }
  function allowFromTransitions(tr) {
    return function (ids) {
      var p1 = ids[ids.length - 1], p2 = ids[ids.length - 2];
      var t = (p2 != null) ? tr.tri[p2 + ',' + p1] : null;
      return (t && hasKeys(t)) ? t : (tr.bi[p1] || null);
    };
  }

  /* autoregressive generation from seed tokens (strings) */
  function generate(m, seedToks, opts) {
    opts = opts || {};
    var maxTok = opts.maxTokens || 50, T = opts.temperature == null ? 0.8 : opts.temperature, K = opts.topK || 8;
    var rep = opts.repetitionPenalty || 1.4, C = m.C;
    // tokens are single CJK chars, so don't end at the very first 。 — keep going
    // until at least this many tokens so the answer is a full sentence or two.
    var minProduced = opts.minProduced || 8;
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
      // restrict the next token to continuations that actually occur in the
      // corpus after this context (back-off). Tokens are single CJK chars, so
      // this is what keeps the net from gluing characters into non-words.
      var allow = opts.allow ? opts.allow(ids) : null;
      if (allow && !hasKeys(allow)) allow = null;   // no observed continuation → don't mask
      for (var v = 0; v < p.length; v++) {
        if (allow && !allow[v]) { p[v] = 0; continue; }           // off-corpus transition
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
      if (ENDERS.test(t2) && produced >= minProduced) break;
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
    return keySeeds(m, question, 1)[0] || null;
  }

  /* candidate seeds: EVERY in-vocab keyword run in the question (longest first),
   * each as up to C starting tokens. Trying several starting points — instead of
   * only the single longest word — gives the baby net more, more varied 起点
   * words and a better shot at a fluent continuation. */
  function keySeeds(m, question, maxSeeds) {
    var seeds = [], seen = {}, ids = m.ids, itos = m.vocab.itos;
    function anchored(firstId) {   // real C-token corpus window from the keyword's first occurrence
      for (var i = 0; i + m.C <= ids.length; i++) {
        if (ids[i] === firstId) { var w = []; for (var j = 0; j < m.C; j++) w.push(itos[ids[i + j]]); return w; }
      }
      return null;
    }
    function add(toks) {
      if (!toks) return;
      var inv = toks.filter(function (x) { return m.vocab.stoi[x] != null; });
      if (!inv.length) return;
      var s = inv.slice(0, m.C), key = s.join('');
      if (!seen[key]) { seen[key] = 1; seeds.push(s); }
    }
    var runs = (question.match(/[一-鿿ァ-ヶー]{2,}|[A-Za-z][A-Za-z0-9]+/g) || []);
    runs.sort(function (a, b) { return b.length - a.length; });
    runs.forEach(function (r) {
      var kt = encodeWith(m, r).filter(function (x) { return m.vocab.stoi[x] != null; });
      if (kt.length) add(anchored(m.vocab.stoi[kt[0]]) || kt);   // prefer a real corpus window
    });
    if (!seeds.length) {                                  // fallback: any content token
      var qt = encodeWith(m, question).filter(function (t) { return m.vocab.stoi[t] != null && !/[、。，．！？!?…・\n\s]/.test(t); });
      add(qt);
    }
    return seeds.slice(0, maxSeeds || 4);
  }

  /* ANSWER a question from the net's weights (no document search): seed from
   * several question keywords, sample continuations from each, and keep the one
   * the net is most confident in. This is neural recall — the text comes from
   * learned weights. Returns the winning seed plus all seeds it considered. */
  function answer(m, question, opts) {
    opts = opts || {};
    var seeds = keySeeds(m, question, opts.seeds || 4);
    if (!seeds.length) return { text: '', seed: '', seeds: [] };
    // down-weight separator/list tokens so the answer doesn't come out looking
    // character-separated (the corpus is full of e.g. 「軸振動・軸受温度・…」),
    // and use a stronger repetition penalty to avoid phrase loops.
    var avoid = { '・': 0.02, '、': 0.45, '，': 0.05, '…': 0.05, '·': 0.02 };
    var allow = allowFromTransitions(transitions(m));   // corpus-real continuations only
    var perSeed = Math.max(3, Math.round((opts.candidates || 14) / seeds.length));
    var best = null, bestScore = -1e9, bestSeed = seeds[0];
    for (var si = 0; si < seeds.length; si++) {
      for (var i = 0; i < perSeed; i++) {
        var temp = (opts.temperature || 0.45) * (0.8 + 0.4 * (i % 5) / 4);   // vary around the set temp
        var g = generate(m, seeds[si], { temperature: temp, topK: opts.topK || 6, maxTokens: opts.maxTokens || 72,
          minProduced: opts.minProduced || 22, repetitionPenalty: 1.9, avoid: avoid, noRepeatBigram: true, allow: allow });
        var sc = seqLogProb(m, g);
        if (sc > bestScore) { bestScore = sc; best = g; bestSeed = seeds[si]; }
      }
    }
    var join = NSCode.babyLLM.join;
    return { text: trimToSentence(join(best)), seed: join(bestSeed),
      seeds: seeds.map(function (s) { return join(s); }), score: bestScore };
  }

  /* cut a generated string at its last sentence ender so the answer doesn't end
   * on a dangling, half-formed clause. Falls back to the whole string. */
  function trimToSentence(s) {
    var m2 = String(s || '').match(/^[\s\S]*[。．！？!?]/);
    if (m2 && m2[0].replace(/[\s、,・]/g, '').length >= 8) return m2[0].trim();
    return String(s || '').trim();
  }

  /* ---- 句スパン単位の接地再構成（abstractive generation, "読める日本語"）--------
   * 自由生成（generate）はトークンを1つずつサンプリングするため、赤ちゃん級モデルでは
   * どうしても語が崩れる。代わりにここでは、モデルが学習したコーパスのトークン列
   * (m.ids) から「句スパン」＝句読点で区切られた連続トークン（＝実在の句）を取り出し、
   * 質問に最も接地する句を選んで軽く繋ぐ。各句はコーパス由来の実文字列なのでトークン
   * 崩れが起きず、必ず文法的に読める日本語になる（grounded reconstruction）。
   * 重い再学習や新アーキは不要で、既存の重みの「想起（seqLogProb）」だけを使う低コスト策。 */
  var STRIP_EDGE = /^[\s、。，．！？!?…・]+|[\s、。，．！？!?…・]+$/g;
  // a 句 cut at a 句読点 can keep a dangling case particle at its edge (前節の
  // 「…を」尾 / 後節頭の「が…」). Trimming ONE orphan particle per edge — only when
  // enough content remains — makes the stitched answer read cleaner (意味は保持)。
  var LEAD_PART = /^[がをにはでともへやの]/;
  var TAIL_PART = /[がをにへとや]$/;
  function tidySpan(t) {
    t = t.replace(STRIP_EDGE, '');
    // drop a lone leading ASCII figure/table label (PDF由来: 「c軸受…」「図I3…」の頭文字)
    // when it's immediately followed by Japanese — it's a label, not part of the 句.
    t = t.replace(/^[A-Za-z]\s*(?=[一-鿿ぁ-んァ-ヶー])/, '');
    if (LEAD_PART.test(t) && t.slice(1).replace(/[\s、。]/g, '').length >= 4) t = t.slice(1);
    if (TAIL_PART.test(t) && t.slice(0, -1).replace(/[\s、。]/g, '').length >= 4) t = t.slice(0, -1);
    return t;
  }

  function phraseSpans(m) {
    var itos = m.vocab.itos, ids = m.ids, spans = [], seen = {}, cur = [];
    function flush() {
      if (cur.length) {
        var toks = cur.slice(), text = NSCode.babyLLM.join(toks.map(function (id) { return itos[id]; }));
        var bare = text.replace(/[\s、。，．！？!?…・]/g, '');
        if (bare.length >= 6 && bare.length <= 48 && !seen[text]) { seen[text] = 1; spans.push({ toks: toks, text: text }); }
      }
      cur = [];
    }
    for (var i = 0; i < ids.length; i++) {
      var t = itos[ids[i]];
      if (t == null || t === '<unk>' || BARRIER.test(t)) flush();   // punctuation / newline / unk = 句 boundary
      else cur.push(ids[i]);
    }
    flush();
    return spans;
  }

  /* content terms of the question (kanji/katakana/latin runs — drop particles) */
  function termsOf(q) { return (String(q || '').match(/[一-鿿ァ-ヶー]{2,}|[A-Za-z][A-Za-z0-9]+/g) || []); }

  /* char-overlap ratio (shared ÷ shorter) — used to drop near-duplicate 句 */
  function overlapChars(a, b) {
    var sa = {}, shared = 0;
    for (var i = 0; i < a.length; i++) sa[a[i]] = 1;
    for (var j = 0; j < b.length; j++) if (sa[b[j]]) shared++;
    return shared / Math.max(1, Math.min(a.length, b.length));
  }

  /* grounded reconstruction: pick the question-grounded 句 from the learned corpus
   * and stitch the best few into one readable sentence. Keyword overlap dominates;
   * the net's own recall (seqLogProb) breaks ties so the chosen 句 is also the one
   * the weights most confidently model. Returns { text, spans, score }. */
  function groundedAnswer(m, question, opts) {
    opts = opts || {};
    var spans = phraseSpans(m);
    if (!spans.length) return { text: '', spans: [], score: -1e9 };
    var keys = termsOf(question), maxSpans = opts.maxSpans || 2;
    function overlap(text) {
      var sc = 0;
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (text.indexOf(k) >= 0) { sc += 1; continue; }
        for (var j = 0; j < k.length - 1; j++) if (text.indexOf(k[j] + k[j + 1]) >= 0) { sc += 0.25; break; }
      }
      return sc;
    }
    // prose quality: figure/table/caption fragments ("13に…例を示す", "記号の…グループ")
    // read poorly even though they're grounded. Penalise digit-heavy / caption-like 句
    // and reward clean prose so the reconstruction picks real explanatory sentences.
    var CAPTION = /(を示す|に示す|参照|記号|グループ|の欄|一覧|次表|下表|上表|下記|右図|左図|同図|式\(|一例|の例|例。|例$)/;
    var FIGREF = /[図表式]\s*[0-9０-９IⅠⅡ・･.]/;
    var HEADING = /(章第|第[0-9０-９一二三四五六七八九十]+章|^#|^[0-9０-９]+[・.][0-9０-９])/;   // breadcrumb / 見出し
    function noiseOf(text) {
      var digits = (text.match(/[0-9０-９]/g) || []).length;
      var latin = (text.match(/[A-Za-z]/g) || []).length;
      var leadNum = /^[0-9０-９]/.test(text) ? 1.6 : 0;       // bare leading number = figure ref (図3.5→「35…」)
      return 0.18 * digits + 0.04 * latin + leadNum + (FIGREF.test(text) ? 2.2 : 0) +
        (CAPTION.test(text) ? 1.6 : 0) + (HEADING.test(text) ? 1.8 : 0);
    }
    // definition questions ("Xとは" / "Xとは何か") want a defining 句.
    var wantDef = /とは|なに|何/.test(question);
    var DEFCUE = /(とは|をいう|のことである|である|を指す|を意味|と呼)/;
    spans.forEach(function (s) { s.ov = overlap(s.text); });
    // keep scoring cheap: only run the net's seqLogProb on the most on-topic 句.
    var pool = spans.filter(function (s) { return s.ov > 0; });
    if (pool.length < 3) pool = spans.slice();                 // no keyword hit → consider all (small corpora)
    pool.sort(function (a, b) { return b.ov - a.ov; });
    pool = pool.slice(0, opts.scoreCap || 40);
    pool.forEach(function (s) {
      var lp = seqLogProb(m, s.toks.map(function (id) { return m.vocab.itos[id]; }));
      var len = s.text.replace(/[\s、。，．！？!?…・]/g, '').length;
      var def = (wantDef && DEFCUE.test(s.text)) ? 1.2 : 0;
      var topic = (keys.length && s.text.indexOf(keys[0]) >= 0 && s.text.indexOf(keys[0]) <= 4) ? 0.5 : 0;
      s.score = s.ov * 2 + 0.2 * (lp + 6) - 0.015 * Math.abs(len - 22) + def + topic - noiseOf(s.text);
    });
    pool.sort(function (a, b) { return b.score - a.score; });
    var picked = [];
    for (var i = 0; i < pool.length && picked.length < maxSpans; i++) {
      var s = pool[i], dup = false;
      for (var p = 0; p < picked.length; p++) if (overlapChars(picked[p].text, s.text) >= 0.6) { dup = true; break; }
      if (!dup) picked.push(s);
    }
    // ensure recombination: if the strict (≤0.6 overlap) pass left fewer than maxSpans,
    // fill the rest from remaining spans that aren't near-identical (≤0.85). A real
    // 2-句 reconstruction reads as a synthesis, not a single verbatim sentence.
    for (var i2 = 0; i2 < pool.length && picked.length < maxSpans; i2++) {
      var s2 = pool[i2]; if (picked.indexOf(s2) >= 0) continue;
      var same = false;
      for (var p2 = 0; p2 < picked.length; p2++) if (overlapChars(picked[p2].text, s2.text) >= 0.85) { same = true; break; }
      if (!same) picked.push(s2);
    }
    if (!picked.length) picked = [pool[0]];
    // light abstraction: tidy each grounded 句's edges, then join into one sentence
    // (、 between, 。 to close). Every fragment is verbatim corpus text → 崩れない。
    var body = picked.map(function (s) { return tidySpan(s.text); }).filter(Boolean).join('、');
    // faithful token list = ONLY the source-derived span tokens (every one is a
    // corpus substring). The joining 「、」「。」 are display punctuation, not content,
    // so they're excluded here — callers verifying "no invented tokens" must not trip
    // on a synthetic ender (some PDF-derived passages use 「．」 not 「。」).
    var tokens = [];
    picked.forEach(function (s) { s.toks.forEach(function (id) { tokens.push(m.vocab.itos[id]); }); });
    return { text: body ? body + '。' : '', spans: picked.map(function (s) { return s.text; }),
      tokens: tokens, score: picked[0].score };
  }

  /* project the learned token embeddings to 2D (PCA, top-2 principal components
   * via power iteration) so the vocabulary can be drawn as a map — semantically
   * related subwords end up near each other. Returns [{tok, freq, nx, ny}] with
   * nx/ny in [0,1]. Pure JS, no library. */
  function embedMap(m, opts) {
    opts = opts || {};
    var D = m.D, V = m.V, freq = {};
    for (var i = 0; i < m.ids.length; i++) freq[m.ids[i]] = (freq[m.ids[i]] || 0) + 1;
    var ids = []; for (var id = 1; id < V; id++) ids.push(id);
    ids.sort(function (a, b) { return (freq[b] || 0) - (freq[a] || 0); });
    ids = ids.slice(0, Math.min(opts.max || 60, V - 1));
    var n = ids.length;
    if (n < 2) return [];
    var X = ids.map(function (tid) { var base = tid * D, v = new Float64Array(D); for (var d = 0; d < D; d++) v[d] = m.Emb[base + d]; return v; });
    var mean = new Float64Array(D);
    X.forEach(function (v) { for (var d = 0; d < D; d++) mean[d] += v[d]; });
    for (var d0 = 0; d0 < D; d0++) mean[d0] /= n;
    X.forEach(function (v) { for (var d = 0; d < D; d++) v[d] -= mean[d]; });
    var Cov = []; for (var a = 0; a < D; a++) Cov.push(new Float64Array(D));
    X.forEach(function (v) { for (var a = 0; a < D; a++) { var va = v[a]; for (var b = 0; b < D; b++) Cov[a][b] += va * v[b]; } });
    for (var a1 = 0; a1 < D; a1++) for (var b1 = 0; b1 < D; b1++) Cov[a1][b1] /= n;
    function mv(M, x) { var y = new Float64Array(D); for (var a = 0; a < D; a++) { var s = 0; for (var b = 0; b < D; b++) s += M[a][b] * x[b]; y[a] = s; } return y; }
    function nrm(x) { var s = 0; for (var i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s) || 1; }
    function power(M) { var x = new Float64Array(D); for (var i = 0; i < D; i++) x[i] = Math.sin(i + 1); for (var it = 0; it < 80; it++) { var y = mv(M, x), q = nrm(y); for (var j = 0; j < D; j++) x[j] = y[j] / q; } return x; }
    var v1 = power(Cov), Cv1 = mv(Cov, v1), lam = 0;
    for (var i1 = 0; i1 < D; i1++) lam += v1[i1] * Cv1[i1];
    var Cov2 = []; for (var a2 = 0; a2 < D; a2++) { Cov2.push(new Float64Array(D)); for (var b2 = 0; b2 < D; b2++) Cov2[a2][b2] = Cov[a2][b2] - lam * v1[a2] * v1[b2]; }
    var v2 = power(Cov2);
    var pts = ids.map(function (tid, k) {
      var v = X[k], x = 0, y = 0; for (var d = 0; d < D; d++) { x += v[d] * v1[d]; y += v[d] * v2[d]; }
      return { tok: m.vocab.itos[tid], freq: freq[tid] || 0, x: x, y: y };
    });
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var mnx = Math.min.apply(null, xs), mxx = Math.max.apply(null, xs), mny = Math.min.apply(null, ys), mxy = Math.max.apply(null, ys);
    pts.forEach(function (p) { p.nx = (p.x - mnx) / ((mxx - mnx) || 1); p.ny = (p.y - mny) / ((mxy - mny) || 1); });
    return pts;
  }

  /* ---- persistence + warm-start (for the feedback-trained "growing baby") ----
   * serialize(): JSON-able snapshot (weights as plain Arrays). ids are dropped —
   * scoring (forward/seqLogProb) only needs vocab + weights; training rebuilds ids
   * from a fresh corpus and warm-starts from the snapshot. */
  function serialize(m) {
    if (!m) return null;
    return {
      vocab: { stoi: m.vocab.stoi, itos: m.vocab.itos, size: m.vocab.size },
      merges: m.merges, C: m.C, D: m.D, H: m.H, V: m.V,
      Emb: Array.prototype.slice.call(m.Emb),
      W1: Array.prototype.slice.call(m.W1), b1: Array.prototype.slice.call(m.b1),
      W2: Array.prototype.slice.call(m.W2), b2: Array.prototype.slice.call(m.b2),
      steps: m.steps || 0, loss: m.loss || 0
    };
  }
  function restore(o) {
    if (!o) return null;
    return {
      vocab: { stoi: o.vocab.stoi, itos: o.vocab.itos, size: o.vocab.size },
      ids: new Int32Array(0), merges: o.merges || [], C: o.C, D: o.D, H: o.H, V: o.V,
      Emb: Float32Array.from(o.Emb),
      W1: Float32Array.from(o.W1), b1: Float32Array.from(o.b1),
      W2: Float32Array.from(o.W2), b2: Float32Array.from(o.b2),
      steps: o.steps || 0, loss: o.loss || 0
    };
  }
  /* copy weights from oldM into newM so incremental training keeps prior learning.
   * Per-token weights (Emb row, W2 column, b2) are matched by VOCAB STRING, so a
   * rebuilt vocab (different ids / new words) still inherits what overlaps. The
   * vocab-independent W1/b1 carry over directly when C·D·H match. */
  function warmStart(newM, oldM) {
    if (!newM || !oldM) return newM;
    if (newM.C === oldM.C && newM.D === oldM.D && newM.H === oldM.H) {
      newM.W1.set(oldM.W1); newM.b1.set(oldM.b1);
    }
    if (newM.D !== oldM.D) return newM;     // embedding width changed → can't copy rows
    var D = newM.D, H = newM.H, Vn = newM.V, Vo = oldM.V, itos = newM.vocab.itos, ostoi = oldM.vocab.stoi;
    for (var vn = 0; vn < Vn; vn++) {
      var vo = ostoi[itos[vn]];
      if (vo == null) continue;
      for (var d = 0; d < D; d++) newM.Emb[vn * D + d] = oldM.Emb[vo * D + d];
      if (H === oldM.H) { for (var j = 0; j < H; j++) newM.W2[j * Vn + vn] = oldM.W2[j * Vo + vo]; }
      newM.b2[vn] = oldM.b2[vo];
    }
    return newM;
  }

  NSCode.neuralLM = {
    tokenize: tok, encode: encodeWith, buildVocab: buildVocab, create: create, embedMap: embedMap,
    learnMerges: function (text, opts) { opts = opts || {}; return learnMerges(tok(text), opts.numMerges || 300, opts.minMerge || 3); },
    forward: forward, step: step, trainAsync: trainAsync, generate: generate, nextProbs: nextProbs,
    seqLogProb: seqLogProb, keySeed: keySeed, keySeeds: keySeeds, answer: answer,
    phraseSpans: phraseSpans, groundedAnswer: groundedAnswer,
    serialize: serialize, restore: restore, warmStart: warmStart
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
      answer: function (question, gopts) { return state.model ? answer(state.model, question, gopts) : null; },
      groundedAnswer: function (question, gopts) { return state.model ? groundedAnswer(state.model, question, gopts) : null; }
    };
  })();
})(window.NSCode);

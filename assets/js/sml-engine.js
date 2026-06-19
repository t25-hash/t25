/* SML grounded generation — abstractive answers from OUR OWN small model.
 *
 * The baby net can't free-generate fluent Japanese, and unconstrained decoding
 * hallucinates. So we generate under a COPY CONSTRAINT: at every step the next
 * token is restricted to tokens that appear in the retrieved passages, plus a
 * small set of Japanese function words / connectives / enders. The SML scores
 * fluency; the constraint guarantees faithfulness. The result recombines,
 * compresses and connects source spans into a NEW sentence (= abstractive) that
 * cannot state facts absent from the sources.
 *
 * Hybrid training: a fresh per-query model is warm-started from the persistent
 * base (Neural Lab / feedback model) so it inherits general fluency, then fine-
 * tuned a little on the retrieved context. Fully on-device, no external model,
 * no WebGPU — works anywhere. Returns '' on failure so Ask falls back to extract.
 */
(function (NSCode) {
  'use strict';

  // function words / particles / connectives / copula / enders. Only those that
  // exist in the model vocab are actually allowed — the rest are ignored.
  var FUNCTION_TOKENS = ('。 、 は が を に で と の へ や も か から まで など ' +
    'および ならびに また さらに 一方 つまり すなわち このため そのため よって したがって ただし なお ' +
    'である です ます だ こと もの ため これ それ この その という による において に対して として').split(' ');

  function baseModel() {
    if (NSCode.neuralLab && NSCode.neuralLab.state && NSCode.neuralLab.state.model) return NSCode.neuralLab.state.model;
    if (NSCode.feedback && NSCode.feedback.model) { var fm = NSCode.feedback.model(); if (fm) return fm; }
    return null;
  }

  /* set of allowed vocab ids = context tokens ∪ in-vocab function tokens */
  function allowedSet(m, ctxText) {
    var L = NSCode.neuralLM, allowed = {};
    L.encode(m, ctxText).forEach(function (t) { var id = m.vocab.stoi[t]; if (id != null && id !== 0) allowed[id] = 1; });
    FUNCTION_TOKENS.forEach(function (t) { var id = m.vocab.stoi[t]; if (id != null && id !== 0) allowed[id] = 1; });
    return allowed;
  }

  /* temperature + top-k sampling restricted to the allowed set, with a repetition
   * penalty (tiny LMs loop without it). Returns an id or null. */
  function pickAllowed(p, allowed, T, counts, rep) {
    var arr = [], id;
    for (id in allowed) {
      id = +id;
      var pr = Math.pow(Math.max(p[id], 1e-9), 1 / Math.max(0.1, T)) / Math.pow(rep, counts[id] || 0);
      arr.push([id, pr]);
    }
    if (!arr.length) return null;
    arr.sort(function (a, b) { return b[1] - a[1]; });
    arr = arr.slice(0, 12);
    var sum = 0, i; for (i = 0; i < arr.length; i++) sum += arr[i][1];
    var r = Math.random() * sum, acc = 0;
    for (i = 0; i < arr.length; i++) { acc += arr[i][1]; if (r <= acc) return arr[i][0]; }
    return arr[0][0];
  }

  function seedIds(m, question, ctxText) {
    var L = NSCode.neuralLM, C = m.C, toks = null;
    if (L.keySeeds) toks = L.keySeeds(m, question, 1)[0];     // on-topic corpus window from a question keyword
    var ids;
    if (toks && toks.length) ids = toks.map(function (t) { return m.vocab.stoi[t] == null ? 0 : m.vocab.stoi[t]; });
    else ids = Array.prototype.slice.call(m.ids, 0, C);        // fallback: corpus start
    while (ids.length < C) ids.unshift(0);
    return ids.slice(ids.length - C);
  }

  function cleanup(s) {
    s = s.replace(/<unk>/g, '').replace(/^[、。\s]+/, '').replace(/。{2,}/g, '。').trim();
    if (s && !/[。．！？]$/.test(s)) s += '。';
    return s;
  }

  /* grounded decode → {text, tokens, allowedSize, mode}.
   * PRIMARY: 句スパン単位の接地再構成 — stitch whole source 句 (phrase-spans) the net
   * recalls, rather than decoding token-by-token (which a baby model breaks into
   * 「がの、、、、。」). Every span is verbatim corpus text, so the result reads cleanly
   * and stays faithful. FALLBACK: the token-level copy-constrained decode below,
   * used when span reconstruction can't recombine ≥2 distinct 句. */
  function decode(m, question, ctxText, opts) {
    opts = opts || {};
    var L = NSCode.neuralLM, C = m.C;
    var allowed = allowedSet(m, ctxText);

    if (L.groundedAnswer) {
      var span = L.groundedAnswer(m, question, { maxSpans: opts.maxSpans || 2 });
      if (span && span.text) {
        var recombines = span.spans && span.spans.length >= 2;
        // prefer the readable span reconstruction over the token decode whenever it
        // recombines ≥2 句 (≥14 chars), or is a solid single 句 (≥18 chars) — either
        // way it reads cleanly. Only truly empty/tiny span output falls through to
        // the token-level decode below.
        if ((recombines && span.text.length >= 14) || span.text.length >= 18) {
          return { text: cleanup(span.text), tokens: span.tokens || [],
            spans: span.spans, allowedSize: Object.keys(allowed).length, mode: 'span' };
        }
      }
    }

    var enderId = m.vocab.stoi['。'];
    var ctx = seedIds(m, question, ctxText), out = [], counts = {};
    var T = opts.temperature == null ? 0.5 : opts.temperature;
    var maxTok = opts.maxTokens || 80, minChars = opts.minChars || 24, rep = opts.repetitionPenalty || 1.7;
    for (var s = 0; s < maxTok; s++) {
      var p = L.forward(m, ctx).p;
      var id = pickAllowed(p, allowed, T, counts, rep);
      if (id == null) break;
      out.push(id); counts[id] = (counts[id] || 0) + 1;
      ctx = ctx.slice(1).concat(id);
      var len = out.reduce(function (n, i) { return n + (m.vocab.itos[i] || '').length; }, 0);
      if (id === enderId && len >= minChars) break;
      // loop guard: same token 3× in the last 4 steps → stop
      if (out.length >= 4 && out[out.length - 1] === out[out.length - 3] && out[out.length - 2] === out[out.length - 4]) break;
    }
    var tokens = out.map(function (i) { return m.vocab.itos[i] || ''; });
    return { text: cleanup(tokens.join('')), tokens: tokens, allowedSize: Object.keys(allowed).length, mode: 'token' };
  }

  /* hybrid: warm-start from the persistent base, fine-tune on the retrieved
   * context, then grounded-decode. Returns Promise<{text,tokens,...}>. */
  function debugAnswer(question, contexts, opts) {
    opts = opts || {};
    var L = NSCode.neuralLM;
    if (!L || !contexts || !contexts.length) return Promise.resolve({ text: '', tokens: [] });
    var ctxText = contexts.join('\n');
    var m = L.create(ctxText, { context: 3, dim: 24, hidden: 64, maxVocab: 600 });
    if (m.ids.length <= m.C + 4) return Promise.resolve({ text: '', tokens: [] });
    var base = baseModel();
    if (base) L.warmStart(m, base);
    return L.trainAsync(m, { steps: opts.steps || 500, chunk: 250, lr: 0.15, onProgress: opts.onProgress })
      .then(function () { return decode(m, question, ctxText, opts); });
  }

  function groundedAnswer(question, contexts, opts) {
    return debugAnswer(question, contexts, opts).then(function (r) {
      return (r.text && r.text.length >= 10) ? r.text : '';   // too short/degenerate → let caller fall back
    });
  }

  NSCode.sml = {
    groundedAnswer: groundedAnswer, debugAnswer: debugAnswer,
    _allowedSet: allowedSet, _decode: decode, FUNCTION_TOKENS: FUNCTION_TOKENS
  };
})(window.NSCode);

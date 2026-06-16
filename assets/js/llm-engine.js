/* NSCode baby LLM — a REAL (tiny) statistical language model that runs fully
 * in the browser, no API, no download. It is an n-gram model with back-off:
 * it learns next-token probabilities from text and GENERATES text by predicting
 * one token at a time with temperature / top-k sampling (autoregressive) — the
 * same loop a real LLM uses, just statistical instead of neural ("赤ちゃん級").
 * Tokens: latin words/numbers, single CJK chars, and punctuation. */
(function (NSCode) {
  'use strict';

  var SEP = '';
  var ENDERS = /[。．！？!?]/;

  function tokenize(text) {
    return (String(text).match(/[A-Za-z0-9']+|[぀-ヿ一-鿿]|[、。，．！？!?…・]|\n/g)) || [];
  }
  function isLatin(t) { return /^[A-Za-z0-9']+$/.test(t); }
  function join(tokens) {
    var out = '';
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t === '\n') { out += '\n'; continue; }
      var sp = i > 0 && isLatin(t) && isLatin(tokens[i - 1]);
      out += (sp ? ' ' : '') + t;
    }
    return out.trim();
  }

  /* train n-gram counts (orders 1..order) -> model */
  function train(text, order) {
    order = order || 3;
    var toks = tokenize(text), m = {};
    for (var n = 1; n <= order; n++) m[n] = {};
    for (var i = 0; i < toks.length; i++) {
      for (var n2 = 1; n2 <= order; n2++) {
        if (i < n2 - 1) continue;
        var ctx = n2 === 1 ? '' : toks.slice(i - (n2 - 1), i).join(SEP);
        var tbl = m[n2][ctx] || (m[n2][ctx] = {});
        tbl[toks[i]] = (tbl[toks[i]] || 0) + 1;
      }
    }
    return { m: m, order: order, vocab: Object.keys(m[1][''] || {}).length };
  }

  /* next-token distribution table with back-off (longest matching context wins) */
  function distTable(model, ctxToks) {
    for (var n = model.order; n >= 1; n--) {
      var ctx = n === 1 ? '' : ctxToks.slice(ctxToks.length - (n - 1)).join(SEP);
      var tbl = model.m[n][ctx];
      if (tbl && Object.keys(tbl).length) return { tbl: tbl, order: n };
    }
    return null;
  }

  /* counts -> temperature-scaled, top-k probabilities (sorted desc) */
  function probs(tbl, temperature, topK, limit) {
    var T = Math.max(0.05, temperature || 1);
    var e = Object.keys(tbl).map(function (k) { return [k, Math.pow(tbl[k], 1 / T)]; });
    e.sort(function (a, b) { return b[1] - a[1]; });
    if (topK) e = e.slice(0, topK);
    var sum = e.reduce(function (s, x) { return s + x[1]; }, 0) || 1;
    var out = e.map(function (x) { return { tok: x[0], prob: x[1] / sum }; });
    return limit ? out.slice(0, limit) : out;
  }

  function sampleFrom(list) {
    var r = Math.random(), acc = 0;
    for (var i = 0; i < list.length; i++) { acc += list[i].prob; if (r <= acc) return list[i].tok; }
    return list[list.length - 1].tok;
  }

  /* autoregressive generation: predict one token at a time and sample */
  function generate(model, seedToks, opts) {
    opts = opts || {};
    var maxTok = opts.maxTokens || 50, T = opts.temperature == null ? 0.8 : opts.temperature, K = opts.topK || 8;
    var out = seedToks.slice();
    for (var i = 0; i < maxTok; i++) {
      var d = distTable(model, out);
      if (!d) break;
      var nxt = sampleFrom(probs(d.tbl, T, K));
      out.push(nxt);
      if (ENDERS.test(nxt) && (out.length - seedToks.length) >= 8) break;
    }
    return out;
  }

  /* greedy trace of the first few prediction steps (for the education panel) */
  function trace(model, seedToks, steps, opts) {
    opts = opts || {};
    var T = opts.temperature == null ? 0.8 : opts.temperature, K = opts.topK || 8;
    var ctx = seedToks.slice(), rows = [];
    for (var s = 0; s < (steps || 5); s++) {
      var d = distTable(model, ctx);
      if (!d) break;
      var top = probs(d.tbl, T, K, 5);
      rows.push({ context: join(ctx.slice(-3)), order: d.order, top: top, chosen: top[0].tok });
      ctx.push(top[0].tok);
      if (ENDERS.test(top[0].tok)) break;
    }
    return rows;
  }

  NSCode.babyLLM = {
    tokenize: tokenize, join: join, train: train,
    distTable: distTable, probs: probs, generate: generate, trace: trace
  };
})(window.NSCode);

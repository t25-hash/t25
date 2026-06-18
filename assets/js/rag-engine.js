/* NSCode RAG engine — a working, offline RAG pipeline (no backend / no LLM).
 * Retrieval uses TF-IDF cosine (lexical, not dense embeddings); reranking uses
 * MMR for diversity; hallucination check uses answer/context term overlap.
 * These are real algorithms — labelled in the UI so the trade-offs are clear. */
(function (NSCode) {
  'use strict';

  /* shared tokenizer: latin words + CJK character bigrams */
  function terms(text) {
    var out = [];
    var latin = String(text).toLowerCase().match(/[a-z][a-z0-9\-]{1,}/g) || [];
    for (var i = 0; i < latin.length; i++) out.push(latin[i]);
    var cjk = String(text).match(/[぀-ヿ一-鿿ｦ-ﾟ]/g) || [];
    for (var j = 0; j < cjk.length - 1; j++) out.push(cjk[j] + cjk[j + 1]);
    return out;
  }

  /* ---------- Chunking ---------- */
  function chunk(text, opts) {
    opts = opts || {};
    var size = Math.max(16, opts.size || 512);
    var overlap = Math.max(0, Math.min(size - 1, opts.overlap || 0));
    var sep = opts.separator == null ? '' : opts.separator;
    var chunks = [];

    function pushWindow(s, baseStart) {
      var step = Math.max(1, size - overlap);
      for (var i = 0; i < s.length; i += step) {
        var piece = s.slice(i, i + size);
        chunks.push({ id: chunks.length, text: piece, start: baseStart + i, end: baseStart + Math.min(i + size, s.length), overlap: i > 0 ? overlap : 0 });
        if (i + size >= s.length) break;
      }
    }

    if (!sep) { pushWindow(text, 0); return chunks; }

    // separator-aware greedy packing; oversize segments are char-windowed
    var segs = text.split(sep);
    var cur = '', curStart = 0, cursor = 0;
    for (var k = 0; k < segs.length; k++) {
      var seg = segs[k];
      var join = cur ? sep + seg : seg;
      if (seg.length > size) {
        if (cur) { chunks.push(mk(cur, curStart)); cur = ''; }
        pushWindow(seg, cursor);
        cursor += seg.length + sep.length;
        curStart = cursor;
        continue;
      }
      if ((cur + join).length <= size || !cur) { cur += join; }
      else {
        chunks.push(mk(cur, curStart));
        var tail = overlap ? cur.slice(-overlap) : '';
        cur = tail + (tail ? sep : '') + seg;
        curStart = cursor - tail.length;
      }
      cursor += seg.length + sep.length;
    }
    if (cur) chunks.push(mk(cur, curStart));
    return chunks;

    function mk(t, start) { return { id: chunks.length, text: t, start: start, end: start + t.length, overlap: 0 }; }
  }

  /* ---------- TF-IDF index + cosine retrieval ---------- */
  function tf(text) { var m = {}; terms(text).forEach(function (t) { m[t] = (m[t] || 0) + 1; }); return m; }
  function norm(v) { var s = 0; for (var k in v) s += v[k] * v[k]; return Math.sqrt(s); }
  function dot(a, b) { var s = 0, k; var sm = a, lg = b; if (Object.keys(a).length > Object.keys(b).length) { sm = b; lg = a; } for (k in sm) if (lg[k]) s += sm[k] * lg[k]; return s; }
  function cosine(a, b) { var na = norm(a), nb = norm(b); return (na && nb) ? dot(a, b) / (na * nb) : 0; }

  function buildIndex(chunks) {
    var N = chunks.length, df = {}, tfs = [];
    chunks.forEach(function (c) {
      var m = tf(c.text); tfs.push(m);
      Object.keys(m).forEach(function (t) { df[t] = (df[t] || 0) + 1; });
    });
    var idf = {};
    Object.keys(df).forEach(function (t) { idf[t] = Math.log(1 + N / df[t]); });
    var vecs = tfs.map(function (m) {
      var v = {}; Object.keys(m).forEach(function (t) { v[t] = m[t] * idf[t]; }); return v;
    });
    return { idf: idf, vecs: vecs };
  }

  function vectorize(text, idf) {
    var m = tf(text), v = {};
    Object.keys(m).forEach(function (t) { if (idf[t]) v[t] = m[t] * idf[t]; });
    return v;
  }

  function retrieve(query, chunks, opts) {
    opts = opts || {};
    var topK = opts.topK || 5, threshold = opts.threshold || 0;
    var idx = buildIndex(chunks);
    var qv = vectorize(query, idx.idf);
    // optional per-term boost (term -> multiplier): callers weight the query's
    // SPECIFIC words up so chunks about the asked topic outrank chunks that merely
    // share boilerplate. Backward compatible — no boost means identical behaviour.
    if (opts.boost) for (var bt in qv) if (opts.boost[bt]) qv[bt] *= opts.boost[bt];
    var scored = chunks.map(function (c, i) {
      return { chunk: c, vec: idx.vecs[i], score: cosine(qv, idx.vecs[i]) };
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return { qvec: qv, hits: scored.filter(function (s) { return s.score >= threshold; }).slice(0, topK) };
  }

  /* ---------- MMR reranking (diversity) ---------- */
  function mmr(qvec, candidates, opts) {
    opts = opts || {};
    var lambda = opts.lambda == null ? 0.7 : opts.lambda;
    var k = opts.k || candidates.length;
    var pool = candidates.slice(), selected = [];
    while (selected.length < k && pool.length) {
      var best = null, bestScore = -Infinity;
      for (var i = 0; i < pool.length; i++) {
        var c = pool[i];
        var rel = c.score;
        var div = 0;
        for (var j = 0; j < selected.length; j++) div = Math.max(div, cosine(c.vec, selected[j].vec));
        var s = lambda * rel - (1 - lambda) * div;
        if (s > bestScore) { bestScore = s; best = c; }
      }
      best.mmr = bestScore;
      selected.push(best); pool.splice(pool.indexOf(best), 1);
    }
    return selected;
  }

  /* ---------- Context builder ---------- */
  function buildContext(hits, template, query) {
    var ctx = hits.map(function (h, i) {
      return '[' + (i + 1) + '] ' + h.chunk.text.trim();
    }).join('\n\n');
    return (template || 'あなたは正確なアシスタントです。以下のコンテキストのみを根拠に質問へ答えてください。\n\n# コンテキスト\n{context}\n\n# 質問\n{query}\n\n# 回答')
      .replace('{context}', ctx).replace('{query}', query || '');
  }

  /* ---------- Hallucination heuristic ---------- */
  function splitSentences(text) {
    var t = String(text).replace(/\s+/g, ' ').trim(), out = [], buf = '';
    for (var i = 0; i < t.length; i++) {
      var c = t.charAt(i); buf += c;
      if ('。．！？!?'.indexOf(c) >= 0) { out.push(buf); buf = ''; }
      else if (c === '.') { var nx = t.charAt(i + 1); if (nx === '' || nx === ' ') { out.push(buf); buf = ''; } }
    }
    if (buf.trim()) out.push(buf);
    return out.map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
  }

  function analyzeHallucination(answer, contextText) {
    var ctx = {}; terms(contextText).forEach(function (t) { ctx[t] = 1; });
    return splitSentences(answer).map(function (s) {
      var ts = terms(s);
      var sup = ts.filter(function (t) { return ctx[t]; }).length;
      var ratio = ts.length ? sup / ts.length : 1;
      return { sentence: s, ratio: ratio, supported: sup, total: ts.length, flagged: ratio < 0.5 };
    });
  }

  NSCode.rag = {
    terms: terms, chunk: chunk, retrieve: retrieve, mmr: mmr, cosine: cosine,
    buildIndex: buildIndex, vectorize: vectorize,
    buildContext: buildContext, analyzeHallucination: analyzeHallucination,
    splitSentences: splitSentences
  };
})(window.NSCode);

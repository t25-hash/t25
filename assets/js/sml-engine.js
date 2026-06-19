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

  /* warm-start base = the STRONGER of the Neural Lab base net and the persistent
   * feedback net (more SGD steps ≈ more fluent). Goal #3 pretrains the feedback net
   * so this is non-null and well-trained even before the user grades anything. */
  function baseModel() {
    var lab = (NSCode.neuralLab && NSCode.neuralLab.state) ? NSCode.neuralLab.state.model : null;
    var fb = (NSCode.feedback && NSCode.feedback.model) ? NSCode.feedback.model() : null;
    if (lab && fb) return ((fb.steps || 0) >= (lab.steps || 0)) ? fb : lab;
    return lab || fb || null;
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

  /* ---------- 接地リコンビネーション生成（grammar-ruled grounded generation） -------
   * 赤ちゃんモデルは「どの語を使うか」を生成・選択するが、文の骨格は SML スロット
   * （主語・対象・述語）に固定し grammar.compile で組み立てる。これにより
   *   - 文法は構造的に壊れない（生成自体にルールが入っている）
   *   - 語は文脈の copy 制約＋kuromoji の品詞でスロット適合のものだけ（幻覚しない）
   *   - 主語と対象/述語の関係は実文（質問キーワードを含む文）から接地（recombination）
   * 自由トークン生成の崩壊問題を、構造を与えることで根本的に回避する。 */
  function recombine(question, contexts, opts) {
    opts = opts || {};
    var G = NSCode.grammar, AE = NSCode.askEngine, EM = NSCode.embeddings, L = NSCode.neuralLM;
    if (!G || !G.ready || !G.ready() || !G.analyze || !L) return Promise.resolve('');
    var ki = (AE && AE._internal) || {};
    var keyTerms = ki.keyTerms || function () { return []; };
    var classifyIntent = ki.classifyIntent || function () { return 'default'; };
    var ctxText = contexts.join('\n');
    var subj = (keyTerms(question)[0]) || '';
    if (!subj) return Promise.resolve('');                       // no topic → let neural/extractive handle
    // sentences that mention the subject (the grounding pool); fall back to all
    var sents = ctxText.split(/(?<=[。．！？\n])/).map(function (s) { return s.replace(/^[\s　]+|[\s　]+$/g, ''); })
      .filter(function (s) { return s.length >= 8 && s.length <= 160; });
    var pool = sents.filter(function (s) { return s.indexOf(subj) >= 0; });
    if (!pool.length) return Promise.resolve('');
    var intent = classifyIntent(question);
    var qv = EM ? EM.embed(question, 64) : null;
    function rel(text) { return (qv && EM) ? EM.cosine(qv, EM.embed(text, 64)) : 0; }
    // harvest slot candidates from the grounding pool (kuromoji POS)
    var genus = [], objs = {}, verbs = {};
    pool.forEach(function (s) {
      var tk = G.analyze(s); if (!tk) return;
      var pr = G.predicate(tk);
      if (pr && pr.finite) {
        if (pr.isAdj) genus.push({ genus: pr.dict, pr: pr, rel: rel(s) });
        else if (!verbs[pr.dict] || verbs[pr.dict].rel < rel(s)) verbs[pr.dict] = { dict: pr.dict, pr: pr, rel: rel(s) };
      }
      G.nouns(tk).forEach(function (n) {
        if (!n.text || n.text.length < 2 || n.text === subj || subj.indexOf(n.text) >= 0) return;
        if (/[、，,。．・]/.test(n.text)) return;                  // no punctuation in a slot filler
        // prefer informative content: reward を-objects, penalise nouns that merely
        // echo the question (役割/種類…) so the object carries new information.
        var r = rel(n.text) + (n.particle === 'を' ? 0.15 : 0) - (question.indexOf(n.text) >= 0 ? 0.3 : 0);
        if (!objs[n.text] || objs[n.text].rel < r) objs[n.text] = { text: n.text, rel: r };
      });
    });
    // baby model scores grounded slot combinations (this is the "generation" step)
    var m = L.create(ctxText, { context: 3, dim: 24, hidden: 64, maxVocab: 600 });
    if (m.ids.length <= m.C + 4) return Promise.resolve('');
    var base = baseModel(); if (base) L.warmStart(m, base);
    return L.trainAsync(m, { steps: opts.steps || 400, chunk: 250, lr: 0.15, onProgress: opts.onProgress }).then(function () {
      function mscore(s) { var t = L.encode(m, s); return t.length ? L.seqLogProb(m, t) / t.length : -1e9; }
      var sml = null;
      var genusTop = genus.sort(function (a, b) { return b.rel - a.rel; }).slice(0, 4);
      var objTop = Object.keys(objs).map(function (k) { return objs[k]; }).sort(function (a, b) { return b.rel - a.rel; }).slice(0, 5);
      var verbTop = Object.keys(verbs).map(function (k) { return verbs[k]; }).sort(function (a, b) { return b.rel - a.rel; }).slice(0, 5);
      if ((intent === 'definition' || (!objTop.length || !verbTop.length)) && genusTop.length) {
        // 名詞述語: 「S は <genus> である/です」— model picks the genus
        var bg = genusTop.map(function (g) { return { g: g, sc: g.rel + 0.04 * mscore(subj + 'は' + g.genus) }; })
          .sort(function (a, b) { return b.sc - a.sc; })[0].g;
        sml = { subject: subj, adjective: bg.genus, politeness: bg.pr.polite ? 'polite' : 'plain', tense: bg.pr.tense };
      } else if (objTop.length && verbTop.length) {
        // 「S は <object> を <verb>」— model picks the most likely grounded object+verb
        var best = null, bestSc = -1e18;
        objTop.forEach(function (o) { verbTop.forEach(function (v) {
          var sc = o.rel + v.rel + 0.04 * mscore(subj + 'は' + o.text + 'を' + v.dict);
          if (sc > bestSc) { bestSc = sc; best = { o: o, v: v }; }
        }); });
        sml = { subject: subj, object: best.o.text, action: best.v.dict, politeness: best.v.pr.polite ? 'polite' : 'plain', tense: best.v.pr.tense, negative: best.v.pr.negative };
      }
      if (!sml) return '';
      var built = G.compile(sml).sentence;
      if (!built) return '';
      var out = (G.normalize ? (G.normalize(built).text || built) : built);
      // faithfulness: every content word must come from the context or the subject
      var runs = out.match(/[一-鿿ァ-ヶー0-9A-Za-z]+/g) || [];
      if (!runs.every(function (t) { return ctxText.indexOf(t) >= 0 || subj.indexOf(t) >= 0 || t === subj; })) return '';
      if (G.coherence && !G.coherence(out).ok) return '';
      return out;
    });
  }

  function groundedAnswer(question, contexts, opts) {
    var G = NSCode.grammar;
    // Prefer grammar-ruled grounded recombination (natural by construction) when
    // kuromoji is ready; otherwise fall back to the experimental free token decode.
    var primary = (G && G.ready && G.ready()) ? recombine(question, contexts, opts) : Promise.resolve('');
    return primary.then(function (rc) {
      if (rc) return rc;
      return debugAnswer(question, contexts, opts).then(function (r) {
        if (!r.text || r.text.length < 10) return '';           // too short → let caller fall back
        // coherence gate: reject token-salad so Ask falls back to the extractive answer.
        if (G && G.coherence && !G.coherence(r.text).ok) return '';
        return r.text;
      });
    });
  }

  NSCode.sml = {
    groundedAnswer: groundedAnswer, debugAnswer: debugAnswer, recombine: recombine,
    _allowedSet: allowedSet, _decode: decode, FUNCTION_TOKENS: FUNCTION_TOKENS
  };
})(window.NSCode);

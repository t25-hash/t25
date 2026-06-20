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

  /* token-level grounded decode → {text, tokens, allowedSize} */
  function decode(m, question, ctxText, opts) {
    opts = opts || {};
    var L = NSCode.neuralLM, C = m.C;
    var allowed = allowedSet(m, ctxText);
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
    return { text: cleanup(tokens.join('')), tokens: tokens, allowedSize: Object.keys(allowed).length };
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

  /* ---------- 接地リコンビネーション生成（intent 駆動の多面的グラウンデッド合成） ----
   * 目標は「文法的に自然」かつ「内容が濃く的を射た」回答。崩壊回避だけでなく内容品質を
   * 上げるため、語をバラバラに拾うのをやめ、実文から intent に合った密度の高い文を選び、
   * 相補的な側面（定義＋目的/特徴）を合成・圧縮して 1〜2 文の回答に組み立てる。
   *   - 内容: ask-engine と同じ intent キュー＋関連度で「的を射た実文」を選ぶ（的外れ回避）
   *   - 濃さ: 主側面＋相補側面の 2 文合成（単文抽出より情報量が多い）
   *   - 生成: 赤ちゃんモデル(seqLogProb)が上位候補から流暢な主文を選び、kuromoji/SML で
   *           文を正準化・圧縮する（単なる抽出ではなく再構成）
   *   - 安全: 内容語は文脈由来のみ（幻覚しない）、grammar で文法正規化 */
  var GEN_CUE = {
    definition: /(とは|をいう|のこと|を指す|を意味|と呼ば|と称|と定義|機械要素|要素|装置|部品|機構|総称|もの)/,
    purpose: /(目的|ため|役割|用途|機能|働き|防止|防ぐ|向上|低減|抑え|果た|に用い|に使わ|を担|による)/,
    features: /(特徴|利点|長所|短所|性質|優れ|劣る|耐食|耐熱|耐摩耗|やすい|にくい|高い|低い|大き|小さ|軽|硬|安価|強い|滑らか)/,
    why: /(理由|原因|による|生じ|防ぐ|により|ことで|から|ため)/
  };
  function recombine(question, contexts, opts) {
    opts = opts || {};
    var G = NSCode.grammar, AE = NSCode.embeddings && NSCode.askEngine, EM = NSCode.embeddings, L = NSCode.neuralLM;
    if (!G || !G.ready || !G.ready() || !L) return Promise.resolve('');
    var ki = (NSCode.askEngine && NSCode.askEngine._internal) || {};
    var keyTerms = ki.keyTerms || function () { return []; };
    var classifyIntent = ki.classifyIntent || function () { return 'default'; };
    var isJunk = ki.isJunkSent || function () { return false; };
    var topicScore = ki.topicScore || function () { return 0; };
    var ctxText = contexts.join('\n');
    // drop generic question/intent words (理由・目的・種類…) from the content keys, so
    // the on-target gate requires a REAL topic term and not a word like 「理由」 that
    // matches unrelated docs (e.g. 特許「拒絶理由通知書」for 「軸受が必要な理由」).
    var GENERIC = /^(理由|原因|目的|役割|用途|機能|特徴|利点|欠点|長所|短所|種類|分類|方法|手順|違い|差|比較|意味|定義|必要|使い方|やり方|仕組み|働き|性質|メリット|デメリット|もの|こと|ため)$/;
    var keys = keyTerms(question).filter(function (k) { return !GENERIC.test(k); });
    // keyless queries (単語など): derive soft keys from the question's content runs.
    if (!keys.length) keys = (question.match(/[一-鿿ァ-ヶー]{2,}/g) || []).filter(function (k) { return !GENERIC.test(k); });
    var subj = keys[0] || '';
    var qv = EM ? EM.embed(question, 64) : null;
    // table/numeric junk from PDF extraction (e.g. 「系列Ⅰ系列Ⅱ」「4600MPa…4200MPa…」)
    function tableJunk(s) { return (s.match(/[Ⅰ-Ⅻ]/g) || []).length >= 2 || (s.match(/\d{3,}/g) || []).length >= 3 || /系列[Ⅰ-Ⅻ]/.test(s); }
    // clean, on-topic sentence pool from the retrieved context
    var seen = {}, cands = [];
    contexts.forEach(function (ct) {
      String(ct || '').split(/(?<=[。．！？\n])/).forEach(function (s) {
        s = s.replace(/[\s　]+/g, '').replace(/^[、，,]+/, '');
        if (s.length < 14 || s.length > 180 || seen[s] || isJunk(s)) return;
        seen[s] = 1; cands.push(s);
      });
    });
    if (!cands.length) return Promise.resolve('');
    function hasKey(s) { for (var i = 0; i < keys.length; i++) if (s.indexOf(keys[i]) >= 0) return true; return false; }
    function rel(s) { return ((qv && EM) ? EM.cosine(qv, EM.embed(s, 64)) : 0) + (hasKey(s) ? 0.5 : 0) + 0.5 * topicScore(s, keys); }
    function sig(s) { return s.match(/[一-鿿ァ-ヶーA-Za-z0-9]+/g) || []; }
    function clen(s) { return s.replace(/[^一-鿿ァ-ヶーA-Za-z0-9]/g, '').length; }
    function distinct(s, used) {     // adds new info: low content overlap with each existing fact
      var a = sig(s); if (!a.length) return false;
      for (var i = 0; i < used.length; i++) {
        if (used[i].indexOf(s.replace(/。$/, '')) >= 0 || s.indexOf(used[i].replace(/。$/, '')) >= 0) return false;
        var bset = {}; sig(used[i]).forEach(function (x) { bset[x] = 1; });
        var m = 0; a.forEach(function (x) { if (bset[x]) m++; });
        if (m / a.length >= 0.6) return false;
      }
      return true;
    }
    function pickTop(cueRe, exclude, n) {
      var base = cands.filter(function (s) { return s !== exclude; });
      // require the MAIN topic to appear in every fact (on-target); fall back to any key
      var pool = subj ? base.filter(function (s) { return s.indexOf(subj) >= 0; }) : [];
      if (!pool.length) pool = base.filter(function (s) { return !keys.length || hasKey(s); });
      return pool
        .map(function (s) {
          var ki0 = subj ? s.indexOf(subj) : -1;
          var frag = /^[ぁ-ん]{1,3}[はがをにでとへもや]/.test(s) || /^[ーぁ-ん]/.test(s);   // mid-word/chunk-cut fragment
          return { s: s, sc: rel(s) + (cueRe && cueRe.test(s) ? 0.8 : 0) + (ki0 >= 0 && ki0 <= 8 ? 0.35 : 0) - (frag ? 0.7 : 0) - (tableJunk(s) ? 0.8 : 0) - 0.004 * Math.max(0, s.length - 80) };
        })
        .sort(function (a, b) { return b.sc - a.sc; }).slice(0, n || 3);
    }
    var intent = classifyIntent(question);
    // 構造化が要る intent（種類/分類/列挙=list、手順=howto）は散文合成より、抽出側の
    // 番号付きリスト／手順の方が的確。生成は抑止して構造化抽出回答に委ねる。
    if (intent === 'list' || intent === 'howto') return Promise.resolve('');
    var primCue = GEN_CUE[intent] || GEN_CUE.definition;
    var primTop = pickTop(primCue, null, 3);
    if (!primTop.length) primTop = pickTop(null, null, 3);
    if (!primTop.length) return Promise.resolve('');
    // complementary aspect → richer, multi-faceted content (definition⇄purpose/feature)
    var compCue = (intent === 'definition') ? GEN_CUE.purpose : GEN_CUE.definition;

    var m = L.create(ctxText, { context: 3, dim: 24, hidden: 64, maxVocab: 600 });
    if (m.ids.length <= m.C + 4) return Promise.resolve('');
    var base = baseModel(); if (base) L.warmStart(m, base);
    return L.trainAsync(m, { steps: opts.steps || 400, chunk: 250, lr: 0.15, onProgress: opts.onProgress }).then(function () {
      function mscore(s) { var t = L.encode(m, s); return t.length ? L.seqLogProb(m, t) / t.length : -1e9; }
      // baby model picks the most fluent among the top on-target primary candidates
      var ranked = primTop.map(function (c) { return { s: c.s, sc: c.sc + 0.04 * mscore(c.s) }; })
        .sort(function (a, b) { return b.sc - a.sc; });
      // compress one source sentence to a concise, grammatical clause set on the topic
      function norm(x) { return G.normalize ? (G.normalize(x).text || x) : x; }
      // a usable fact must END on a finite predicate (no noun-stop / 連用中止 / 助詞止め)
      function finite(x) { return G.endsFinite ? G.endsFinite(x) : (!G.coherence || G.coherence(x).finite); }
      function condense(s, maxLen) {
        // strip leading punctuation/dots and stray connectives (avoids 「また、.…」「また、したがって」)
        s = s.replace(/^[、，,。．・.\s　]+/, '').replace(/^(また|さらに|したがって|なお|ただし|一方|つまり|すなわち|そして|そのため|よって)[、，,]?/, '');
        s = s.replace(/([一-鿿ァ-ヶーA-Za-zⅠ-Ⅻ0-9]{3,12}?)\1+/g, '$1');   // collapse repeated table/junk chunks
        s = s.replace(/系列[Ⅰ-Ⅻ]+/g, '').replace(/(?:[一-鿿ァ-ヶー]*\d{3,}\s?(?:MPa|mm|kg|°C)?){2,}/g, '');   // strip table/number runs
        if (s.length > maxLen) {
          var cl = s.split(/(?<=[、，])/), o = '';
          for (var i = 0; i < cl.length; i++) { if (o && (o + cl[i]).length > maxLen) break; o += cl[i]; }
          s = (o || s.slice(0, maxLen)).replace(/[、，]$/, '');
        }
        var out = norm(s.replace(/[。．！？]+$/, '') + '。');
        // guarantee a finite ending: drop trailing non-finite clauses (avoids
        // mid-sentence cuts like 「…静圧軸受に。」). If none works, reject the fact.
        if (!finite(out)) {
          var parts = out.replace(/[。．！？]+$/, '').split(/(?<=[、，])/);
          out = '';
          while (parts.length > 1) {
            parts.pop();
            var cand = norm(parts.join('').replace(/[、，]$/, '') + '。');
            if (finite(cand)) { out = cand; break; }
          }
        }
        return finite(out) ? out : '';
      }
      // primary fact: first top candidate that condenses to a clean finite sentence
      var primary = '', p1 = '';
      for (var pi = 0; pi < ranked.length; pi++) { var c = condense(ranked[pi].s, 115); if (c) { primary = ranked[pi].s; p1 = c; break; } }
      if (!p1) return '';
      // build a multi-fact answer: primary + complementary/extra distinct facts until
      // substantive (≥16 content chars) or 2 facts, for richer on-target content.
      var facts = [p1], used = [p1];
      var extra = pickTop(compCue, primary, 4).concat(pickTop(primCue, primary, 4)).concat(pickTop(null, primary, 6));
      for (var e = 0; e < extra.length; e++) {
        if (facts.length >= 2 && clen(facts.join('')) >= 24) break;
        var p2 = condense(extra[e].s, 100);
        if (!p2 || !distinct(p2, used)) continue;
        if (clen(facts.join('')) + clen(p2) > 130 || (facts.join('').length + p2.length) > 230) continue;
        facts.push(p2); used.push(p2);
      }
      var ans = facts.join('また、');
      // faithfulness: every content word must come from the retrieved context
      var runs = ans.match(/[一-鿿ァ-ヶー0-9A-Za-z]+/g) || [];
      if (!runs.length || !runs.every(function (t) { return ctxText.indexOf(t) >= 0; })) return '';
      // thin or fragment-leading → bail so the (often curated) extractive answer shows
      if (clen(ans) < 16 || /^[ーぁ-んァ-ヶ]/.test(ans)) return '';
      return ans;
    });
  }

  function groundedAnswer(question, contexts, opts) {
    var G = NSCode.grammar;
    // Structured intents (種類/分類/列挙=list, 手順=howto) are better served by the
    // extractive numbered list / steps — skip generation entirely so they show.
    var ki = (NSCode.askEngine && NSCode.askEngine._internal) || {};
    var intent = ki.classifyIntent ? ki.classifyIntent(question) : '';
    if (intent === 'list' || intent === 'howto') return Promise.resolve('');
    // When kuromoji is ready, generation is grammar-ruled grounded recombination only
    // (natural + on-target); if it can't build a good answer it returns '' and Ask
    // shows the extractive answer. The experimental free token decode is kept ONLY as
    // a legacy fallback for when kuromoji isn't loaded.
    if (G && G.ready && G.ready()) return recombine(question, contexts, opts);
    return debugAnswer(question, contexts, opts).then(function (r) {
        if (!r.text || r.text.length < 10) return '';           // too short → let caller fall back
        // coherence gate: reject token-salad so Ask falls back to the extractive answer.
        if (G && G.coherence && !G.coherence(r.text).ok) return '';
        return r.text;
      });
  }

  NSCode.sml = {
    groundedAnswer: groundedAnswer, debugAnswer: debugAnswer, recombine: recombine,
    _allowedSet: allowedSet, _decode: decode, FUNCTION_TOKENS: FUNCTION_TOKENS
  };
})(window.NSCode);

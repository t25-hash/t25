#!/usr/bin/env node
/* Verifies the in-house SML grounded (copy-constrained) generator against the
 * REAL engines + KB. The key correctness property is FAITHFULNESS: every emitted
 * token must come from the retrieved context or the function-word set — the model
 * cannot invent facts. Also checks it runs, is non-empty, and isn't a verbatim
 * copy of a single source sentence (i.e. it actually recombines = abstractive). */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

const localStore = {};
global.window = global;
global.localStorage = { getItem: (k) => (k in localStore ? localStore[k] : null), setItem: (k, v) => { localStore[k] = String(v); }, removeItem: (k) => { delete localStore[k]; } };
global.document = { createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {}, getElementById: () => null, querySelector: () => null };
global.location = { hash: '' };
global.addEventListener = function () {};
global.fetch = function (url) {
  const p = path.join(ROOT, url);
  return Promise.resolve({ ok: fs.existsSync(p), status: fs.existsSync(p) ? 200 : 404,
    json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf8'))),
    text: () => Promise.resolve(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '') });
};

const FILES = ['core.js', 'last-run.js', 'research-engine.js', 'rag-engine.js', 'embed-engine.js',
  'memory-engine.js', 'llm-engine.js', 'neural-engine.js', 'feedback-engine.js', 'sml-engine.js',
  'grammar-engine.js', 'ask-engine.js'];
for (const f of FILES) vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8'), { filename: f });
const N = global.NSCode, A = N.askEngine, S = N.sml, L = N.neuralLM, G = N.grammar;

let pass = 0, fail = 0;
function ok(name, cond) { (cond ? pass++ : fail++); console.log(`  ${cond ? 'OK ' : 'XX '} ${name}`); }

// content-words (kanji/katakana/alnum) of a string — used to assert grammar
// normalization is meaning-preserving (no facts dropped/invented).
function contentRuns(s) { return String(s || '').match(/[一-鿿ァ-ヶー0-9A-Za-z]+/g) || []; }
let normTotal = 0, normApplied = 0;   // how often clause normalization actually fired

const QS = process.argv.slice(2).length ? process.argv.slice(2) : ['機械とは何か', '歯車とは何ですか', '軸受の役割は'];

(async () => {
  for (const q of QS) {
    const a = await A.hybridAnswerKB(q, { store: 'kb', steps: 300 });
    const ctx = (a.hits || []).map((h) => h.chunk.text);
    if (!ctx.length) { ok(`[${q}] has retrieval context`, false); continue; }
    const r = await S.debugAnswer(q, ctx, { steps: 300 });
    console.log(`\nQ: ${q}\n   GEN: ${r.text}`);

    ok(`[${q}] non-empty generation`, !!r.text && r.text.length >= 10);

    // FAITHFULNESS: re-derive the allowed vocab (context ∪ function words) on a
    // model built the same way, and confirm every generated token is allowed.
    const m = L.create(ctx.join('\n'), { context: 3, dim: 24, hidden: 64, maxVocab: 600 });
    const allowed = S._allowedSet(m, ctx.join('\n'));
    const allowedStr = {}; Object.keys(allowed).forEach((id) => { allowedStr[m.vocab.itos[id]] = 1; });
    const ctxText = ctx.join('\n');
    const offSource = (r.tokens || []).filter((t) => t && !allowedStr[t] && ctxText.indexOf(t) < 0);
    ok(`[${q}] faithful: no invented tokens (${offSource.length} off-source)`, offSource.length === 0);

    // abstractive: not identical to a single verbatim source sentence
    const verbatim = ctxText.indexOf(r.text.replace(/。$/, '')) >= 0;
    ok(`[${q}] recombines (not a verbatim single span)`, !verbatim || r.text.length < 16);

    // Grammar Compiler Layer: run the generated answer through grammar.normalize
    // (the same path Ask uses for display) and verify it stays faithful.
    if (G && r.text) {
      const g = G.normalize(r.text);
      console.log(`   NORM: ${g.text}`);
      const clauses = (g.sentences || []).reduce((a, s) => a.concat(s.clauses || []), []);
      const appliedN = clauses.filter((c) => c.applied).length;
      normTotal += clauses.length; normApplied += appliedN;
      // meaning preserved: every content word of the generated text survives normalization
      const before = contentRuns(r.text).join('|'), afterRuns = contentRuns(g.text);
      const kept = contentRuns(r.text).every((t) => g.text.indexOf(t) >= 0);
      ok(`[${q}] grammar-normalize preserves content`, kept);
      // sanity: normalization never invents content words absent from the source answer
      const invented = afterRuns.filter((t) => before.indexOf(t) < 0);
      ok(`[${q}] grammar-normalize invents nothing (${invented.length})`, invented.length === 0);
      console.log(`   norm clauses applied: ${appliedN}/${clauses.length}`);
    }
  }
  if (normTotal) console.log(`\n[grammar] clause normalization fired on ${normApplied}/${normTotal} clauses (${(100 * normApplied / normTotal).toFixed(0)}%)`);
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

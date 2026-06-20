#!/usr/bin/env node
/* Verifies grammar-ruled grounded recombination (NSCode.sml.recombine + the
 * groundedAnswer path) against the REAL engines + KB + vendored kuromoji,
 * headless. The point: generation must be NATURAL (grammatical by construction),
 * GROUNDED (every content word from the retrieved context), and ABSTRACTIVE
 * (a recombined SML sentence, not necessarily a verbatim source span). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..'), VENDOR = path.join(ROOT, 'assets/vendor/kuromoji');
const store = {};
global.window = global;
global.localStorage = { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
global.document = { createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {}, getElementById: () => null, querySelector: () => null };
global.location = { hash: '' }; global.addEventListener = () => {};
global.XMLHttpRequest = function () { this.open = function (m, u) { this._url = u; }; this.responseType = ''; Object.defineProperty(this, 'response', { get: () => this._buf }); this.send = function () { try { let p = fs.existsSync(this._url) ? this._url : path.join(VENDOR, this._url.replace(/^.*\/dict\//, 'dict/')); const b = fs.readFileSync(p); this._buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); this.status = 200; if (this.onload) this.onload(); } catch (e) { this.status = 404; if (this.onerror) this.onerror(e); } }; };
global.fetch = u => { const p = path.join(ROOT, u); return Promise.resolve({ ok: fs.existsSync(p), status: fs.existsSync(p) ? 200 : 404, json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf8'))), text: () => Promise.resolve(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '') }); };
const F = ['core.js','last-run.js','research-engine.js','rag-engine.js','embed-engine.js','memory-engine.js','llm-engine.js','neural-engine.js','feedback-engine.js','sml-engine.js','grammar-engine.js','ask-engine.js'];
for (const f of F) vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8'), { filename: f });
const N = global.NSCode;
let pass = 0, fail = 0;
const ok = (n, c) => { (c ? pass++ : fail++); console.log(`  ${c ? 'OK ' : 'XX '} ${n}`); };
const runs = s => (String(s || '').match(/[一-鿿ァ-ヶー0-9A-Za-z]+/g) || []);

require(path.join(VENDOR, 'kuromoji.js')).builder({ dicPath: path.join(VENDOR, 'dict') }).build(async (err, tok) => {
  if (err) { console.error(err); process.exit(1); }
  N.grammar.setTokenizer(tok);
  const QS = process.argv.slice(2).length ? process.argv.slice(2) : ['歯車とは何ですか', '軸受の役割は', 'ねじの種類', '玉軸受とは何か'];
  for (const q of QS) {
    const a = await N.askEngine.hybridAnswerKB(q, { store: 'kb', steps: 300 });
    // mirror views/ask.js maybeGenerate: seed generation with curated content first
    const seeds = [];
    if (a.text) seeds.push(a.text);
    if (a.compose && a.compose.length) seeds.push(...a.compose);
    if (a.memo) seeds.push(a.memo);
    const ctx = seeds.concat((a.hits || []).map(h => h.chunk.text));
    if (!ctx.length) { ok(`[${q}] retrieval`, false); continue; }
    const gen = await N.sml.groundedAnswer(q, ctx, { steps: 300 });
    console.log(`\nQ: ${q}\n   GEN: ${gen || '<empty → extractive fallback>'}`);
    if (!gen) { console.log('   (no generation; extractive used)'); continue; }
    const ctxText = ctx.join('\n');
    ok(`[${q}] faithful (all content from context)`, runs(gen).every(t => ctxText.indexOf(t) >= 0));
    const ks = N.askEngine._internal.keyTerms(q) || [];
    ok(`[${q}] on-target (mentions a key term)`, ks.some(k => gen.indexOf(k) >= 0));
    ok(`[${q}] substantive (>=16 content chars)`, gen.replace(/[^一-鿿ァ-ヶーA-Za-z0-9]/g, '').length >= 16);
    const sentences = gen.split(/(?<=[。．！？])/).map(s => s.trim()).filter(Boolean);
    ok(`[${q}] every sentence grammatical (finite)`, sentences.every(s => N.grammar.endsFinite(s)));
  }
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail === 0 ? 0 : 1);
});

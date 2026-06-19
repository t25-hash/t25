#!/usr/bin/env node
/* Objective first-stage RETRIEVAL recall eval, grounded in the KB itself (no
 * hand-curated answer bank). For a sample of KB documents we form a query from
 * the document's own title (a topic phrase), run the real searchKB doc-selection,
 * and measure whether that document is retrieved — Recall@1/@5/@10 and MRR. This
 * is the standard way IR systems measure retrieval quality (known relevant doc),
 * and unlike ask-eval-hard it isn't saturated, so it can drive searchKB tuning.
 *
 * Usage: node scripts/ask-recall-eval.cjs [stride]   (default stride 23)
 */
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
  return Promise.resolve({ ok: fs.existsSync(p), status: fs.existsSync(p) ? 200 : 404, json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf8'))), text: () => Promise.resolve(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '') });
};
const FILES = ['core.js', 'last-run.js', 'research-engine.js', 'rag-engine.js', 'embed-engine.js', 'memory-engine.js', 'llm-engine.js', 'neural-engine.js', 'grammar-engine.js', 'ask-engine.js', 'calc-engine.js'];
for (const f of FILES) vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8'), { filename: f });
const NSCode = global.NSCode;

const STRIDE = +process.argv[2] || 23;

// a title makes a usable query if, after stripping the section number / English
// gloss / boilerplate, it still has a real topic noun. Generic section titles
// (はじめに/概要/緒言…) are skipped — they don't identify their doc.
const SKIP = /^(はじめに|まえがき|序論|緒言|概要|概説|総論|序|目的|背景|まとめ|おわりに|結言|参考文献|付録|記号)/;
function cleanTitle(t) {
  return String(t || '')
    .replace(/^[\d０-９]+([・.·][\d０-９]+)*\s*/, '')       // leading 4・1・3
    .replace(/[（(][^）)]*[）)]/g, '')                            // English gloss
    .replace(/\s+/g, '').trim();
}

(async () => {
  const index = await NSCode.askEngine.loadKB();
  const N = index.meta.length;
  let tried = 0, r1 = 0, r5 = 0, r10 = 0, mrr = 0;
  const misses = [];
  for (let i = 0; i < N; i += STRIDE) {
    const q = cleanTitle(index.meta[i]);
    if (!q || q.length < 3 || SKIP.test(q)) continue;
    tried++;
    const hits = NSCode.askEngine.searchKB(index, q, 10);
    let rank = -1;
    for (let r = 0; r < hits.length; r++) if (hits[r].idx === i) { rank = r; break; }
    if (rank === 0) r1++;
    if (rank >= 0 && rank < 5) r5++;
    if (rank >= 0 && rank < 10) r10++;
    if (rank >= 0) mrr += 1 / (rank + 1);
    else if (misses.length < 25) misses.push({ q, title: index.meta[i] });
  }
  const pct = (x) => (100 * x / tried).toFixed(1);
  console.log(`\nKB first-stage retrieval (title→doc), N=${tried} sampled (stride ${STRIDE} over ${N} docs)`);
  console.log(`  Recall@1 : ${pct(r1)}%`);
  console.log(`  Recall@5 : ${pct(r5)}%`);
  console.log(`  Recall@10: ${pct(r10)}%`);
  console.log(`  MRR@10   : ${(mrr / tried).toFixed(3)}`);
  if (misses.length) { console.log('\n  misses (query ⇐ title):'); misses.forEach((m) => console.log(`   · ${m.q}   ⇐  ${m.title}`)); }
  process.exit(0);
})();

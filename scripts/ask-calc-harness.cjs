#!/usr/bin/env node
/* Node harness that loads the REAL Ask engine and runs hybridAnswerKB against
 * the prebuilt 計算式・表 DB (assets/calc) — the separate store from the prose
 * KB. Verifies the index loads and the right chapters are retrieved for a
 * formula/quantity query. Formula docs are terse, so success = relevant hits
 * (not a fluent sentence). Shims window/document/fetch over fs. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const localStore = {};
global.window = global;
global.localStorage = {
  getItem: (k) => (k in localStore ? localStore[k] : null),
  setItem: (k, v) => { localStore[k] = String(v); },
  removeItem: (k) => { delete localStore[k]; }
};
global.document = {
  createElement: () => ({ style: {}, appendChild() {} }),
  head: { appendChild() {} }, body: { appendChild() {} },
  addEventListener() {}, getElementById: () => null, querySelector: () => null
};
global.location = { hash: '' };
global.addEventListener = function () {};
global.fetch = function (url) {
  const p = path.join(ROOT, url);
  return Promise.resolve({
    ok: fs.existsSync(p),
    status: fs.existsSync(p) ? 200 : 404,
    json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf8'))),
    text: () => Promise.resolve(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '')
  });
};

const FILES = [
  'core.js', 'last-run.js', 'research-engine.js', 'rag-engine.js',
  'embed-engine.js', 'memory-engine.js', 'llm-engine.js', 'neural-engine.js',
  'grammar-engine.js', 'ask-engine.js'
];
for (const f of FILES) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8'), { filename: f });
}
const NSCode = global.NSCode;

const QUESTIONS = process.argv.slice(2).length ? process.argv.slice(2) : [
  '理想気体の状態方程式',
  'PV = mRT',
  'ベルヌーイの式',
  'レイノルズ数',
  'はりのたわみ',
  '応力とひずみの関係',
  '熱伝導の式',
  'モーメントの式'
];

(async () => {
  const index = await NSCode.askEngine.loadKB('calc');
  console.log(`calc index: ${index.n} docs, ${Object.keys(index.post).length} terms`);
  let ok = 0;
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    try {
      const r = await NSCode.askEngine.hybridAnswerKB(q, { store: 'calc', steps: 300 });
      const hits = (r && r.hits) || [];
      const good = hits.length > 0;
      if (good) ok++;
      console.log(`\n[${i + 1}] Q: ${q}`);
      console.log(`    hits=${hits.length} top=${hits[0] ? hits[0].chunk.source : '-'} cos=${hits[0] ? hits[0].score.toFixed(3) : '-'}`);
      if (r && r.text) console.log(`    A: ${r.text.slice(0, 120)}`);
    } catch (e) {
      console.log(`\n[${i + 1}] Q: ${q}\n    ERROR: ${e.message}`);
    }
  }
  console.log(`\n==== ${ok}/${QUESTIONS.length} retrieved ====`);
  process.exit(ok === QUESTIONS.length ? 0 : 1);
})();

#!/usr/bin/env node
/* Node harness that loads the REAL Ask engine modules and runs hybridAnswerKB
 * against the prebuilt KB (assets/kb). Used to verify KB answers end-to-end
 * outside the browser. Shims window/document/localStorage/fetch over fs. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

// ---- browser shims ----
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
// fetch over local filesystem (index.json + docs/*.md)
global.fetch = function (url) {
  const p = path.join(ROOT, url);
  return Promise.resolve({
    ok: fs.existsSync(p),
    status: fs.existsSync(p) ? 200 : 404,
    json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf8'))),
    text: () => Promise.resolve(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '')
  });
};

// ---- load engine modules in index.html order ----
const FILES = [
  'core.js', 'last-run.js', 'research-engine.js', 'rag-engine.js',
  'embed-engine.js', 'memory-engine.js', 'llm-engine.js', 'neural-engine.js',
  'grammar-engine.js', 'ask-engine.js', 'calc-engine.js'
];
for (const f of FILES) {
  const code = fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8');
  vm.runInThisContext(code, { filename: f });
}

const NSCode = global.NSCode;

const QUESTIONS = process.argv.slice(2).length ? process.argv.slice(2) : [
  // baseline mix (regression: must keep answering)
  '歯車とは何ですか',
  '軸受の種類を教えてください',
  '機械とは何か',
  '材料力学とはどういうものですか',
  'ねじの役割は何ですか',
  '疲労破壊はなぜ起こるのですか',
  '潤滑の目的は何ですか',
  '応力集中とは',
  'ばねの特徴を教えて',
  '熱処理の方法にはどんなものがありますか',
  // intent-drift regressions (non-list intents that used to wander off-topic)
  '熱伝達率とは',
  '熱伝達率はなぜ重要か',
  '熱伝達率の特徴',
  'すべり軸受と転がり軸受の違い'
];

(async () => {
  let ok = 0;
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    try {
      const r = await NSCode.askEngine.hybridAnswerKB(q, { steps: 600 });
      const text = (r && r.text || '').trim();
      const good = text.length >= 12 && !r.weak;
      if (good) ok++;
      console.log(`\n[${i + 1}] Q: ${q}`);
      console.log(`    intent=${r ? r.intent : 'null'} weak=${r ? r.weak : '-'} source=${r ? r.source : '-'}`);
      console.log(`    A: ${text || '(EMPTY)'}`);
    } catch (e) {
      console.log(`\n[${i + 1}] Q: ${q}\n    ERROR: ${e.message}`);
    }
  }
  console.log(`\n==== ${ok}/${QUESTIONS.length} answered ====`);
  process.exit(ok === QUESTIONS.length ? 0 : 1);
})();

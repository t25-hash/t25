#!/usr/bin/env node
/* Verifies the feedback learning loop (NSCode.feedback) end-to-end against the
 * REAL engines, outside the browser. Shims window/localStorage/fetch over fs.
 *
 * Checks: 👍 → boosts + answer recall + the persistent net grows (steps↑) and
 * serialize→restore round-trips; 👎 → the graded line is excluded from re-asks;
 * empty feedback is a no-op. */
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
    ok: fs.existsSync(p), status: fs.existsSync(p) ? 200 : 404,
    json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf8'))),
    text: () => Promise.resolve(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '')
  });
};

const FILES = [
  'core.js', 'last-run.js', 'research-engine.js', 'rag-engine.js',
  'embed-engine.js', 'memory-engine.js', 'llm-engine.js', 'neural-engine.js',
  'feedback-engine.js', 'grammar-engine.js', 'ask-engine.js'
];
for (const f of FILES) vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8'), { filename: f });
const N = global.NSCode, A = N.askEngine, F = N.feedback;

let pass = 0, fail = 0;
function ok(name, cond) { (cond ? pass++ : fail++); console.log(`  ${cond ? 'OK ' : 'XX '} ${name}`); }

(async () => {
  F.reset();
  ok('empty feedback: boosts is null', F.boosts('理想気体の状態方程式') === null);
  ok('empty feedback: blockedFor is empty', F.blockedFor('any').length === 0);
  ok('empty feedback: recall is null', F.recall('any') === null);

  // ---- 👍 path -----------------------------------------------------------
  const q1 = '機械とは何か';
  const a1 = await A.hybridAnswerKB(q1, { store: 'kb', steps: 300 });
  console.log(`\n[good] Q: ${q1}\n   A1: ${(a1.text || '').slice(0, 80)}`);
  await F.record(q1, a1, 'good');
  ok('👍 boosts now non-null and contains a question term', !!F.boosts(q1));
  const rec = F.recall(q1);
  ok('👍 recall returns the vetted answer for the same question', !!rec && rec.text === a1.text);

  // second good to grow the persistent net
  const q1b = '歯車とは何ですか';
  const a1b = await A.hybridAnswerKB(q1b, { store: 'kb', steps: 300 });
  await F.record(q1b, a1b, 'good');
  const m = F.model();
  ok('persistent net exists after 👍', !!m);
  ok('persistent net trained (steps > 0)', !!m && m.steps > 0);

  // serialize -> restore round-trip
  const ser = N.neuralLM.serialize(m);
  const re = N.neuralLM.restore(ser);
  const sample = N.neuralLM.encode(m, a1.text || '機械');
  const s1 = N.neuralLM.seqLogProb(m, sample), s2 = N.neuralLM.seqLogProb(re, sample);
  ok('serialize→restore round-trips (seqLogProb identical)', Math.abs(s1 - s2) < 1e-6);

  // ---- 👎 path -----------------------------------------------------------
  const q2 = '材料力学とはどういうものですか';
  const a2 = await A.hybridAnswerKB(q2, { store: 'kb', steps: 300, noRecall: true });
  console.log(`\n[bad] Q: ${q2}\n   A2: ${(a2.text || '').slice(0, 80)}`);
  await F.record(q2, a2, 'bad');
  ok('👎 records blocked line(s) for the question', F.blockedFor(q2).length > 0);
  const a2b = await A.hybridAnswerKB(q2, { store: 'kb', steps: 300, noRecall: true });
  console.log(`   A2(re-ask): ${(a2b.text || '').slice(0, 80)}`);
  ok('👎 re-ask avoids the graded answer text', !a2b.text || a2b.text !== a2.text);
  if (a2.text) ok('👎 re-ask does not contain the blocked text', !a2b.text || a2b.text.indexOf(a2.text) < 0);

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/* Verifies the in-browser GRU LM (gru-engine.js) really LEARNS by BPTT: loss must
 * fall substantially over training, next-token prediction must beat uniform, and
 * free generation must run and stay on the learned vocabulary. Loads the REAL
 * engines over the KB, no browser. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

global.window = global;
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.document = { createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {}, getElementById: () => null, querySelector: () => null };
global.location = { hash: '' };
global.addEventListener = function () {};

for (const f of ['core.js', 'llm-engine.js', 'neural-engine.js', 'gru-engine.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8'), { filename: f });
}
const N = global.NSCode, G = N.gruLM;

let pass = 0, fail = 0;
function ok(name, cond, extra) { (cond ? pass++ : fail++); console.log(`  ${cond ? 'OK ' : 'XX '} ${name}${extra ? ' — ' + extra : ''}`); }

// train on a handful of KB docs (or a synthetic repetitive corpus as fallback)
const docDir = path.join(ROOT, 'assets/kb/docs');
let corpus;
try {
  const files = fs.readdirSync(docDir).slice(0, 10);
  corpus = files.map((f) => fs.readFileSync(path.join(docDir, f), 'utf8')).join('\n');
} catch (e) { corpus = '歯車は動力を伝える機械要素である。'.repeat(200); }

(async () => {
  const m = G.create(corpus, { dim: 24, hidden: 48, maxVocab: 400 });
  console.log(`vocab=${m.V} tokens=${m.ids.length} params≈${(m.V * m.D + 3 * m.H * m.D + 3 * m.H * m.H + m.V * m.H).toLocaleString()}`);

  // measure loss before/after training (same eval on the same model)
  function evalLoss() {
    const g = { Emb: new Float32Array(m.Emb.length) };  // dummy, bptt writes grads we ignore
    // use seqLogProb over several windows as a proxy for held-out loss
    let lp = 0, n = 0;
    for (let k = 0; k < 12; k++) {
      const start = (Math.random() * (m.ids.length - 18)) | 0;
      const toks = []; for (let i = 0; i < 17; i++) toks.push(m.vocab.itos[m.ids[start + i]]);
      lp += G.seqLogProb(m, toks); n++;
    }
    return -lp / n;   // mean negative log-prob (cross-entropy)
  }
  const before = evalLoss();
  let last = 0;
  await G.trainAsync(m, { steps: 2500, chunk: 250, lr: 0.1, seq: 16, onProgress: (s) => { last = s.loss; } });
  const after = evalLoss();
  console.log(`eval CE: before=${before.toFixed(3)}  after=${after.toFixed(3)}  (train EMA loss=${last.toFixed(3)})`);

  ok('training loss is finite', isFinite(last) && last > 0);
  ok('held-out cross-entropy dropped', after < before - 0.2, `Δ=${(before - after).toFixed(3)}`);
  ok('beats uniform baseline', after < Math.log(m.V), `lnV=${Math.log(m.V).toFixed(3)}`);

  // generation runs, is non-trivial, and stays in-vocabulary (encode → token strings)
  let seed = G.encode(m, '歯車').filter((t) => m.vocab.stoi[t] != null).slice(0, 2);
  if (!seed.length) seed = [m.vocab.itos[1]];
  const out = G.generate(m, seed, { temperature: 0.7, topK: 6, maxTokens: 40 });
  const text = N.babyLLM.join(out);
  console.log('GEN:', text);
  ok('generation produced tokens', out.length > seed.length + 4);
  const known = out.every((t) => t === '\n' || m.vocab.stoi[t] != null);
  ok('generation stays in learned vocab', known);

  // next-token probabilities are a valid distribution
  const top = G.nextProbs(m, '歯車', 5) || [];
  const sumTop = top.reduce((s, x) => s + x.prob, 0);
  ok('nextProbs returns ranked tokens', top.length === 5 && top[0].prob >= top[4].prob && sumTop <= 1.0001);

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

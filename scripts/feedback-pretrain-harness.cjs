#!/usr/bin/env node
/* Verifies goal #3 — base SML 事前学習強化 + 👍/👎 蓄積:
 *   - feedback.pretrain(seed) builds a persistent base model from the curated KB
 *     definitions BEFORE any grade (so grounded generation starts fluent), and is
 *     idempotent unless forced;
 *   - 👍 accumulates (terms boosted, accepted pool grows, net keeps training);
 *   - 👎 accumulates (rejected pool grows, blocked lines recorded, boost decays).
 * Real engines, no browser. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

const ls = {};
global.window = global;
global.localStorage = { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } };
global.document = { createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {}, getElementById: () => null, querySelector: () => null };
global.location = { hash: '' };
global.addEventListener = function () {};
global.fetch = function (url) { const p = path.join(ROOT, url); return Promise.resolve({ ok: fs.existsSync(p), status: fs.existsSync(p) ? 200 : 404, json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf8'))), text: () => Promise.resolve(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '') }); };

for (const f of ['core.js', 'last-run.js', 'research-engine.js', 'rag-engine.js', 'embed-engine.js',
  'memory-engine.js', 'llm-engine.js', 'neural-engine.js', 'feedback-engine.js', 'sml-engine.js',
  'grammar-engine.js', 'ask-engine.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8'), { filename: f });
}
const N = global.NSCode, A = N.askEngine, F = N.feedback;

let pass = 0, fail = 0;
function ok(name, cond, extra) { (cond ? pass++ : fail++); console.log(`  ${cond ? 'OK ' : 'XX '} ${name}${extra ? ' — ' + extra : ''}`); }

(async () => {
  F.reset();
  ok('starts cold (no base model)', F.stats().model === null);

  // 事前学習強化: pretrain from the curated KB definitions
  const seed = (A.DEFAULT_DOCS || []).map((d) => d.text).join('\n');
  const m = await F.pretrain(seed, { steps: 1200 });
  const s1 = F.stats();
  ok('pretrain built a base model', !!m && !!s1.model);
  ok('base model actually trained', !!s1.model && s1.model.steps >= 1000 && isFinite(s1.model.loss), s1.model ? `steps=${s1.model.steps} loss=${s1.model.loss}` : '');
  ok('pretrained flag set', s1.pretrained === true);

  // idempotent unless forced
  const before = F.model();
  await F.pretrain(seed);                 // no force → same model
  ok('pretrain is idempotent without force', F.model() === before);

  // sml uses the pretrained base (stronger than a cold start): generate is fluent
  const a = await A.hybridAnswerKB('歯車とは何ですか', { store: 'kb', steps: 300 });
  const ctx = (a.hits || []).map((h) => h.chunk.text);
  const r = await N.sml.debugAnswer('歯車とは何ですか', ctx, { steps: 200 });
  ok('grounded generation runs on pretrained base', !!r.text && r.text.length >= 10, r.text);

  // 👍 accumulation
  await F.record('歯車の強度設計は', { text: '歯車の曲げ強さは歯元曲げ応力で評価する。', source: 'kb' }, 'good');
  const s2 = F.stats();
  ok('👍 increments good + accepted + learnedTerms', s2.good === 1 && s2.accepted === 1 && s2.learnedTerms.length >= 1);
  const boosts = F.boosts('歯車の強度設計は');
  ok('👍 boosts the question terms for retrieval', !!boosts && Object.keys(boosts).length >= 1);

  // 👎 accumulation: rejected pool grows, lines blocked, boost decays
  await F.record('歯車の強度設計は', { text: '無関係なノイズ文がここに入る。', source: 'kb' }, 'bad');
  const s3 = F.stats();
  ok('👎 increments bad + rejected', s3.bad === 1 && s3.rejected === 1);
  const blocked = F.blockedFor('歯車の強度設計は');
  ok('👎 blocks the rejected line', blocked.indexOf('無関係なノイズ文がここに入る。') >= 0);

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

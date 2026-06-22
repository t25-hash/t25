#!/usr/bin/env node
/* keyTerms extraction guard — locks in the fix for the "junk-key hijack" bug class.
 * A topic noun glued to a suffix (歯車同士 / 鋼自体 / 軸以上 / 応力程度), a leading
 * quantifier (全歯車 / 各軸受), an internal case particle (ねじがうまく / ねじにおける),
 * or scaffolding words (場合 / 一覧 / 注意点 / 同士 / 以上 …) must NOT survive as a key,
 * otherwise the suffix gram hijacks retrieval toward unrelated docs (the「同士」→
 * 微粒子同士=固相合成反応 bug). Each case asserts: (a) the real topic IS a key, and
 * (b) NO key contains a banned suffix/particle/scaffolding token.
 * Usage: node scripts/keyterms-test.cjs */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const ls = {};
global.window = global;
global.localStorage = { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: () => {} };
global.document = { createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {}, getElementById: () => null, querySelector: () => null };
global.location = { hash: '' };
global.addEventListener = function () {};
global.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
for (const f of ['core.js', 'last-run.js', 'research-engine.js', 'rag-engine.js', 'embed-engine.js', 'memory-engine.js', 'llm-engine.js', 'neural-engine.js', 'grammar-engine.js', 'ask-engine.js', 'calc-engine.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8'), { filename: f });
}
const IN = global.NSCode.askEngine._internal;

// a key is junk if it contains a suffix/scaffolding/particle token that is never a topic
const BAN = /同士|どうし|同様|自体|自身|全体|以上|以下|以外|以内|程度|前後|双方|両者|場合|一覧|注意点|などの?|における|について|うまく|^[各全両諸](?=[一-鿿]{2})|^[のがをにへでと]/;

// { q, topic: a string each answer-key set MUST contain (substring match) }
const CASES = [
  { q: '歯車同士の噛み合いが悪い原因', topic: '歯車' },
  { q: '軸同士の関係', topic: '軸' },
  { q: '鋼同士の関係', topic: '鋼' },
  { q: '弁自体の問題', topic: '弁' },
  { q: '鋼自体の特性', topic: '鋼' },
  { q: '歯車全体の構造', topic: '歯車' },
  { q: '軸受以上の強度', topic: '軸受' },
  { q: '応力程度の精度', topic: '応力' },
  { q: '材料の場合の対策', topic: '材料' },
  { q: '全歯車の一覧', topic: '歯車' },
  { q: '各軸受の特徴', topic: '軸受' },
  { q: '各種の鋼', topic: '鋼' },
  { q: 'ねじがうまく動かない理由', topic: 'ねじ' },
  { q: 'ねじにおける課題', topic: 'ねじ' },
  { q: 'ねじなどの種類', topic: 'ねじ' },
  { q: '歯車のかみ合いが悪い原因', topic: '歯車' },
  // regressions that must stay intact (reading-kana / coordinated / compounds)
  { q: 'はめあいとは', topic: 'はめあい' },
  { q: 'すきまばめとしまりばめの違い', topic: 'すきまばめ' },
  { q: 'はすば歯車の特徴', topic: '歯車' },
  { q: '全長の測定', topic: '全長' },      // 全長 is a real word — leading 全 must NOT be stripped
  { q: '主軸の設計', topic: '主軸' }
];

let pass = 0; const fails = [];
CASES.forEach((c) => {
  const keys = IN.keyTerms(c.q);
  const hasTopic = keys.some((k) => k.indexOf(c.topic) >= 0 || c.topic.indexOf(k) >= 0);
  const junk = keys.filter((k) => BAN.test(k) && k !== c.topic);
  const ok = hasTopic && junk.length === 0;
  if (ok) pass++; else fails.push({ q: c.q, keys, hasTopic, junk });
});
fails.forEach((f) => console.log('✗ ' + f.q + '  => ' + JSON.stringify(f.keys) + (f.junk.length ? '  junk:' + JSON.stringify(f.junk) : '  (topic missing)')));
console.log('\n==== KEYTERMS GUARD: ' + pass + ' / ' + CASES.length + ' ====');
process.exit(pass === CASES.length ? 0 : 1);

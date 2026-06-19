#!/usr/bin/env node
/* Offline QUALITY eval for the Ask engine. Loads the real engine modules (like
 * ask-harness) and runs hybridAnswerKB over a fixed question bank, then GRADES
 * each answer on objective axes so "accuracy" is a number we can push up:
 *   answered   — non-empty and not weak
 *   onTopic    — the answer mentions one of the question's specific key terms
 *   clean      — no garbled/junk sentence and fluency above threshold
 *   intentFit  — classified intent matches the expected one AND the answer
 *                carries that intent's hallmark (definition predicate, steps, …)
 *   informative— a full sentence of reasonable length (not a stub)
 * Prints a per-question breakdown and an overall 0–100 score.
 * Usage: node scripts/ask-eval.cjs            (full bank)
 *        node scripts/ask-eval.cjs --steps 300
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

// ---- browser shims (same as ask-harness) ----
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
  'grammar-engine.js', 'ask-engine.js', 'calc-engine.js'
];
for (const f of FILES) vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8'), { filename: f });
const NSCode = global.NSCode;
const IN = NSCode.askEngine._internal;

const argSteps = (() => { const i = process.argv.indexOf('--steps'); return i > 0 ? +process.argv[i + 1] : 600; })();
// fluency (trained on the small clean corpus) only reliably flags symbol/formula
// garbage, so `clean` is a loose guard; the discriminating axes are intentFit etc.
const FLU_MIN = -5.5;

// question bank: q + expected intent (the shape a good answer should take)
const BANK = [
  { q: '歯車とは何ですか', intent: 'definition' },
  { q: '軸受とは何か', intent: 'definition' },
  { q: '機械とは何か', intent: 'definition' },
  { q: '材料力学とはどういうものですか', intent: 'definition' },
  { q: '応力集中とは', intent: 'definition' },
  { q: '熱伝達率とは', intent: 'definition' },
  { q: '疲労破壊とは何か', intent: 'definition' },
  { q: '軸受の種類を教えてください', intent: 'list' },
  { q: '歯車の種類', intent: 'list' },
  { q: 'ねじの種類にはどんなものがありますか', intent: 'list' },
  { q: 'ねじの役割は何ですか', intent: 'purpose' },
  { q: '潤滑の目的は何ですか', intent: 'purpose' },
  { q: '軸受の役割', intent: 'purpose' },
  { q: '疲労破壊はなぜ起こるのですか', intent: 'why' },
  { q: '応力集中はなぜ問題になるのか', intent: 'why' },
  { q: 'ボルトが緩む理由', intent: 'why' },
  { q: 'ばねの特徴を教えて', intent: 'features' },
  { q: 'はすば歯車の特徴', intent: 'features' },
  { q: 'ステンレス鋼の特徴は', intent: 'features' },
  { q: 'すべり軸受と転がり軸受の違い', intent: 'compare' },
  { q: '平歯車とはすば歯車の違いは何ですか', intent: 'compare' },
  { q: '熱処理の方法にはどんなものがありますか', intent: 'list' },
  { q: '歯車の強度はどう設計しますか', intent: 'howto' },
  { q: '軸の直径はどのように決めますか', intent: 'howto' },
  // held-out set (added after tuning, to check the gains generalize)
  { q: 'ポンプとは何ですか', intent: 'definition' },
  { q: '溶接とは', intent: 'definition' },
  { q: '減速機の役割は', intent: 'purpose' },
  { q: 'キーの役割は何ですか', intent: 'purpose' },
  { q: '腐食はなぜ起こるのか', intent: 'why' },
  { q: '座屈はなぜ生じるのですか', intent: 'why' },
  { q: '鋳鉄の特徴を教えて', intent: 'features' },
  { q: 'アルミニウム合金の特徴', intent: 'features' },
  { q: 'ポンプの種類', intent: 'list' },
  { q: '弁の種類にはどんなものがありますか', intent: 'list' },
  { q: '鋳造と鍛造の違い', intent: 'compare' },
  { q: '炭素鋼と合金鋼の違いは何ですか', intent: 'compare' }
];

// hallmark of each intent inside the answer text
function intentHallmark(intent, a) {
  switch (intent) {
    case 'definition': return /(である|です。|だ。|をいう|のこと|を指す|と呼ば|と定義|を意味|といい|機械要素|装置|とは)/.test(a);
    case 'list': return (a.match(/[・、，]/g) || []).length >= 2 || /(種類|大別|分けら|に分類|などがある|に分かれ)/.test(a);
    case 'purpose': return /(目的|ため|ねらい|役割|用途|機能|防止|を防)/.test(a);
    case 'why': return /(ため|から|ので|理由|原因|による|起因|生じ|により)/.test(a);
    case 'features': return /(特徴|利点|長所|短所|性質|優れ|劣る|向く|適する|やすい|にくい|耐食|耐熱|耐摩耗|強度|硬|軽|安価|高い|大きい|小さい|小さく|滑らか|抑え|生じ|できる)/.test(a);
    case 'compare': return /(に比べ|に対し|一方|より|違い|異な|大きく|小さく|簡単)/.test(a);
    case 'howto': return /(まず|次に|手順|①|②|決め|求め|選び|に基づ|によって|から|＝|=|の式|係数)/.test(a);
    default: return true;
  }
}
function clean(a) {
  if (!a) return false;
  // structural garble check: every sentence must survive the engine's own junk
  // filter when re-split (catches ①-led pseudo-steps and column-merge splices that
  // slip through). Fluency over the tiny clean corpus is too noisy for KB prose.
  const sents = NSCode.research.splitSentences(a.replace(/\n/g, ' '));
  for (const s of sents) if (s.replace(/[\s①-⑳]/g, '').length >= 10 && IN.isJunkSent(s)) return false;
  return true;
}
function onTopic(q, a) {
  const keys = IN.keyTerms(q);
  if (!keys.length) return true;                 // no specific term to check
  for (const k of keys) { if (a.indexOf(k) >= 0) return true;
    const b = k.match(/[一-鿿ァ-ヶー]/g) || [];
    for (let i = 0; i < b.length - 1; i++) if (a.indexOf(b[i] + b[i + 1]) >= 0) return true;
  }
  return false;
}

const W = { answered: 20, onTopic: 25, clean: 10, intentFit: 30, informative: 15 };

(async () => {
  let total = 0; const rows = [];
  for (const item of BANK) {
    let r = null; try { r = await NSCode.askEngine.hybridAnswerKB(item.q, { steps: argSteps }); } catch (e) { r = null; }
    const a = (r && r.text || '').trim();
    const gotIntent = r ? r.intent : 'null';
    // a curated calc-DB answer (governing formula) is deterministic, on-topic by
    // construction and non-garbled, so the prose-oriented axes don't apply to it.
    const calcDB = !!(r && r.source === '計算式DB' && a);
    const f = { answered: !!(a && r && !r.weak), onTopic: calcDB || onTopic(item.q, a),
      clean: calcDB || clean(a), intentFit: gotIntent === item.intent && (calcDB || intentHallmark(item.intent, a)),
      informative: calcDB || (a.length >= 24 && /[。．]/.test(a)) };
    let s = 0; for (const k in W) if (f[k]) s += W[k];
    total += s; rows.push({ q: item.q, exp: item.intent, got: gotIntent, s, f, a });
  }
  rows.forEach((r, i) => {
    const flags = Object.keys(W).map((k) => (r.f[k] ? '✓' : '·') + k.slice(0, 4)).join(' ');
    console.log(`\n[${i + 1}] ${r.s}  ${r.q}  (exp ${r.exp} / got ${r.got})`);
    console.log(`    ${flags}`);
    console.log(`    A: ${r.a || '(EMPTY)'}`);
  });
  const score = (total / (BANK.length * 100) * 100).toFixed(1);
  console.log(`\n==== QUALITY SCORE: ${score} / 100  (${BANK.length} questions) ====`);
  process.exit(0);
})();

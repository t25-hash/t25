#!/usr/bin/env node
/* LIST-answer quality eval. The 種類/分類 enumeration builder (listEnumerate in
 * ask-engine) extracts compound-noun type names from handbook prose with a regex.
 * That regex can cut a word mid-token, leaving fragments a human (or a Haiku-class
 * model) would never emit:
 *   - small-kana lead:        「ィフューザポンプ」  (truncated ディフューザ)
 *   - hiragana-glued katakana:「つシャトル弁」       (spliced 「つ」 before シャトル)
 *   - suffix-subsumed:        「巻ポンプ」 ⊂ 「渦巻ポンプ」 (already listed, longer)
 * The grading evals score 100 yet never penalise these. This harness enumerates a
 * bank of list questions, splits the 「…の主な種類：A・B・…」 items, and counts the
 * fragments — a number we can drive to zero. Usage: node scripts/list-quality-eval.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

const VENDOR = path.join(ROOT, 'assets/vendor/kuromoji');
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
// shim XMLHttpRequest over the local dict so the SAME vendored kuromoji loads headless
global.XMLHttpRequest = function () {
  this.open = function (m, u) { this._url = u; }; this.responseType = '';
  Object.defineProperty(this, 'response', { get: () => this._buf });
  this.send = function () {
    try {
      const p = fs.existsSync(this._url) ? this._url : path.join(VENDOR, this._url.replace(/^.*\/dict\//, 'dict/'));
      const b = fs.readFileSync(p);
      this._buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      this.status = 200; if (this.onload) this.onload();
    } catch (e) { this.status = 404; if (this.onerror) this.onerror(e); }
  };
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
  'grammar-engine.js', 'ask-engine.js', 'calc-engine.js'
];
for (const f of FILES) vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8'), { filename: f });
const NSCode = global.NSCode;

const BANK = [
  'ポンプの種類', '弁の種類にはどんなものがありますか', '軸受の種類を教えてください',
  '歯車の種類', 'ねじの種類にはどんなものがありますか', '鋼の種類', '鋳鉄の種類',
  '軸の種類', 'ばねの種類', '継手の種類', '溶接の種類', '潤滑剤の種類',
  '熱処理の方法にはどんなものがありますか', 'クラッチの種類', 'ブレーキの種類',
  'カムの種類', 'チェーンの種類', 'ベルトの種類', '管継手の種類', 'モータの種類'
];

// --- fragment detector (kuromoji-accurate) ---------------------------------
// A clean TYPE name is small-kana-free AND, morphologically, a noun compound with
// no spliced clause material: no 助動詞, no case/binding 助詞, no leading filler/verb
// before the noun head. (Suffix-subsumption is NOT used — 炭素鋼⊂低炭素鋼, 玉軸受⊂
// 深溝玉軸受 etc. are legitimate distinct types, not fragments.)
const SMALL_KANA = /^[ァィゥェォャュョッ・ー]/;
const CASE_P = { 'は':1,'が':1,'を':1,'に':1,'へ':1,'と':1,'から':1,'より':1,'まで':1,'だけ':1 };
const FILLER = ['例えば','たとえば','いわゆる','主に','おもに','特に','一般に','通常','単に','なお'];
let TOK = null;
const nounish = (t) => t.pos === '名詞' || t.pos === '接頭詞' || (t.pos === '記号' && /[A-Za-z0-9ー・]/.test(t.surface_form));
// A FRAGMENT = a spliced clause glued onto a real type name. Detected by the same
// prefix-based rule the engine uses: small-kana truncation lead, a leading textbook
// filler, or a case/binding 助詞 / 助動詞 / 1-char-hiragana 動詞 sitting in the prefix
// BEFORE the trailing noun-run (so 焼なまし / はすば歯車 — own morphology — are NOT flagged).
function isFragment(it) {
  if (SMALL_KANA.test(it)) return true;
  if (!TOK) return /^[ぁ-ん]{1,2}[ァ-ヶ]{2,}/.test(it);     // no morphology: glued-katakana only
  let tk; try { tk = TOK.tokenize(it); } catch (e) { return false; }
  if (!tk.length) return false;
  if (FILLER.indexOf(tk[0].surface_form) >= 0) return true;
  let k = tk.length - 1; while (k >= 0 && nounish(tk[k])) k--;
  const rs = k + 1; if (rs === 0 || rs === tk.length) return false;   // all-noun, or trailing own-morphology
  const prefix = tk.slice(0, rs);
  return prefix.some((t) => t.pos === '助動詞' || (t.pos === '助詞' && CASE_P[t.surface_form]))
    || (prefix[0].pos === '動詞' && prefix[0].surface_form.length === 1);
}

async function run() {
  let totalItems = 0, totalFrag = 0, listed = 0;
  const rows = [];
  for (const q of BANK) {
    let r = null; try { r = await NSCode.askEngine.hybridAnswerKB(q, { steps: 1 }); } catch (e) { r = null; }
    const a = (r && r.text || '').trim();
    const m = a.match(/種類[：:]\s*(.+?)。?$/);
    if (!m) { rows.push({ q, items: [], frags: [], note: a ? '(non-list answer)' : '(empty)' }); continue; }
    listed++;
    const items = m[1].split(/[・,，、]/).map((s) => s.trim()).filter(Boolean);
    const frags = items.filter(isFragment);
    totalItems += items.length; totalFrag += frags.length;
    rows.push({ q, items, frags });
  }
  rows.forEach((r) => {
    console.log(`\n■ ${r.q}`);
    if (r.note) { console.log(`    ${r.note}`); return; }
    console.log(`    items: ${r.items.join('・')}`);
    if (r.frags.length) console.log(`    ⚠ FRAGMENTS(${r.frags.length}): ${r.frags.join(' / ')}`);
  });
  console.log(`\n==== LIST QUALITY [${TOK ? 'kuromoji' : 'no-morphology'}]: ${totalFrag} fragment(s) across ${totalItems} items in ${listed} lists ====`);
  process.exit(0);
}

if (process.argv.indexOf('--no-kuromoji') >= 0) {
  run();
} else {
  const kuromoji = require(path.join(VENDOR, 'kuromoji.js'));
  kuromoji.builder({ dicPath: path.join(VENDOR, 'dict') }).build((err, tok) => {
    if (err) { console.error('kuromoji build failed:', err); process.exit(1); }
    TOK = tok;
    NSCode.grammar.setTokenizer(tok);   // engine now takes the kuromoji clean-up path (as in the browser)
    run();
  });
}

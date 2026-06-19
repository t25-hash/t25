#!/usr/bin/env node
/* Verifies the kuromoji-powered grammar agent against the REAL vendored engine
 * + dictionary, fully headless. We shim XMLHttpRequest over the local dict files
 * so the SAME browser build (assets/vendor/kuromoji/kuromoji.js) that ships to
 * users is what runs here. Checks:
 *   - kuromoji loads and tokenizes,
 *   - normalize() stays FAITHFUL (every content word survives, nothing invented),
 *   - finite clauses get normalized while connective (連用中止/て形) clauses are
 *     left intact (we must never "finish" a mid-sentence clause),
 *   - politeness normalization works (plain ⇄ polite) when requested. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'assets/vendor/kuromoji');

// --- minimal browser shims so the vendored build + our engines load headless ---
global.window = global;
global.document = { createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {}, getElementById: () => null, querySelector: () => null };
global.XMLHttpRequest = function () {
  this.open = function (m, url) { this._url = url; };
  this.responseType = '';
  Object.defineProperty(this, 'response', { get: () => this._buf });
  this.send = function () {
    try {
      let p = fs.existsSync(this._url) ? this._url : path.join(VENDOR, this._url.replace(/^.*\/dict\//, 'dict/'));
      const b = fs.readFileSync(p);
      this._buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      this.status = 200; if (this.onload) this.onload();
    } catch (e) { this.status = 404; if (this.onerror) this.onerror(e); }
  };
};

// load core + grammar engine (window.NSCode)
for (const f of ['core.js', 'grammar-engine.js']) vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8'), { filename: f });
const G = global.NSCode.grammar;

let pass = 0, fail = 0;
function ok(name, cond, extra) { (cond ? pass++ : fail++); console.log(`  ${cond ? 'OK ' : 'XX '} ${name}${extra ? '  ' + extra : ''}`); }
function contentRuns(s) { return String(s || '').match(/[一-鿿ァ-ヶー0-9A-Za-z]+/g) || []; }
function faithful(orig, made) {
  const after = contentRuns(made).join('|');
  const kept = contentRuns(orig).every((t) => after.indexOf(t) >= 0);
  const before = contentRuns(orig).join('|');
  const invented = contentRuns(made).filter((t) => before.indexOf(t) < 0);
  return { kept, invented };
}

const kuromoji = require(path.join(VENDOR, 'kuromoji.js'));
kuromoji.builder({ dicPath: path.join(VENDOR, 'dict') }).build(function (err, tok) {
  if (err) { console.error('kuromoji build failed:', err); process.exit(1); }
  G.setTokenizer(tok);
  ok('kuromoji tokenizer ready', G.ready());

  // 1) finite simple clauses should normalize and stay faithful
  const finite = [
    '私は本を読む。',
    '学生が問題を解いた。',
    '歯車は動力を伝える。'
  ];
  finite.forEach((s) => {
    const r = G.normalize(s);
    const f = faithful(s, r.text);
    ok(`finite faithful: ${s} → ${r.text}`, f.kept && f.invented.length === 0);
    const applied = (r.sentences[0].clauses || []).some((c) => c.applied);
    ok(`finite normalized (applied): ${s}`, applied);
  });

  // 2) connective (連用中止 / て形) clauses must be left intact — never "finished"
  const connective = ['本を読み、', '学校へ行って', '速く走り'];
  connective.forEach((s) => {
    const sml = G.toSMLk(s.replace(/[、，]$/, ''));
    ok(`connective not recompiled (toSMLk null): 「${s}」`, sml === null);
  });

  // 3) complex multi-clause text stays faithful end-to-end (no content lost/invented)
  const complex = '軸受は回転する軸を支え、摩擦を減らす機械要素である。';
  const rc = G.normalize(complex);
  const fc = faithful(complex, rc.text);
  ok(`complex faithful: ${rc.text}`, fc.kept && fc.invented.length === 0);

  // 4) politeness normalization (plain → polite) when requested, still faithful
  const rp = G.normalize('私は本を読む。', { politeness: 'polite' });
  ok(`plain→polite applied: 私は本を読む。 → ${rp.text}`, /ます。?$/.test(rp.text));
  ok('plain→polite faithful', faithful('私は本を読む', rp.text).kept);

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail === 0 ? 0 : 1);
});

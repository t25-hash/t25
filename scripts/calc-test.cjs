#!/usr/bin/env node
/* Unit tests for the 計算式・表 registry (assets/js/calc-engine.js): the JS hook
 * that the Ask view uses to 連投 formulas/tables after a KB answer. Verifies the
 * trigger matching, the result structure (式名＋式＋記号説明 / 表のヘッダ・行),
 * the ranking/caps, and that non-trigger questions return nothing. No DOM needed. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

global.NSCode = {};
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js/calc-engine.js'), 'utf8'), { filename: 'calc-engine.js' });
const calc = global.NSCode.calc;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }

// 1) registry data integrity
calc.FORMULAS.forEach((f) => {
  ok(f.id && f.name && f.expr, `formula ${f.id} has id/name/expr`);
  ok(Array.isArray(f.where) && f.where.length >= 1, `formula ${f.id} has symbol list`);
  ok(f.where.every((w) => w.sym && w.desc), `formula ${f.id} symbols have sym+desc`);
  ok(Array.isArray(f.terms) && f.terms.length >= 1, `formula ${f.id} has trigger terms`);
});
calc.TABLES.forEach((t) => {
  ok(t.id && t.name && Array.isArray(t.headers) && t.headers.length >= 2, `table ${t.id} has headers`);
  ok(Array.isArray(t.rows) && t.rows.length >= 1, `table ${t.id} has rows`);
  ok(t.rows.every((r) => r.length === t.headers.length), `table ${t.id} rows match header width`);
  ok(Array.isArray(t.terms) && t.terms.length >= 1, `table ${t.id} has trigger terms`);
});

// 2) trigger questions hit the expected formula/table (and structure is usable)
const cases = [
  { q: '歯車の強度はどう設計しますか', formula: 'lewis' },
  { q: '軸受の寿命はどう計算しますか', formula: 'l10' },
  { q: '熱伝達率とは', formula: 'newton' },
  { q: '座屈はなぜ生じるのですか', formula: 'euler' },
  { q: 'ボルトの締付けトルクは', formula: 'bolt' },
  { q: 'ばね定数の求め方', formula: 'spring' },
  { q: 'はめあいの種類', table: 'fit' },
  { q: '炭素鋼と合金鋼の違いは何ですか', table: 'carbon-steel' },
  { q: '歯車の種類', table: 'gear-type' },
  { q: '安全率の目安は', table: 'safety-factor' }
];
cases.forEach((c) => {
  const r = calc.lookup(c.q);
  if (c.formula) {
    ok(r.formulas.some((f) => f.id === c.formula), `「${c.q}」→ formula ${c.formula}`);
    const f = r.formulas.find((x) => x.id === c.formula);
    if (f) ok(f.name && f.expr && f.where.length, `「${c.q}」formula complete (名/式/記号)`);
  }
  if (c.table) {
    ok(r.tables.some((t) => t.id === c.table), `「${c.q}」→ table ${c.table}`);
  }
});

// 3) ranking: the most specific formula ranks first
ok(calc.lookup('歯車の強度').formulas[0].id === 'lewis', 'specific formula ranks first (歯車+強度→ルイス)');

// 4) caps respected
const big = calc.lookup('歯車 軸受 ばね 応力 安全率 はめあい 炭素鋼', { maxFormulas: 3, maxTables: 2 });
ok(big.formulas.length <= 3, 'maxFormulas cap respected');
ok(big.tables.length <= 2, 'maxTables cap respected');

// 5) non-trigger questions return nothing
['こんにちは', '今日の天気は？', ''].forEach((q) => {
  const r = calc.lookup(q);
  ok(r.formulas.length === 0 && r.tables.length === 0, `non-trigger「${q}」→ empty`);
});
ok(calc.has('熱伝達率とは') === true && calc.has('こんにちは') === false, 'has() flags trigger vs non-trigger');

console.log(`\n==== calc-test: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);

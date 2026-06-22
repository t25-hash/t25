/* calc-compute-eval — NSCode.calc.compute(式の数値計算)の検証。
 * 教科書的な入力→既知の出力を assert。単位換算(mm/MPa/kN)・0除算/未入力ガードも確認。
 * 完了基準: 全ケース pass。 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js/calc-engine.js'), 'utf8'), { filename: 'calc-engine.js' });
const calc = global.NSCode.calc;

function approx(a, b, tol) { return isFinite(a) && Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(b)); }

// [id, inputs, 期待値(outUnit), 許容相対誤差]
const CASES = [
  ['tensile', { P: { value: 1000, unit: 'N' }, A: { value: 0.01, unit: 'm2' } }, 1e5],
  ['tensile', { P: { value: 1, unit: 'kN' }, A: { value: 100, unit: 'mm2' } }, 1e7],            // 単位換算
  ['hooke', { E: { value: 2e11, unit: 'Pa' }, 'ε': { value: 0.001, unit: '-' } }, 2e8],
  ['bending', { M: { value: 100, unit: 'N·m' }, Z: { value: 1e-6, unit: 'm3' } }, 1e8],
  ['torsion', { T: { value: 50, unit: 'N·m' }, Z_p: { value: 1e-6, unit: 'm3' } }, 5e7],
  ['euler', { E: { value: 2e11, unit: 'Pa' }, I: { value: 1e-8, unit: 'm4' }, l_k: { value: 1, unit: 'm' } }, Math.PI * Math.PI * 2e11 * 1e-8],
  ['l10', { C: { value: 30000, unit: 'N' }, P: { value: 3000, unit: 'N' }, p: { value: 3, unit: '-' } }, 1000],
  ['newton', { h: { value: 50, unit: 'W/(m²·K)' }, A: { value: 2, unit: 'm2' }, 'ΔT': { value: 10, unit: 'K' } }, 1000],
  ['fourier', { 'λ': { value: 50, unit: 'W/(m·K)' }, A: { value: 2, unit: 'm2' }, 'ΔT': { value: 10, unit: 'K' }, L: { value: 0.1, unit: 'm' } }, 10000],
  ['module', { d: { value: 60, unit: 'mm' }, z: { value: 20, unit: '-' } }, 3],
  ['lewis', { F_t: { value: 1000, unit: 'N' }, b: { value: 20, unit: 'mm' }, m: { value: 2, unit: 'mm' }, Y: { value: 0.4, unit: '-' } }, 62.5],   // MPa
  ['bolt', { K: { value: 0.2, unit: '-' }, d: { value: 0.012, unit: 'm' }, F: { value: 10000, unit: 'N' } }, 24],
  ['spring', { G: { value: 79000, unit: 'MPa' }, d: { value: 2, unit: 'mm' }, D: { value: 20, unit: 'mm' }, n: { value: 10, unit: '-' } }, 79000 * 16 / (8 * 8000 * 10)],
  ['safety', { 'σ_s': { value: 240, unit: 'MPa' }, S: { value: 3, unit: '-' } }, 8e7]
];

let pass = 0; const fails = [];
CASES.forEach(function (c) {
  const r = calc.compute(c[0], c[1]);
  if (r.ok && approx(r.value, c[2], 1e-4)) pass++;
  else fails.push(c[0] + ' => ' + (r.ok ? (r.value + ' ' + r.unit + ' (期待 ' + c[2] + ')') : ('NG:' + r.why)));
});

// ガード: 0除算と未入力は ok:false であること
const guards = [
  ['tensile', { P: { value: 1000, unit: 'N' }, A: { value: 0, unit: 'm2' } }],   // 0除算
  ['tensile', { P: { value: 1000, unit: 'N' } }]                                  // 未入力 A
];
let gpass = 0; const gfail = [];
guards.forEach(function (g) { const r = calc.compute(g[0], g[1]); if (!r.ok) gpass++; else gfail.push(g[0] + ' は ok:false 期待だが ' + r.value); });

console.log('=== calc-compute-eval ===');
fails.forEach(function (m) { console.log('  ✗ ' + m); });
gfail.forEach(function (m) { console.log('  ✗ guard: ' + m); });
const total = CASES.length + guards.length, ok = pass + gpass;
console.log('==== CALC COMPUTE SCORE: ' + ok + ' / ' + total + ' ====');
process.exit(ok === total ? 0 : 1);

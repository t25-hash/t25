/* calc-lookup-eval — JS式・表検索(NSCode.calc.lookup)の精度評価。
 * 各クエリに期待結果を与え、lookup の該当カテゴリ先頭が一致するか採点する。
 *   cat:'formula'|'table' → そのカテゴリ先頭が id と一致すること
 *   cat:'none'           → 式・表とも何も返さないこと（generic語による誤検出の抑止）
 * 完了基準: 全ケース正解。 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js/calc-engine.js'), 'utf8'), { filename: 'calc-engine.js' });
const calc = global.NSCode.calc;

const CASES = [
  // --- 式: 素直な正例 ---
  { q: '引張応力の求め方を教えて', cat: 'formula', id: 'tensile' },
  { q: 'フックの法則とは', cat: 'formula', id: 'hooke' },
  { q: 'はりの曲げ応力の計算', cat: 'formula', id: 'bending' },
  { q: '軸のねじり応力', cat: 'formula', id: 'torsion' },
  { q: 'オイラーの座屈荷重とは', cat: 'formula', id: 'euler' },
  { q: '転がり軸受の寿命計算', cat: 'formula', id: 'l10' },
  { q: '対流熱伝達の式', cat: 'formula', id: 'newton' },
  { q: '熱伝導のフーリエの法則', cat: 'formula', id: 'fourier' },
  { q: '歯車のモジュールとは', cat: 'formula', id: 'module' },
  { q: 'ルイスの式による歯元曲げ応力', cat: 'formula', id: 'lewis' },
  { q: 'ボルトの締付けトルク', cat: 'formula', id: 'bolt' },
  { q: 'コイルばねのばね定数', cat: 'formula', id: 'spring' },
  { q: '許容応力と安全率の関係', cat: 'formula', id: 'safety' },
  // --- 表: 素直な正例 ---
  { q: 'はめあいの種類を教えて', cat: 'table', id: 'fit' },
  { q: '炭素鋼の機械的性質', cat: 'table', id: 'carbon-steel' },
  { q: '歯車の種類と軸配置', cat: 'table', id: 'gear-type' },
  { q: '安全率の目安を知りたい', cat: 'table', id: 'safety-factor' },
  // --- 曖昧解消: generic語に引っ張られず specific が勝つ ---
  { q: '縦弾性係数とひずみの関係式', cat: 'formula', id: 'hooke' },
  { q: '断面係数から曲げ応力を計算したい', cat: 'formula', id: 'bending' },
  { q: 'トルクからせん断応力を求める', cat: 'formula', id: 'torsion' },
  { q: '歯数と基準円直径からモジュールを求める', cat: 'formula', id: 'module' },
  { q: '圧入するときのはめあい', cat: 'table', id: 'fit' },
  { q: '降伏点をもとにした安全率', cat: 'formula', id: 'safety' },
  { q: 'ベアリングの基本定格寿命', cat: 'formula', id: 'l10' },
  // --- 言い換えの正例: 同義・別表記でも recall できる ---
  { q: 'ヤング率の定義を知りたい', cat: 'formula', id: 'hooke' },
  { q: '玉軸受の基本定格寿命', cat: 'formula', id: 'l10' },
  { q: '梁のたわみ量を求める', cat: 'formula', id: 'bending' },
  { q: '熱伝達率を上げたい', cat: 'formula', id: 'newton' },
  { q: 'ねじの締結方法', cat: 'formula', id: 'bolt' },
  { q: '鋼材の引張強さ一覧', cat: 'table', id: 'carbon-steel' },
  // --- ネガティブ: generic語のみでは誤検出させない ---
  { q: '軸とは何か', cat: 'none' },
  { q: '材料について教えて', cat: 'none' },
  { q: '種類を一覧で', cat: 'none' },
  { q: '応力とは', cat: 'none' },
  { q: '荷重の意味', cat: 'none' },
  { q: '強度とは何か', cat: 'none' },
  // --- ネガティブ(高度): 短いtermが別語に埋もれる substring 誤検出を抑止 ---
  { q: '円柱の体積を求める', cat: 'none' },      // 柱→euler を抑止
  { q: '支柱の設計', cat: 'none' },              // 柱→euler
  { q: '角柱の断面', cat: 'none' },              // 柱→euler
  { q: 'やはり強度が大事だ', cat: 'none' },      // はり→bending を抑止
  { q: '橋梁の点検', cat: 'none' },              // 梁→bending
  { q: 'ねじれ角の計算', cat: 'none' }           // ねじ→bolt を抑止
];

let pass = 0; const fails = [];
CASES.forEach(function (c, i) {
  const r = calc.lookup(c.q);
  let ok, got;
  if (c.cat === 'none') {
    got = '[f:' + r.formulas.map(function (e) { return e.id; }).join(',') + '][t:' + r.tables.map(function (e) { return e.id; }).join(',') + ']';
    ok = r.formulas.length === 0 && r.tables.length === 0;
  } else {
    const list = c.cat === 'formula' ? r.formulas : r.tables;
    got = list.map(function (e) { return e.id; }).join(',') || '(なし)';
    ok = list[0] && list[0].id === c.id;
  }
  if (ok) pass++; else fails.push({ i: i + 1, q: c.q, want: (c.cat === 'none' ? '(なし)' : c.id), got: got });
});

console.log('=== calc-lookup-eval ===');
fails.forEach(function (f) { console.log('  ✗ #' + f.i + ' ' + f.q + '  期待:' + f.want + ' / 実際:' + f.got); });
console.log('==== CALC LOOKUP SCORE: ' + pass + ' / ' + CASES.length + ' ====');
process.exit(pass === CASES.length ? 0 : 1);

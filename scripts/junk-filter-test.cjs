/* junk-filter-test — isJunkSent の正当文/ノイズ判定を固定する回帰テスト。
 * 過去に誤検出した「するため」「ところで/もちろん/やはり」始まり等を恒久ガードしつつ、
 * 真のPDF崩れ・断片は引き続き棄却することを保証する。 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
global.window = global;
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.document = { createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} } };
global.location = { hash: '' }; global.addEventListener = () => {};
global.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
for (const f of ['core.js', 'embed-engine.js', 'rag-engine.js', 'neural-engine.js', 'gru-engine.js', 'grammar-engine.js', 'ask-engine.js']) {
  try { vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8'), { filename: f }); } catch (e) {}
}
const J = global.NSCode.askEngine._internal.isJunkSent;

// [文, 期待(true=ノイズとして棄却 / false=正当文として通す)]
const CASES = [
  // 正当文（誤検出してはいけない）
  ['安全率を設けるのは、荷重のばらつきに備えて余裕を確保するためです。', false],
  ['応力集中を緩和するために、すみ肉を丸めて曲率半径を大きくする。', false],
  ['潤滑油を選ぶためには、粘度・使用温度・荷重条件を考慮する必要がある。', false],
  ['ところで軸受の寿命は荷重と回転数から見積もることができる。', false],
  ['もちろん安全率は荷重条件に応じて適切に設定する必要がある。', false],
  ['やはり強度設計では応力集中の緩和が重要な要素となる。', false],
  ['歯車は、回転によって動力を伝える代表的な機械要素である。', false],
  // ノイズ/断片（必ず棄却）
  ['これは実現させるたを並べた異常な断片であり破棄すべき対象である。', true],
  ['を支える軸受は荷重方向に応じて選定する必要がある断片。', true],
  ['図3・41 応力集中部の形状と曲率半径の関係', true],
  ['(1) (2) (3) 値 値 値 系列', true]
];

let pass = 0; const fails = [];
CASES.forEach(function (c) {
  const got = J(c[0]);
  if (got === c[1]) pass++; else fails.push((c[1] ? '棄却すべきだが通過' : '通すべきだが棄却') + ': ' + c[0].slice(0, 30));
});
console.log('=== junk-filter-test ===');
fails.forEach(function (m) { console.log('  ✗ ' + m); });
console.log('==== JUNK FILTER SCORE: ' + pass + ' / ' + CASES.length + ' ====');
process.exit(pass === CASES.length ? 0 : 1);

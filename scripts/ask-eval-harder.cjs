/* ask-eval-harder — 飽和した hard/ask-eval の先を測るための難問プローブ。
 * 言い換え・口語・否定・複合・意味ギャップを含む質問に対し、回答が期待語(いずれか)を
 * 含むかをスコア化する（gate ではなく数値報告。既知の難ケースを可視化して将来の的にする）。
 * 使い方: node scripts/ask-eval-harder.cjs */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
global.window = global;
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.document = { createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} } };
global.location = { hash: '' }; global.addEventListener = () => {};
global.fetch = (u) => { const p = path.join(ROOT, u); return Promise.resolve({ ok: fs.existsSync(p), json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf8'))), text: () => Promise.resolve(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '') }); };
for (const f of ['core.js', 'last-run.js', 'research-engine.js', 'rag-engine.js', 'embed-engine.js', 'memory-engine.js', 'llm-engine.js', 'neural-engine.js', 'grammar-engine.js', 'ask-engine.js', 'calc-engine.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8'), { filename: f });
}
const A = global.NSCode.askEngine;
const argSteps = (() => { const i = process.argv.indexOf('--steps'); return i > 0 ? +process.argv[i + 1] : 400; })();

// [質問, 期待語(いずれかを回答が含めば正解)]
const BANK = [
  ['ヤング率って何', ['弾性', '応力', 'ひずみ', '比例', '縦弾性']],
  ['金属を硬くする処理は', ['焼入れ', '熱処理', '硬', '焼き']],
  ['ねじが緩まないようにするには', ['緩み', 'ロック', 'ナット', '座金', '止め']],
  ['歯車がかみ合う条件', ['モジュール', '圧力角', 'かみ合い', 'かみ合う']],
  ['はめあいで締め代があるのは', ['しまりばめ', '締め代']],
  ['軸受が焼き付く原因', ['潤滑', '油膜', '発熱', '焼']],
  ['応力とひずみの関係', ['フック', '比例', '弾性', 'ヤング']],
  ['材料が疲労で壊れるのはなぜ', ['繰り返し', '応力', '疲労', 'き裂']],
  ['ステンレスが錆びにくい理由', ['不動態', 'クロム', '酸化', '耐食']],
  ['ボルトの強度区分とは', ['強度区分', '引張', 'ボルト']],
  ['潤滑の目的は', ['摩擦', '摩耗', '低減', '潤滑']],
  ['減速比はどう決まる', ['歯数', '減速', '比']],
  ['焼きなましとは何か', ['焼なまし', '軟', '加熱', '除去']],
  ['クリープとは', ['高温', '時間', '変形', 'クリープ']],
  ['座屈はどういう現象', ['座屈', '圧縮', '細長', '不安定']]
];

(async () => {
  let pass = 0; const fails = [];
  for (const [q, exp] of BANK) {
    let a = null; try { a = await A.hybridAnswerKB(q, { steps: argSteps }); } catch (e) {}
    const t = (a && (a.normalized || a.text)) || '';
    if (t && exp.some((e) => t.indexOf(e) >= 0)) pass++; else fails.push(q + '  => ' + (t ? t.slice(0, 36) : '(空)'));
  }
  console.log('=== ask-eval-harder (言い換え/口語/意味ギャップ) ===');
  fails.forEach((m) => console.log('  ✗ ' + m));
  console.log('==== HARDER SCORE: ' + pass + ' / ' + BANK.length + ' ====');
})();

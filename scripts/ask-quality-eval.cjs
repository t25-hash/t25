/* ask-quality-eval — 赤ちゃんモデルの回答「可読性/完結性」を数値化する品質評価。
 * Haiku 的な読みやすさの代理指標: 各回答が (1)非空・十分長い (2)自己完結(後方参照で始まらない)
 * (3)崩れていない(高JP率・括弧均衡・数式/表断片でない) (4)文末が終止、を満たすかを採点する。
 * gate ではなくスコア報告。使い方: node scripts/ask-quality-eval.cjs */
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
const A = global.NSCode.askEngine, G = global.NSCode.grammar;
const argSteps = (() => { const i = process.argv.indexOf('--steps'); return i > 0 ? +process.argv[i + 1] : 250; })();

// よく聞かれる機械工学の概念（広め）。回答の「読みやすさ」を採点する。
const QS = [
  '歯車とは何ですか', '軸受とは', 'ねじとは', 'ばねとは', '軸とは', 'カムとは', 'リンク機構とは',
  '焼入れとは', '焼戻しとは', '焼きなましとは何か', '熱処理とは', '浸炭とは',
  'フックの法則とは', '応力とは', 'ひずみとは', '応力集中とは', 'クリープとは', '疲労とは', '座屈とは', '安全率とは',
  '炭素鋼とは', '合金鋼とは', 'ステンレス鋼とは', '鋳鉄とは', 'アルミニウム合金とは', '黄銅とは', '青銅とは',
  '工作機械とは', '旋盤とは', '切削加工とは', '研削加工とは', '塑性加工とは', '溶接とは', '鋳造とは',
  '層流とは', '乱流とは', 'レイノルズ数とは', '圧力損失とは', '粘度とは', 'キャビテーションとは',
  'ポンプとは', '熱交換器とは', '熱力学とは', '熱効率とは', '比熱とは',
  '制御とは何か', 'センサとは', 'アクチュエータとは', 'トルクとは', '共振とは', '固有振動数とは',
  'モーメントとは', '公差とは', 'はめあいとは', '潤滑とは', '摩耗とは', '腐食とは', '減速機とは', '電動機とは', 'クラッチとは', 'ブレーキとは'
];

const DEICTIC = /^(?:これ|それ|その|この|あの|同じ|当該|前者|後者|上記|下記|前述|また[、，]|なお[、，]|一方[、，]|さらに|すなわち|σ|τ|式\(|図[0-9０-９]|表[0-9０-９])/;
function jpRatio(s) { return (s.match(/[一-鿿ぁ-ヶ゠-ヿ]/g) || []).length / Math.max(1, s.length); }
function quality(t) {
  if (!t) return { ok: false, why: '空' };
  const core = t.replace(/[\s①-⑳]/g, '');
  if (core.length < 20) return { ok: false, why: '短い' };
  if (DEICTIC.test(t)) return { ok: false, why: '後方参照/断片で開始' };
  if (jpRatio(t) < 0.5) return { ok: false, why: '低JP率' };
  if (((t.match(/[（(]/g) || []).length) !== ((t.match(/[）)]/g) || []).length)) return { ok: false, why: '括弧不均衡' };
  if (/[＝∫∑Σ∏√]/.test(t.slice(0, 30))) return { ok: false, why: '数式断片' };
  if (!/(。|である|です。|だ。|をいう|た。|る。)/.test(t.slice(-12))) return { ok: false, why: '非終止' };
  return { ok: true };
}

(async () => {
  let pass = 0; const fails = [];
  for (const q of QS) {
    let a = null; try { a = await A.hybridAnswerKB(q, { steps: argSteps }); } catch (e) {}
    let t = (a && (a.normalized || a.text)) || '';
    if (G && G.tidy) t = G.tidy(t);
    const r = quality(t);
    if (r.ok) pass++; else fails.push('✗ ' + q + ' [' + r.why + '] ' + t.replace(/\n/g, ' ').slice(0, 44));
  }
  console.log('=== ask-quality-eval (可読性/完結性) ===');
  fails.forEach((m) => console.log('  ' + m));
  console.log('==== QUALITY READABILITY: ' + pass + ' / ' + QS.length + ' (' + (100 * pass / QS.length).toFixed(1) + '%) ====');
})();

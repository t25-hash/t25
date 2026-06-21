#!/usr/bin/env node
/* HARD retrieval-stress eval for the Ask engine. The default ask-eval bank is
 * saturated (~99/100), so it can't show whether a retrieval change helps. This
 * bank targets the cases where RETRIEVAL (not generation) decides correctness:
 *   - single-kanji category nouns (鋼/弁/軸/梁 の種類)
 *   - synonyms / readings (ギヤ=歯車, ベアリング=軸受)
 *   - paraphrased intents (〜について / 〜とはどんなもの)
 *   - multi-key questions (歯車の強度, 軸受の潤滑)
 *   - polysemy traps (基礎/供給 — generic words that hijack lexical match)
 * Grades the same objective axes as ask-eval. Supports A/B of the retriever:
 *   AB=bm25   (default) — BM25 chunk retrieval
 *   AB=cosine            — force the old TF-IDF cosine path (strip opts.bm25)
 * Usage: node scripts/ask-eval-hard.cjs [--steps 200]
 *        AB=cosine node scripts/ask-eval-hard.cjs --steps 200
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

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

// A/B: force the cosine path by stripping opts.bm25 before retrieve runs
const AB = process.env.AB || 'bm25';
if (AB === 'cosine') {
  const orig = NSCode.rag.retrieve;
  NSCode.rag.retrieve = function (q, c, o) { o = Object.assign({}, o); delete o.bm25; return orig(q, c, o); };
}
const argSteps = (() => { const i = process.argv.indexOf('--steps'); return i > 0 ? +process.argv[i + 1] : 200; })();

// q + expected intent + (optional) expectTerm: a string the answer SHOULD contain
// to be considered to have retrieved the right material (retrieval-precision check).
const BANK = [
  { q: '鋼の種類を挙げよ', intent: 'list', expect: ['炭素鋼', '合金鋼', 'ステンレス鋼', '工具鋼', '高速度鋼'] },
  { q: '鋼の種類', intent: 'list', expect: ['炭素鋼', '合金鋼', 'ステンレス鋼', '工具鋼'] },
  { q: '弁の種類にはどんなものがありますか', intent: 'list', expect: ['弁'] },
  { q: '軸受にはどんな種類がありますか', intent: 'list', expect: ['軸受'] },
  { q: 'ギヤの種類', intent: 'list', expect: ['歯車', 'ギヤ'] },
  { q: 'ベアリングの種類', intent: 'list', expect: ['軸受', 'ベアリング'] },
  { q: '歯車にはどんな種類があるか', intent: 'list', expect: ['歯車'] },
  { q: '機械要素にはどんなものがあるか', intent: 'list', expect: ['軸', '歯車', '軸受', 'ねじ', 'ばね'] },
  // paraphrased definitions
  { q: '歯車について説明してください', intent: 'definition', expect: ['歯車'] },
  { q: '軸受とはどんなものですか', intent: 'definition', expect: ['軸受'] },
  { q: '応力集中について教えて', intent: 'definition', expect: ['応力集中', '応力'] },
  { q: 'ステンレス鋼ってなに', intent: 'definition', expect: ['ステンレス', '耐食'] },
  { q: '焼入れとはどういう処理か', intent: 'definition', expect: ['焼入れ', '硬'] },
  // multi-key / compound topic
  { q: '歯車の強度設計について', intent: 'default', expect: ['歯車', '強度', '曲げ', '面圧', 'ピッチング'] },
  { q: '軸受の潤滑はどうする', intent: 'default', expect: ['軸受', '潤滑', '油膜', '油'] },
  { q: '転がり軸受の寿命', intent: 'default', expect: ['寿命', '軸受', '剥離', 'フレーキング', 'L10'] },
  { q: 'ボルトの緩み止めの方法', intent: 'howto', expect: ['緩み', 'ゆるみ', 'ロック', 'ダブルナット', '座金', 'トルク'] },
  // why / purpose paraphrases
  { q: 'なぜ疲労破壊は起きるのか', intent: 'why', expect: ['疲労', '繰り返し', '応力'] },
  { q: 'はめあいは何のためにある', intent: 'purpose', expect: ['はめあい', 'すきま', '締め'] },
  { q: '潤滑するのはなぜ', intent: 'why', expect: ['潤滑', '摩擦', '摩耗'] },
  // polysemy traps (generic words must not hijack)
  { q: '材料の基礎について', intent: 'default', expect: ['材料', '応力', '強度', 'ひずみ'] },
  { q: '軸の設計', intent: 'default', expect: ['軸', 'トルク', 'ねじり', '直径'] },
  // compare paraphrases
  { q: 'すべり軸受と転がり軸受はどう違う', intent: 'compare', expect: ['軸受'] },
  { q: '炭素鋼と合金鋼の違い', intent: 'compare', expect: ['炭素鋼', '合金鋼', '合金'] },
  // ---- extended bank (round 2): new vocabulary / question shapes ----
  { q: 'ステンレスの種類', intent: 'list', expect: ['ステンレス', 'オーステナイト', 'フェライト', 'マルテンサイト', '鋼'] },
  { q: 'ばねの種類', intent: 'list', expect: ['ばね', 'コイル', '板ばね', '皿ばね'] },
  { q: 'モジュールとは', intent: 'definition', expect: ['モジュール', '歯', 'm'] },
  { q: '安全率とは何か', intent: 'definition', expect: ['安全率', '応力', '比'] },
  { q: 'クリープとは', intent: 'definition', expect: ['クリープ', '高温', 'ひずみ', '時間'] },
  { q: '焼入れと焼戻しの違い', intent: 'compare', expect: ['焼入れ', '焼戻し', '焼戻', '硬', '粘'] },
  { q: 'カムの役割は', intent: 'purpose', expect: ['カム', '運動', '従動'] },
  { q: 'ベアリングはなぜ壊れるのか', intent: 'why', expect: ['軸受', '疲労', '剥離', 'フレーキング', '寿命'] },
  { q: '歯車の歯が折れるのはなぜ', intent: 'why', expect: ['歯', '曲げ', '疲労', '折損', '応力'] },
  { q: '潤滑油の役割', intent: 'purpose', expect: ['潤滑', '摩擦', '摩耗', '油'] },
  { q: 'すきまばめとしまりばめの違い', intent: 'compare', expect: ['すきま', '締め', 'しまり', 'はめあい'] },
  { q: '減速機とは何か', intent: 'definition', expect: ['減速', '歯車', 'トルク', '回転'] },
  { q: '応力とひずみの関係', intent: 'default', expect: ['応力', 'ひずみ', '比例', 'フック', '弾性'] },
  { q: 'ねじとボルトの違いは', intent: 'compare', expect: ['ねじ', 'ボルト', '締結'] },
  { q: '溶接の種類', intent: 'list', expect: ['溶接', 'アーク', 'ガス', '抵抗', 'スポット'] },
  // ---- extended bank (round 3): acronyms / multi-hop / spec / casual ----
  { q: '歯車が騒音を出すのはなぜ', intent: 'why', expect: ['歯車', '騒音', 'かみ合い', '振動', '歯'] },
  { q: '軸が折れる原因は', intent: 'why', expect: ['軸', '応力', '疲労', '集中', 'ねじり'] },
  { q: 'GD&Tとは', intent: 'definition', expect: ['幾何公差', '公差', '形状', '位置'] },
  { q: 'BOMとは何か', intent: 'definition', expect: ['部品表', 'BOM', '部品'] },
  { q: 'CAEとは', intent: 'definition', expect: ['解析', 'CAE'] },
  { q: '歯車のかみ合い率とは', intent: 'definition', expect: ['かみ合い', '歯', '率'] },
  { q: 'ねじの呼び径とは', intent: 'definition', expect: ['ねじ', '径'] },
  { q: '熱処理にはどんな種類があるか', intent: 'list', expect: ['焼入れ', '焼戻し', '焼なまし', '焼ならし', '浸炭'] },
  { q: 'なぜ安全率を設けるのか', intent: 'why', expect: ['安全率', '不確', '余裕', 'ばらつき', '安全'] },
  { q: 'ばね定数とは何か', intent: 'definition', expect: ['ばね', '定数', '荷重', '変形'] },
  { q: '潤滑油はどう選ぶ', intent: 'howto', expect: ['潤滑', '粘度', '油', '荷重', '速度'] },
  { q: '応力集中を防ぐには', intent: 'howto', expect: ['応力集中', 'フィレット', '丸', 'すみ肉', '緩和'] }
];

function intentHallmark(intent, a) {
  switch (intent) {
    case 'definition': return /(である|です。|だ。|をいう|のこと|を指す|と呼ば|と定義|を意味|といい|機械要素|装置|とは)/.test(a);
    case 'list': return (a.match(/[・、，]/g) || []).length >= 2 || /(種類|大別|分けら|に分類|などがある|に分かれ)/.test(a);
    case 'purpose': return /(目的|ため|ねらい|役割|用途|機能|防止|を防)/.test(a);
    case 'why': return /(ため|から|ので|理由|原因|による|起因|生じ|により|防ぐ|防止|抑え|低減|を防)/.test(a);
    case 'features': return /(特徴|利点|長所|短所|性質|優れ|劣る|向く|適する|やすい|にくい|耐食|耐熱|耐摩耗|強度|硬|軽|安価|高い|大きい|小さい|小さく|滑らか|抑え|生じ|できる)/.test(a);
    case 'compare': return /(に比べ|に対し|一方|より|違い|異な|大きく|小さく|簡単)/.test(a);
    case 'howto': return /(まず|次に|手順|①|②|決め|求め|選び|に基づ|によって|から|＝|=|の式|係数|止め|併用)/.test(a);
    default: return true;
  }
}
function clean(a) {
  if (!a) return false;
  const sents = NSCode.research.splitSentences(a.replace(/\n/g, ' '));
  // 手順マーカー(①②③)は書式であり content ではない（長さ判定でも除去している）。
  // junk 判定でも先頭マーカーを外してから評価し、正当な「① 〜する。」を断片扱いしない。
  for (const s of sents) {
    const core = s.replace(/^[\s①-⑳]+/, '');
    if (core.replace(/[\s①-⑳]/g, '').length >= 10 && IN.isJunkSent(core)) return false;
  }
  return true;
}
function onTopic(q, a) {
  const keys = IN.keyTerms(q);
  if (!keys.length) return true;
  for (const k of keys) { if (a.indexOf(k) >= 0) return true;
    const b = k.match(/[一-鿿ァ-ヶー]/g) || [];
    for (let i = 0; i < b.length - 1; i++) if (a.indexOf(b[i] + b[i + 1]) >= 0) return true;
  }
  return false;
}
// retrieval-precision proxy: did the answer surface ANY of the expected material?
function retrieved(expect, a) {
  if (!expect || !expect.length) return true;
  return expect.some((e) => a.indexOf(e) >= 0);
}

const W = { answered: 15, retrieved: 30, onTopic: 20, clean: 10, intentFit: 25 };

(async () => {
  let total = 0; const rows = [];
  for (const item of BANK) {
    let r = null; try { r = await NSCode.askEngine.hybridAnswerKB(item.q, { steps: argSteps }); } catch (e) { r = null; }
    const a = (r && r.text || '').trim();
    const gotIntent = r ? r.intent : 'null';
    const calcDB = !!(r && r.source === '計算式DB' && a);
    const f = {
      answered: !!(a && r && !r.weak),
      retrieved: retrieved(item.expect, a),
      onTopic: calcDB || onTopic(item.q, a),
      clean: calcDB || clean(a),
      intentFit: gotIntent === item.intent && (calcDB || intentHallmark(item.intent, a))
    };
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
  console.log(`\n==== HARD RETRIEVAL SCORE [${AB}]: ${score} / 100  (${BANK.length} questions) ====`);
  process.exit(0);
})();

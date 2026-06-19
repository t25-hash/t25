#!/usr/bin/env node
/* 30問・全質問分類を網羅して生成（接地リコンビネーション）を実機相当でテスト。
 * 各問: classifyIntent / 生成文 / フォールバック有無 を表示し、intent 別に集計。
 * views/ask.js maybeGenerate と同じく curated 文脈（a.text/compose/memo）を供給。 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..'), V = path.join(ROOT, 'assets/vendor/kuromoji');
const store = {};
global.window = global;
global.localStorage = { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
global.document = { createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {}, getElementById: () => null, querySelector: () => null };
global.location = { hash: '' }; global.addEventListener = () => {};
global.XMLHttpRequest = function () { this.open = function (m, u) { this._url = u; }; Object.defineProperty(this, 'response', { get: () => this._buf }); this.send = function () { try { let p = fs.existsSync(this._url) ? this._url : path.join(V, this._url.replace(/^.*\/dict\//, 'dict/')); const b = fs.readFileSync(p); this._buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); this.status = 200; this.onload && this.onload(); } catch (e) { this.status = 404; this.onerror && this.onerror(e); } }; };
global.fetch = u => { const p = path.join(ROOT, u); return Promise.resolve({ ok: fs.existsSync(p), status: fs.existsSync(p) ? 200 : 404, json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf8'))), text: () => Promise.resolve(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '') }); };
for (const f of ['core.js','last-run.js','research-engine.js','rag-engine.js','embed-engine.js','memory-engine.js','llm-engine.js','neural-engine.js','feedback-engine.js','sml-engine.js','grammar-engine.js','ask-engine.js']) vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8'), { filename: f });
const N = global.NSCode;
const QS = [
  // definition
  '歯車とは何か','軸受とは','ねじとは何か','潤滑とは何か',
  // purpose
  '軸受の役割は','歯車の目的は','潤滑の用途','ボルトの機能は',
  // why
  'なぜ焼入れをするのか','軸受が必要な理由','腐食が起こる原因','なぜ歯車に潤滑が必要か',
  // features
  'ステンレス鋼の特徴','玉軸受の利点','すべり軸受の長所','アルミニウムの性質',
  // list
  '軸受の種類','歯車の分類','ねじの種類は','鋼の種類を挙げよ',
  // compare
  '玉軸受ところ軸受の違い','平歯車とはすば歯車の違い','すべり軸受と転がり軸受の比較',
  // howto
  '歯車の設計手順','軸受の選定方法','ねじの締め方','焼入れのやり方',
  // default / random words
  '強度','振動','エンジン'
];
const runs = s => (String(s || '').match(/[一-鿿ァ-ヶー0-9A-Za-z]+/g) || []);
const clen = s => String(s||'').replace(/[^一-鿿ァ-ヶーA-Za-z0-9]/g, '').length;

require(path.join(V, 'kuromoji.js')).builder({ dicPath: path.join(V, 'dict') }).build(async (e, tok) => {
  N.grammar.setTokenizer(tok);
  const byIntent = {}, problems = [];
  let i = 0;
  for (const q of QS) {
    i++;
    const intent = N.askEngine._internal.classifyIntent(q);
    const a = await N.askEngine.hybridAnswerKB(q, { store: 'kb', steps: 300 });
    const seeds = [];
    if (a.text) seeds.push(a.text);
    if (a.compose && a.compose.length) seeds.push(...a.compose);
    if (a.memo) seeds.push(a.memo);
    const ctx = seeds.concat((a.hits || []).map(h => h.chunk.text));
    const gen = ctx.length ? await N.sml.groundedAnswer(q, ctx, { steps: 300 }) : '';
    const ctxText = ctx.join('\n');
    const faithful = !gen || runs(gen).every(t => ctxText.indexOf(t) >= 0);
    const sentences = (gen || '').split(/(?<=[。．！？])/).map(s => s.trim()).filter(Boolean);
    const grammatical = !gen || sentences.every(s => N.grammar.coherence(s).finite);
    byIntent[intent] = byIntent[intent] || { n: 0, gen: 0 };
    byIntent[intent].n++; if (gen) byIntent[intent].gen++;
    if (gen && (!faithful || !grammatical)) problems.push(`${q} [${faithful?'':'UNFAITHFUL '}${grammatical?'':'NONFINITE'}]`);
    const tag = gen ? (faithful && grammatical ? 'GEN ' : 'GEN?') : 'EXT ';
    console.log(`${String(i).padStart(2)} [${intent.padEnd(10)}] ${tag} ${q}`);
    console.log(`    → ${gen || ('（生成なし→抽出）: ' + (a.text || '—'))}`);
  }
  console.log('\n==== intent 別カバレッジ ====');
  ['definition','purpose','why','features','list','compare','howto','default'].forEach(k => {
    const b = byIntent[k]; console.log(`  ${k.padEnd(11)}: ${b ? b.n : 0} 問 / 生成 ${b ? b.gen : 0}`);
  });
  console.log(`\n忠実性・文法の問題: ${problems.length ? problems.join(' | ') : 'なし（生成文はすべて忠実かつ各文終止）'}`);
});

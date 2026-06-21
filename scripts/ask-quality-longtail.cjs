/* ask-quality-longtail — ロングテール(curated 非カバーの専門 topic 全体)の回答可読性を
 * 実 KB のタイトルからサンプルして測る。共通概念だけでなく「広く」品質を計測する指標。
 * gate ではなくスコア報告(遅い・neural のため値は多少ゆれる)。
 * 使い方: node scripts/ask-quality-longtail.cjs [stride]  (既定 stride 97) */
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
const STRIDE = +process.argv[2] || 97;
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/kb/index.json'), 'utf8'));

function topicOf(t) { return String(t || '').replace(/^[\d０-９]+([・.·][\d０-９]+)*\s*/, '').replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '').trim(); }
const DEICTIC = /^(?:これ|それ|その|この|あの|同じ|当該|前者|後者|上記|下記|前述|また[、，]|なお[、，]|一方[、，]|σ|τ|式\(|図[0-9０-９]|表[0-9０-９])/;
function jp(s) { return (s.match(/[一-鿿ぁ-ヶ゠-ヿ]/g) || []).length / Math.max(1, s.length); }
function qual(t) {
  if (!t) return '空';
  if (t.replace(/[\s①-⑳]/g, '').length < 20) return '短い';
  if (DEICTIC.test(t)) return '後方参照';
  if (jp(t) < 0.5) return '低JP';
  const op = (t.match(/[（(]/g) || []).length, cl = (t.match(/[）)]/g) || []).length;
  if (op !== cl) return '括弧不均衡';
  if (!/[。．！？]\s*$/.test(t.trim())) return '非終止';
  return 'OK';
}

(async () => {
  const N = idx.meta.length; let tot = 0, ok = 0; const fw = {};
  for (let i = 0; i < N; i += STRIDE) {
    const topic = topicOf(idx.meta[i]);
    if (!topic || topic.length < 3 || /^(はじめに|概要|序|まとめ|目的|記号|参考|その他)/.test(topic)) continue;
    let a = null; try { a = await A.hybridAnswerKB(topic + 'とは', { steps: 150 }); } catch (e) {}
    let t = (a && (a.normalized || a.text)) || '';
    if (G && G.tidy) t = G.tidy(t);
    const r = qual(t); tot++; if (r === 'OK') ok++; else fw[r] = (fw[r] || 0) + 1;
  }
  console.log('=== ask-quality-longtail (実KBタイトル, stride ' + STRIDE + ') ===');
  console.log('失敗内訳: ' + JSON.stringify(fw));
  console.log('==== LONGTAIL READABILITY: ' + ok + ' / ' + tot + ' (' + (100 * ok / tot).toFixed(1) + '%) ====');
})();

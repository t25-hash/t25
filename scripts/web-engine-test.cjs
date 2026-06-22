/* web-engine-test — NSCode.web（Web検索つき生成）のロジック検証。ライブ通信はせず
 * fetch をモックして、検索語抽出・要約からの回答生成・graceful フォールバックを確認する。 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets/js/web-engine.js'), 'utf8'), { filename: 'web-engine.js' });
const W = global.NSCode.web;

function okFetch(url) {
  let body;
  if (/opensearch/.test(url)) body = ['歯車', ['歯車'], [''], ['https://ja.wikipedia.org/wiki/歯車']];
  else if (/summary/.test(url)) body = { type: 'standard', title: '歯車', extract: '歯車（はぐるま）は、外周に歯を設けて回転運動や動力を伝達する機械要素である。二つの歯車をかみ合わせて確実に伝えられる。', content_urls: { desktop: { page: 'https://ja.wikipedia.org/wiki/歯車' } } };
  else body = {};
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}
function notFound(url) {
  if (/opensearch/.test(url)) return Promise.resolve({ ok: true, json: () => Promise.resolve(['x', [], [], []]) });
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
}
function disambig(url) {
  if (/opensearch/.test(url)) return Promise.resolve({ ok: true, json: () => Promise.resolve(['x', ['XX'], [''], ['u']]) });
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ type: 'disambiguation', title: 'XX', extract: '曖昧さ回避' }) });
}

const checks = [];
function check(name, cond) { checks.push([name, !!cond]); }

(async () => {
  // 1) 検索語抽出（boilerplate除去）
  check('term strips boilerplate', W.term('歯車とは何ですか') === '歯車');

  // 1b) 明示的な Web 検索依頼の検知
  check('wantsWeb: Webで調べて', W.wantsWeb('歯車をWebで調べて') === true);
  check('wantsWeb: ググって', W.wantsWeb('歯車についてググって') === true);
  check('wantsWeb: ネットで検索して', W.wantsWeb('歯車をネットで検索して') === true);
  check('wantsWeb: 通常Qは対象外', W.wantsWeb('歯車とは何ですか') === false);
  // 1c) 指示句を落として話題語を取り出す
  check('term: 歯車をWebで調べて→歯車', W.term('歯車をWebで調べて') === '歯車');
  check('term: 軸受をネットで検索して→軸受', W.term('軸受をネットで検索して') === '軸受');

  // 2) 正常系: 要約から回答生成＋出典
  W._setFetch(okFetch);
  const a = await W.answer('歯車とは');
  check('answer has text', a && /歯車/.test(a.text) && a.text.length >= 12);
  check('answer has source url', a && /wikipedia/i.test(a.url) && a.source === 'Wikipedia');

  // 3) 見つからない → null（graceful）
  W._setFetch(notFound);
  check('not-found → null', (await W.answer('zzz')) === null);

  // 4) 曖昧さ回避ページ → null
  W._setFetch(disambig);
  check('disambiguation → null', (await W.answer('xx')) === null);

  // 5) 通信失敗 → null（例外を飲み込む）
  W._setFetch(function () { return Promise.reject(new Error('blocked')); });
  check('fetch error → null', (await W.answer('歯車')) === null);

  // 6) 無効化（オフライン相当）→ available() false（graceful gating）
  W.config.enabled = false;
  check('disabled → not available', W.available() === false);
  W.config.enabled = true;

  let pass = 0; checks.forEach(function (c) { if (c[1]) pass++; else console.log('  ✗ ' + c[0]); });
  console.log('=== web-engine-test ===');
  console.log('==== WEB ENGINE SCORE: ' + pass + ' / ' + checks.length + ' ====');
  process.exit(pass === checks.length ? 0 : 1);
})();

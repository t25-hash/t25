/* NSCode Web — オフライン KB を補う「Web 検索つき生成」レイヤ。
 *
 * デプロイ先（ブラウザ）から CORS 対応・APIキー不要の Wikipedia API を直接叩き、
 * 該当記事の要約（クリーンな散文）を取得して回答の根拠にする。外部 AI API は使わない
 * （検索＝Wikipedia、生成＝取得要約からの抽出/整形）。
 *
 * すべて graceful：オフライン・ブロック・失敗時は null を返し、Ask は従来どおり KB で答える。
 * fetch は _setFetch で差し替え可能（テスト用）。
 */
(function (NSCode) {
  'use strict';

  var CFG = { lang: 'ja', timeoutMs: 8000, enabled: true };
  var _override = null;

  function rawFetch() { return _override || (typeof fetch !== 'undefined' ? fetch : null); }
  function online() { return typeof navigator === 'undefined' || navigator.onLine !== false; }
  function available() { return CFG.enabled && online() && !!rawFetch(); }

  function getJSON(url) {
    var f = rawFetch(); if (!f) return Promise.reject(new Error('no-fetch'));
    var opts = {}, timer = null;
    if (typeof AbortController !== 'undefined') { var c = new AbortController(); opts.signal = c.signal; timer = setTimeout(function () { c.abort(); }, CFG.timeoutMs); }
    return f(url, opts).then(function (r) { if (timer) clearTimeout(timer); if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
  }

  // 「Webで調べて」「ググって」「ネットで検索して」等の明示的な Web 検索指示か判定。
  function wantsWeb(query) {
    var s = String(query == null ? '' : query);
    return /(web|ウェブ|wikipedia|ウィキペディア|ウィキ|ネット|ねっと|オンライン)\s*(で|に|から)/i.test(s)
      || /(ググ|ぐぐ)(って|っで|り|る|れ|ろ)/.test(s)
      || /(検索|サーチ)\s*(して|し直して|してください|して下さい)/.test(s)
      || /(web|ネット)\s*検索/i.test(s);
  }

  // 質問文から検索語を作る（指示句・boilerplate を落とす）。askEngine.coreQuery があれば使う。
  // 指示句のみ（"Webで調べて" 単体）の場合は '' を返す（呼び出し側が話題語を補う）。
  function term(query) {
    // 明示的な「Webで/ググって/検索して/調べて」等の指示句を落として話題語を取り出す
    var q = String(query == null ? '' : query).trim()
      .replace(/(web|ウェブ|wikipedia|ウィキペディア|ウィキ|ネット|ねっと|オンライン)\s*(で|に|から|を)?/ig, '')
      .replace(/(ググ|ぐぐ)(って|っで|り|る|れ|ろ)/g, '')
      .replace(/(で)?\s*(検索|サーチ)(して|し直して|してください|して下さい)/g, '')
      .replace(/(を|について)?\s*(調べ|探し|教え)(て(ください|下さい)?|る|たい)/g, '')
      .replace(/[をはがにでへとのもや]$/, '')
      .replace(/^[\s、。　]+|[\s、。　]+$/g, '');
    if (!q) return '';
    if (NSCode.askEngine && NSCode.askEngine._internal && NSCode.askEngine._internal.coreQuery) {
      var c = NSCode.askEngine._internal.coreQuery(q); if (c) q = c;
    }
    return q.replace(/(とは(何(です)?か)?|について(教えて|知りたい)?|の意味|を(教えて|説明して?)|ですか|でしょうか|なに|何)[?？]*$/, '').replace(/[?？]+$/, '').trim();
  }

  /* Wikipedia 検索 → 要約。 returns Promise<{title, extract, url, source} | null>。 */
  function search(query) {
    if (!available()) return Promise.resolve(null);
    var q = term(query); if (!q) return Promise.resolve(null);
    var base = 'https://' + CFG.lang + '.wikipedia.org';
    var os = base + '/w/api.php?action=opensearch&limit=1&namespace=0&redirects=resolve&format=json&origin=*&search=' + encodeURIComponent(q);
    return getJSON(os).then(function (r) {
      var title = r && r[1] && r[1][0]; if (!title) return null;
      return getJSON(base + '/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_'))).then(function (s) {
        if (!s || !s.extract || s.type === 'disambiguation') return null;
        var url = (s.content_urls && s.content_urls.desktop && s.content_urls.desktop.page) || (base + '/wiki/' + encodeURIComponent(title));
        return { title: s.title || title, extract: String(s.extract).trim(), url: url, source: 'Wikipedia' };
      });
    }).catch(function () { return null; });
  }

  /* 取得要約から「生成」した回答（先頭の完結文を1〜2文、整形）。 */
  function answer(query) {
    return search(query).then(function (hit) {
      if (!hit) return null;
      var sents = (NSCode.research && NSCode.research.splitSentences) ? NSCode.research.splitSentences(hit.extract) : hit.extract.split(/(?<=[。．])/);
      var out = '', i = 0;
      while (i < sents.length && out.length < 110) { var s = (sents[i] || '').trim(); if (s) out += s; i++; }
      out = out || hit.extract.slice(0, 140);
      if (NSCode.grammar && NSCode.grammar.tidy) out = NSCode.grammar.tidy(out);
      return { text: out, title: hit.title, url: hit.url, source: hit.source, extract: hit.extract };
    });
  }

  NSCode.web = { search: search, answer: answer, available: available, term: term, wantsWeb: wantsWeb, config: CFG, _setFetch: function (f) { _override = f; } };
})(typeof window !== 'undefined' ? (window.NSCode = window.NSCode || {}) : (global.NSCode = global.NSCode || {}));

/* NSCode Research engine — real PDF processing + offline text analysis.
 * pdf.js (vendored, legacy UMD) is lazy-loaded on first use to keep initial
 * page load fast. Summarization/keywords are heuristic & run fully client-side
 * (no LLM / no backend) — see docs/05 for the optional LLM-backed path. */
(function (NSCode) {
  'use strict';

  var PDFJS_SRC = 'assets/vendor/pdfjs/pdf.min.js';
  var PDFJS_WORKER = 'assets/vendor/pdfjs/pdf.worker.min.js';
  var libPromise = null;

  function ensureLib() {
    if (window.pdfjsLib) { setWorker(); return Promise.resolve(window.pdfjsLib); }
    if (libPromise) return libPromise;
    libPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = PDFJS_SRC;
      s.onload = function () { setWorker(); resolve(window.pdfjsLib); };
      s.onerror = function () { libPromise = null; reject(new Error('pdf.js の読み込みに失敗しました（' + PDFJS_SRC + '）')); };
      document.head.appendChild(s);
    });
    return libPromise;
  }
  function setWorker() {
    try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; } catch (e) { /* fake worker fallback */ }
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(new Uint8Array(fr.result)); };
      fr.onerror = function () { reject(new Error('ファイル読込に失敗しました')); };
      fr.readAsArrayBuffer(file);
    });
  }

  /* Parse a PDF File -> { pdf, numPages, meta:{title,author}, pages:[text], fullText } */
  function parse(file, onProgress) {
    return ensureLib().then(function (pdfjsLib) {
      return readFile(file).then(function (data) {
        return pdfjsLib.getDocument({ data: data }).promise;
      }).then(function (pdf) {
        var meta = pdf.getMetadata().catch(function () { return { info: {} }; });
        return meta.then(function (m) {
          var info = (m && m.info) || {};
          var pages = [];
          var chain = Promise.resolve();
          for (var i = 1; i <= pdf.numPages; i++) {
            (function (n) {
              chain = chain.then(function () {
                return pdf.getPage(n).then(function (page) {
                  return page.getTextContent().then(function (tc) {
                    pages[n - 1] = tc.items.map(function (it) { return it.str; }).join(' ').replace(/\s+/g, ' ').trim();
                    if (onProgress) onProgress(n, pdf.numPages);
                  });
                });
              });
            })(i);
          }
          return chain.then(function () {
            return {
              pdf: pdf,
              numPages: pdf.numPages,
              meta: { title: info.Title || file.name.replace(/\.pdf$/i, ''), author: info.Author || '' },
              pages: pages,
              fullText: pages.join('\n\n')
            };
          });
        });
      });
    });
  }

  /* Render a page into a canvas (figure preview). */
  function renderPage(pdf, pageNum, canvas, maxWidth) {
    return pdf.getPage(pageNum).then(function (page) {
      var vp = page.getViewport({ scale: 1 });
      var scale = (maxWidth || 240) / vp.width;
      var v = page.getViewport({ scale: scale });
      canvas.width = Math.ceil(v.width);
      canvas.height = Math.ceil(v.height);
      return page.render({ canvasContext: canvas.getContext('2d'), viewport: v }).promise;
    });
  }

  /* ---------- Offline text analysis ---------- */
  var STOP = (function () {
    var w = ('the a an and or of to in for on with is are was were be been this that these those as by from at it its we you they he she our their your his her can could will would may might shall should must not no but if then so than such into over under out up down about also more most other some any all each both few many our these'.split(' '));
    // common Japanese function-word bigrams (heuristic noise reduction)
    var jp = ('ます です した して する され れる られ この その から まで なり いる ある こと もの ため よう ない ては での には とは として について'.split(' '));
    var s = {}; w.concat(jp).forEach(function (x) { s[x] = 1; }); return s;
  })();

  function terms(text) {
    var out = [];
    var latin = text.toLowerCase().match(/[a-z][a-z0-9\-]{1,}/g) || [];
    for (var i = 0; i < latin.length; i++) out.push(latin[i]);
    var cjk = text.match(/[぀-ヿ一-鿿ｦ-ﾟ]/g) || [];
    for (var j = 0; j < cjk.length - 1; j++) out.push(cjk[j] + cjk[j + 1]); // bigrams
    return out;
  }

  function splitSentences(text) {
    var t = text.replace(/\s+/g, ' ').trim();
    var out = [], buf = '';
    for (var i = 0; i < t.length; i++) {
      var c = t.charAt(i);
      buf += c;
      if ('。．！？!?'.indexOf(c) >= 0) { out.push(buf); buf = ''; }
      else if (c === '.') { // ASCII period: split only at end-of-sentence (next char is space/end), not decimals
        var nx = t.charAt(i + 1);
        if (nx === '' || nx === ' ') { out.push(buf); buf = ''; }
      }
    }
    if (buf) out.push(buf);
    return out.map(function (s) { return s.trim(); })
      .filter(function (s) { return s.replace(/[\s、,]/g, '').length >= 8; });
  }

  function freqMap(text) {
    var f = {};
    terms(text).forEach(function (t) { if (!STOP[t]) f[t] = (f[t] || 0) + 1; });
    return f;
  }

  function summarize(text, n) {
    var sents = splitSentences(text);
    if (sents.length <= n) return sents;
    var f = freqMap(text);
    var scored = sents.map(function (s, idx) {
      var ts = terms(s).filter(function (t) { return !STOP[t]; });
      var score = 0; ts.forEach(function (t) { score += f[t] || 0; });
      score = ts.length ? score / Math.sqrt(ts.length) : 0;
      score *= (1 + 0.2 * (1 - idx / sents.length)); // mild lead bias
      return { idx: idx, s: s, score: score };
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, n).sort(function (a, b) { return a.idx - b.idx; })
      .map(function (x) { return x.s; });
  }

  function keywords(text, n) {
    var f = freqMap(text);
    return Object.keys(f).filter(function (k) { return k.length >= 2 && f[k] >= 2; })
      .map(function (k) { return { term: k, count: f[k] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, n || 20);
  }

  function stats(pages) {
    var text = pages.join(' ');
    var latin = (text.match(/[A-Za-z][A-Za-z0-9\-]*/g) || []).length;
    var cjk = (text.match(/[぀-ヿ一-鿿ｦ-ﾟ]/g) || []).length;
    var words = latin + cjk;
    // ~200 en words/min, ~500 cjk chars/min
    var minutes = Math.max(1, Math.round(latin / 200 + cjk / 500));
    return { pages: pages.length, words: words, latin: latin, cjk: cjk, chars: text.length, minutes: minutes };
  }

  NSCode.research = {
    ensureLib: ensureLib, parse: parse, renderPage: renderPage,
    summarize: summarize, keywords: keywords, stats: stats, splitSentences: splitSentences
  };
})(window.NSCode);

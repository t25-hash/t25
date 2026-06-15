/* Research Lab (RES) — 論文学習: 実際に PDF を投入して解析・要約・図解する */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, R = NSCode.research;
  var state = null; // { fileName, numPages, meta, pages, fullText, pdf }

  function el(id) { return document.getElementById(id); }

  function recentPapersHtml() {
    var papers = NSCode.api.listPapers();
    if (!papers.length) return C.EmptyState({ icon: '📚', message: '保存済みの論文はまだありません。', hint: 'PDF を解析して「保存」すると、ここに残ります。' });
    return C.Table(['タイトル', 'ページ', '保存日'], papers.map(function (p) {
      return [p.title || '(無題)', String(p.numPages || '-'), (p.uploaded_at || '').slice(0, 10)];
    }));
  }

  NSCode.registerView({
    route: '#/research', module: 'research', title: 'Research Lab',
    render: function () {
      return C.PageHeader({ title: 'Research Lab', purpose: '論文学習 — PDF を投入して解析・要約・図解' }) +
        C.Panel({
          title: '論文アップロード', hint: 'PDF をドロップ または クリックで選択',
          body:
            '<div id="dropzone" class="ns-drop" tabindex="0" role="button" aria-label="PDFをアップロード">' +
              '<div class="ns-drop__icon">📄</div>' +
              '<p class="ns-drop__msg">ここに <b>PDF</b> をドラッグ＆ドロップ</p>' +
              '<p class="ns-empty__hint">またはクリックしてファイルを選択（端末内で処理され、外部送信はされません）</p>' +
              '<input id="pdfInput" type="file" accept="application/pdf" hidden>' +
            '</div>' +
            '<div id="loadStatus" class="ns-loadstatus" hidden></div>'
        }) +
        '<div id="research-result"></div>' +
        C.Panel({ title: '保存済み論文', body: '<div id="recent">' + recentPapersHtml() + '</div>' });
    },

    onMount: function () {
      var dz = el('dropzone'), input = el('pdfInput');
      if (!dz) return;

      dz.addEventListener('click', function () { input.click(); });
      dz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
      input.addEventListener('change', function () { if (input.files[0]) handleFile(input.files[0]); });
      ['dragenter', 'dragover'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('is-over'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('is-over'); });
      });
      dz.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files[0];
        if (f) handleFile(f);
      });
    }
  });

  function setStatus(msg, show) {
    var s = el('loadStatus'); if (!s) return;
    s.hidden = !show; s.textContent = msg || '';
  }

  function handleFile(file) {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setStatus('PDF ファイルを選択してください。', true); return;
    }
    setStatus('pdf.js を読み込み中…', true);
    R.parse(file, function (n, total) { setStatus('解析中… ' + n + ' / ' + total + ' ページ', true); })
      .then(function (res) {
        state = res; state.fileName = file.name;
        setStatus('', false);
        renderResult();
      })
      .catch(function (err) {
        setStatus('エラー: ' + err.message + '（ローカルファイルで動かない場合は簡易サーバ経由で開いてください）', true);
      });
  }

  function renderResult() {
    var mount = el('research-result');
    if (!mount || !state) return;
    var st = R.stats(state.pages);
    var thumbCount = Math.min(state.numPages, 6);

    var metrics = [
      C.Metric({ label: 'ページ', value: st.pages }),
      C.Metric({ label: '語数(概算)', value: st.words.toLocaleString() }),
      C.Metric({ label: '推定読了', value: st.minutes, unit: '分' })
    ].join('');

    var thumbs = '';
    for (var i = 1; i <= thumbCount; i++) {
      thumbs += '<figure class="ns-thumb"><canvas data-page="' + i + '"></canvas><figcaption>p.' + i + '</figcaption></figure>';
    }

    mount.innerHTML =
      C.Panel({ title: state.meta.title || state.fileName, hint: state.meta.author || '',
        body: '<div class="ns-grid" style="--cols:3">' + metrics + '</div>' +
          '<div class="ns-actions"><button id="saveBtn" class="ns-btn">保存</button>' +
          '<button id="exportBtn" class="ns-btn ns-btn--ghost">要約をMarkdownで保存</button>' +
          '<a class="ns-btn ns-btn--ghost" href="#/build">再現実験 (Build Lab)</a></div>' }) +
      C.Panel({ title: '要約', hint: '抽出型・オフライン（LLM要約は docs/05 のバックエンド接続で）',
        body: '<label class="ns-control"><span>要約の文数: <b id="sumN">5</b></span>' +
          '<input id="sumRange" class="ns-range" type="range" min="1" max="15" value="5"></label>' +
          '<div id="summary" class="ns-summary"></div>' }) +
      C.Panel({ title: 'キーワード', body: '<div id="keywords" class="ns-chips"></div>' }) +
      C.Panel({ title: '図解（ページプレビュー）', hint: '先頭 ' + thumbCount + ' ページ',
        body: '<div class="ns-thumbs">' + thumbs + '</div>' }) +
      C.Panel({ title: '全文', hint: '抽出テキスト',
        body: '<div id="fulltext" class="ns-fulltext"></div>' });

    // summary
    var range = el('sumRange');
    function drawSummary() {
      el('sumN').textContent = range.value;
      var sents = R.summarize(state.fullText, parseInt(range.value, 10));
      el('summary').innerHTML = sents.length
        ? '<ul>' + sents.map(function (s) { return '<li>' + C.esc(s) + '</li>'; }).join('') + '</ul>'
        : '<p class="ns-empty__hint">要約できる十分なテキストが抽出できませんでした（画像PDFの可能性）。</p>';
    }
    range.addEventListener('input', drawSummary);
    drawSummary();

    // keywords
    var kws = R.keywords(state.fullText, 24);
    el('keywords').innerHTML = kws.length
      ? kws.map(function (k) { return '<span class="ns-chip">' + C.esc(k.term) + '<i>' + k.count + '</i></span>'; }).join('')
      : '<p class="ns-empty__hint">キーワードを抽出できませんでした。</p>';

    // full text
    el('fulltext').textContent = state.fullText.slice(0, 20000) + (state.fullText.length > 20000 ? '\n…(以下省略)' : '');

    // thumbnails
    var canvases = mount.querySelectorAll('canvas[data-page]');
    Array.prototype.forEach.call(canvases, function (cv) {
      R.renderPage(state.pdf, parseInt(cv.getAttribute('data-page'), 10), cv, 240).catch(function () {});
    });

    // save / export
    el('saveBtn').addEventListener('click', function () {
      NSCode.api.savePaper({
        title: state.meta.title || state.fileName, author: state.meta.author,
        numPages: state.numPages,
        summary: R.summarize(state.fullText, parseInt(range.value, 10)),
        keywords: kws.slice(0, 12).map(function (k) { return k.term; })
      });
      el('recent').innerHTML = recentPapersHtml();
      el('saveBtn').textContent = '保存しました ✓';
    });
    el('exportBtn').addEventListener('click', function () {
      var sents = R.summarize(state.fullText, parseInt(range.value, 10));
      var md = '# ' + (state.meta.title || state.fileName) + '\n\n' +
        (state.meta.author ? '著者: ' + state.meta.author + '\n\n' : '') +
        '## 要約\n\n' + sents.map(function (s) { return '- ' + s; }).join('\n') +
        '\n\n## キーワード\n\n' + kws.slice(0, 12).map(function (k) { return '`' + k.term + '`'; }).join(' ');
      download(md, (state.meta.title || 'summary').replace(/[^\w\-一-鿿぀-ヿ]+/g, '_') + '.md');
    });
  }

  function download(text, name) {
    var blob = new Blob([text], { type: 'text/markdown' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }
})(window.NSCode);

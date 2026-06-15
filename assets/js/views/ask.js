/* Ask (RAG) — a real, primitive RAG over your own documents. Top-level entry.
 * Add docs (paste text or upload .txt/.md/.pdf) -> ask -> grounded answer with
 * citations. Retrieval is TF-IDF (real); the answer is extractive (no LLM). */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, A = NSCode.askEngine, R = NSCode.research;

  var state = Object.assign({ query: 'チャンクサイズが大きすぎるとどうなる？', topK: 4 },
    NSCode.api.labState('#/ask') || {});
  function persist() { NSCode.api.labState('#/ask', state); }
  function el(id) { return document.getElementById(id); }

  function highlight(text, query) {
    var ws = (query.toLowerCase().match(/[a-z0-9]{2,}/g) || []).concat(query.match(/[぀-ヿ一-鿿ｦ-ﾟ]{2,}/g) || []);
    var html = C.esc(text);
    ws.forEach(function (w) { html = html.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>'); });
    return html;
  }

  NSCode.registerView({
    route: '#/ask', module: 'ask', title: 'Ask (RAG)',
    render: function () {
      return C.PageHeader({ title: '🔎 Ask (RAG)', purpose: '自分の文書を入れて質問 → その文書に基づいて回答（実際に動く RAG）' }) +
        C.Panel({ title: '1. ナレッジベース（文書を追加）', hint: '貼り付け or .txt/.md/.pdf をアップロード（端末内処理）',
          body:
            '<textarea id="docText" class="ns-input" rows="4" placeholder="ここに文章を貼り付け…"></textarea>' +
            '<div class="ns-actions">' +
              '<button id="addDoc" class="ns-btn">テキストを追加</button>' +
              '<label class="ns-btn ns-btn--ghost" style="cursor:pointer">ファイル追加<input id="docFile" type="file" accept=".txt,.md,.pdf,text/plain,application/pdf" multiple hidden></label>' +
              '<button id="resetDocs" class="ns-btn ns-btn--ghost">サンプルに戻す</button>' +
            '</div>' +
            '<div id="docStatus" class="ns-empty__hint"></div>' +
            '<div id="docList"></div>' }) +
        C.Panel({ title: '2. 質問する', hint: 'TF-IDF で関連チャンクを検索（実物）',
          body:
            '<div class="ns-qa-bar"><input id="askQ" class="ns-input" value="' + C.esc(state.query) + '">' +
            '<button id="askBtn" class="ns-btn">検索して回答</button></div>' +
            C.Controls([{ label: 'TopK: <b id="askKv">' + state.topK + '</b>', control: '<input id="askK" class="ns-range" type="range" min="1" max="8" value="' + state.topK + '">' }]) }) +
        C.Panel({ title: '3. 回答', hint: '抽出型（生成なし）・出典付き。LLM 生成は docs/05 のバックエンド接続で',
          body: '<div id="askAns"></div>' }) +
        C.Panel({ title: 'LLM に渡されるプロンプト（参考）', body: '<pre id="askPrompt" class="ns-code"></pre>' });
    },
    onMount: function () {
      el('addDoc').addEventListener('click', function () {
        var t = el('docText').value.trim(); if (!t) return;
        var docs = A.getDocs(); docs.push({ name: 'テキスト' + (docs.length + 1), text: t }); A.setDocs(docs);
        el('docText').value = ''; renderDocs(); setStatus('追加しました。');
      });
      el('resetDocs').addEventListener('click', function () { A.resetDocs(); renderDocs(); setStatus('サンプル文書に戻しました。'); });
      el('docFile').addEventListener('change', function () { handleFiles(this.files); this.value = ''; });
      el('askQ').addEventListener('input', function () { state.query = el('askQ').value; persist(); });
      el('askK').addEventListener('input', function () { state.topK = +el('askK').value; el('askKv').textContent = state.topK; persist(); });
      el('askBtn').addEventListener('click', runAsk);
      el('askQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runAsk(); } });
      renderDocs(); runAsk();
    }
  });

  function setStatus(msg) { var s = el('docStatus'); if (s) s.textContent = msg || ''; }

  function handleFiles(files) {
    if (!files || !files.length) return;
    var arr = Array.prototype.slice.call(files);
    setStatus('読み込み中…');
    var tasks = arr.map(function (f) {
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
        return R.parse(f).then(function (res) { return { name: f.name, text: res.fullText }; });
      }
      return new Promise(function (resolve) {
        var fr = new FileReader();
        fr.onload = function () { resolve({ name: f.name, text: String(fr.result) }); };
        fr.onerror = function () { resolve(null); };
        fr.readAsText(f);
      });
    });
    Promise.all(tasks).then(function (docsAdded) {
      var docs = A.getDocs();
      docsAdded.filter(Boolean).forEach(function (d) { if (d.text && d.text.trim()) docs.push(d); });
      A.setDocs(docs); renderDocs(); setStatus(docsAdded.filter(Boolean).length + ' 件の文書を追加しました。'); runAsk();
    }).catch(function (e) { setStatus('読み込みエラー: ' + e.message); });
  }

  function renderDocs() {
    var out = el('docList'); if (!out) return;
    var docs = A.getDocs();
    var chunks = A.buildChunks(docs);
    out.innerHTML = '<div class="ns-empty__hint">' + docs.length + ' 文書 / ' + chunks.length + ' チャンク</div>' +
      '<div class="ns-doclist">' + docs.map(function (d, i) {
        return '<div class="ns-docitem"><span class="ns-tag">' + C.esc(d.name) + '</span>' +
          '<span class="ns-doc-meta">' + d.text.length + '字</span>' +
          '<button class="ns-doc-rm" data-i="' + i + '" title="削除">✕</button></div>';
      }).join('') + '</div>';
    Array.prototype.forEach.call(out.querySelectorAll('.ns-doc-rm'), function (b) {
      b.addEventListener('click', function () {
        var docs = A.getDocs(); docs.splice(+b.getAttribute('data-i'), 1); A.setDocs(docs); renderDocs(); runAsk();
      });
    });
  }

  function runAsk() {
    var out = el('askAns'), pr = el('askPrompt'); if (!out) return;
    var q = (el('askQ') ? el('askQ').value : state.query).trim();
    var res = q ? A.ask(q, { topK: state.topK }) : null;
    if (!res) { out.innerHTML = C.EmptyState({ icon: '🔎', message: '文書を追加して質問してください。' }); if (pr) pr.textContent = ''; return; }
    out.innerHTML =
      (res.answer.length
        ? '<div class="ns-qa-answer"><b>回答（文書からの抜粋）:</b><ul>' + res.answer.map(function (a) {
            return '<li>' + highlight(a.s, q) + ' <span class="ns-tag">' + C.esc(a.src) + '</span></li>';
          }).join('') + '</ul></div>'
        : '<p class="ns-empty__hint">関連箇所が見つかりませんでした。文書か質問を変えてみてください。</p>') +
      '<p class="ns-empty__hint">出典（検索された関連チャンク・スコア順）:</p>' +
      res.hits.map(function (h, i) {
        return '<div class="ns-hit"><div class="ns-hit__head"><span>#' + (i + 1) + ' · ' + C.esc(h.chunk.source) + '</span>' +
          '<span class="ns-hit__score">cos ' + h.score.toFixed(3) + '</span></div>' +
          '<div class="ns-progress"><div class="ns-progress__fill" style="width:' + Math.round(h.score * 100) + '%"></div></div>' +
          '<p class="ns-hit__text">' + highlight(h.chunk.text.slice(0, 240), q) + (h.chunk.text.length > 240 ? '…' : '') + '</p></div>';
      }).join('');
    if (pr) pr.textContent = res.prompt;
  }
})(window.NSCode);

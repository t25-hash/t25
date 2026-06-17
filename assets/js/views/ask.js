/* Ask (the baby) — HYBRID: search + weights (the Claude-style pipeline).
 * For each question: SEARCH the knowledge base for the relevant chunks, then a
 * small neural net LEARNS just those chunks and GENERATES the answer from its
 * weights. Only retrieved chunks are learned, so it scales to large PDFs.
 * The retrieved passages are shown as references (like citations). */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, A = NSCode.askEngine, R = NSCode.research;
  function el(id) { return document.getElementById(id); }

  var state = Object.assign({ source: 'kb', query: '歯車の設計について教えて', temperature: 0.45 },
    NSCode.api.labState('#/ask') || {});
  function persist() { NSCode.api.labState('#/ask', state); }
  var askToken = 0;   // guards against overlapping async answers

  function highlight(text, query) {
    var ws = (query.toLowerCase().match(/[a-z0-9]{2,}/g) || []).concat(query.match(/[぀-ヿ一-鿿ｦ-ﾟ]{2,}/g) || []);
    var html = C.esc(text);
    ws.forEach(function (w) { html = html.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>'); });
    return html;
  }

  function kbBody() {
    return '<div class="ns-empty__hint">📚 機械工学の教科書 <b>5,809 文書</b>（α機械工学概説 / β設計工学 / γ産業機械）。事前に作った索引で関連文書だけを取り出し、その文脈をニューラルが学習して回答します（初回は索引 ~3MB を読み込み）。</div>';
  }
  function mineBody() {
    return '<textarea id="docText" class="ns-input" rows="4" placeholder="覚えさせたい文章を貼り付け…（例：運転手順書 / 仕様書）"></textarea>' +
      '<div class="ns-actions">' +
        '<button id="addDoc" class="ns-btn">知識に追加</button>' +
        '<label class="ns-btn ns-btn--ghost" style="cursor:pointer">ファイル追加<input id="docFile" type="file" accept=".txt,.md,.pdf,text/plain,application/pdf" multiple hidden></label>' +
        '<button id="resetDocs" class="ns-btn ns-btn--ghost">既定の知識に戻す</button>' +
      '</div><div id="docStatus" class="ns-empty__hint"></div>';
  }
  function wireMine() {
    el('addDoc').addEventListener('click', function () {
      var t = A.cleanText(el('docText').value); if (!t) return;
      var docs = A.getDocs(); docs.push({ name: 'mem' + (docs.length + 1), text: t }); A.setDocs(docs);
      el('docText').value = ''; setStatus('知識に追加しました（合計 ' + kbSize().toLocaleString() + ' 字）。質問できます。');
    });
    el('resetDocs').addEventListener('click', function () { A.resetDocs(); setStatus('既定の知識に戻しました。'); });
    el('docFile').addEventListener('change', function () { handleFiles(this.files); this.value = ''; });
  }

  NSCode.registerView({
    route: '#/ask', module: 'ask', title: 'Ask (Hybrid)',
    render: function () {
      return C.PageHeader({ title: '🍼 Ask the baby', purpose: '関連箇所を検索 → その文脈をニューラルが学習して回答（検索＋重み＝Claude型・API不要）' }) +
        C.Panel({ title: '1. 知識ベース', hint: '検索対象を選択',
          body:
            C.Controls([{ label: '対象', control:
              '<select id="srcSel" class="ns-input">' +
                '<option value="kb"' + (state.source === 'kb' ? ' selected' : '') + '>機械工学 KB（5,809文書）</option>' +
                '<option value="mine"' + (state.source === 'mine' ? ' selected' : '') + '>自分の知識（貼付/PDF）</option></select>' }]) +
            '<div id="srcArea">' + (state.source === 'kb' ? kbBody() : mineBody()) + '</div>' }) +
        C.Panel({ title: '2. 質問する', hint: '質問→関連チャンクを検索→その文脈でニューラルが学習→重みから生成',
          body:
            '<div class="ns-qa-bar"><input id="askQ" class="ns-input" value="' + C.esc(state.query) + '">' +
            '<button id="askBtn" class="ns-btn">回答</button>' +
            '<button id="askRegen" class="ns-btn ns-btn--ghost">別の回答</button></div>' +
            C.Controls([
              { label: '温度 Temperature: <b id="askTv">' + state.temperature + '</b>', control: '<input id="askT" class="ns-range" type="range" min="0.2" max="1.0" step="0.05" value="' + state.temperature + '">' }
            ]) }) +
        C.Panel({ title: '3. 回答（検索＋ニューラル生成）', hint: '極小ニューラル（赤ちゃん級）の生成のため不完全なことがあります。根拠は下に表示',
          body: '<div id="askAns"></div>' }) +
        C.Panel({ title: 'しくみ', body:
          '<p class="ns-empty__hint">本物の LLM（Claude）と同じ二段構え：<b>検索</b>で関連箇所を取り出し、<b>重み</b>（ニューラルネット）が文脈を学習して回答を生成します。重みの様子は <a href="#/neural">Neural Lab</a>、PDFの取り込みは <a href="#/pdf">PDF抽出</a> で。</p>' }) ;
    },
    onMount: function () {
      el('srcSel').addEventListener('change', function () { state.source = el('srcSel').value; persist(); NSCode.renderCurrent(); });
      if (state.source === 'mine') wireMine();
      el('askQ').addEventListener('input', function () { state.query = el('askQ').value; persist(); });
      el('askT').addEventListener('input', function () { state.temperature = +el('askT').value; el('askTv').textContent = state.temperature; persist(); });
      el('askBtn').addEventListener('click', runAsk);
      el('askRegen').addEventListener('click', runAsk);
      el('askQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runAsk(); } });
      runAsk();
    }
  });

  function setStatus(msg) { var s = el('docStatus'); if (s) s.textContent = msg || ''; }
  function kbSize() { return A.getDocs().reduce(function (s, d) { return s + (d.text || '').length; }, 0); }

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
      docsAdded.filter(Boolean).forEach(function (d) { var c = A.cleanText(d.text); if (c) docs.push({ name: d.name, text: c }); });
      A.setDocs(docs); setStatus('知識に追加しました（合計 ' + kbSize().toLocaleString() + ' 字）。質問できます。');
    }).catch(function (e) { setStatus('読み込みエラー: ' + e.message); });
  }

  function runAsk() {
    var out = el('askAns'); if (!out) return;
    var q = (el('askQ') ? el('askQ').value : state.query).trim();
    if (!q) { out.innerHTML = C.EmptyState({ icon: '🍼', message: '質問を入力してください。' }); return; }
    var token = ++askToken;
    out.innerHTML = '<p class="ns-empty__hint" id="askThinking">考え中… 関連箇所を検索し、ニューラルが学習しています（0%）</p>' +
      '<div class="ns-progress"><div id="askBar" class="ns-progress__fill" style="width:0%"></div></div>';
    var run = state.source === 'kb' ? A.hybridAnswerKB : A.hybridAnswer;
    run(q, {
      temperature: state.temperature,
      onProgress: function (s) {
        if (token !== askToken) return;
        var pct = Math.round(100 * s.step / s.total), b = el('askBar'), th = el('askThinking');
        if (b) b.style.width = pct + '%';
        if (th) th.textContent = '考え中… 関連箇所を検索し、ニューラルが学習しています（' + pct + '%）';
      }
    }).then(function (a) {
      if (token !== askToken) return;        // a newer question superseded this one
      if (!a || !a.text) {
        out.innerHTML = '<p class="ns-empty__hint">関連する知識が見つかりませんでした。「知識に追加」で資料を学習させてください。</p>';
        return;
      }
      var srcs = {}; a.hits.forEach(function (h) { srcs[h.chunk.source] = 1; });
      out.innerHTML =
        '<div class="ns-qa-answer"><div class="ns-qa-answer__label">回答（検索＋ニューラル生成）</div>' +
          '<p class="ns-qa-answer__lead">' + highlight(a.text, q) + '</p>' +
          '<div class="ns-qa-answer__src">起点: <span class="ns-tag">' + C.esc(a.seed) + '</span>' +
            ' ／ 参照: ' + Object.keys(srcs).map(function (s) { return '<span class="ns-tag">' + C.esc(s) + '</span>'; }).join(' ') + '</div></div>' +
        '<p class="ns-empty__hint">検索で取り出した根拠（この文脈をニューラルが学習）:</p>' +
        a.hits.map(function (h, i) {
          return '<div class="ns-hit"><div class="ns-hit__head"><span>#' + (i + 1) + ' · ' + C.esc(h.chunk.source) + '</span>' +
            '<span class="ns-hit__score">cos ' + h.score.toFixed(3) + '</span></div>' +
            '<p class="ns-hit__text">' + highlight(h.chunk.text.slice(0, 200), q) + (h.chunk.text.length > 200 ? '…' : '') + '</p></div>';
        }).join('');
    }).catch(function (e) {
      if (token !== askToken) return;
      out.innerHTML = '<p class="ns-empty__hint">エラー: ' + (e && e.message ? e.message : e) + '</p>';
    });
  }
})(window.NSCode);

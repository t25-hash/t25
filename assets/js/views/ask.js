/* Ask (RAG) — educational page that runs the RAG procedure end-to-end:
 * retrieve (TF-IDF) → COMPOSE a natural-language answer from the retrieved
 * passages (the sentences best matching the question). Two in-browser
 * generators are also shown for learning, side by side: a baby n-gram LM
 * (counting) and a real, tiny NEURAL network LM (NSCode.neuralLM) trained on
 * the knowledge base by gradient descent. No API, no libraries. */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, A = NSCode.askEngine, R = NSCode.research, NLM = NSCode.neuralLM;

  var state = Object.assign({ query: 'タービンとボイラを備える廃棄物発電施設の仕組みは？', topK: 4, temperature: 0.8 },
    NSCode.api.labState('#/ask') || {});
  function persist() { NSCode.api.labState('#/ask', state); }
  function el(id) { return document.getElementById(id); }

  /* ---- Ask's shared base neural model (lives in NSCode.neuralLab) ---- */
  var LAB = NSCode.neuralLab;
  var lastRes = null, labUnsub = null;
  function startNeural() { LAB.ensure(); }   // (re)train on the current KB when it changes
  function renderNeural() {
    var box = el('askNeural'); if (!box) return;
    var st = LAB.state;
    if (st.training) {
      var p = st.prog || { step: 0, total: st.opts.steps, loss: 0 };
      var pct = Math.round(100 * p.step / p.total);
      box.innerHTML = '<p class="ns-empty__hint">ニューラルネットを学習中… ' + pct + '%（loss ' + (p.loss ? p.loss.toFixed(3) : '—') + '）</p>' +
        '<div class="ns-progress"><div class="ns-progress__fill" style="width:' + pct + '%"></div></div>';
      return;
    }
    if (!st.model) { box.innerHTML = '<p class="ns-empty__hint">学習待機中…</p>'; return; }
    var m = st.model;
    var seed = (lastRes && lastRes.seed) ? NSCode.babyLLM.tokenize(lastRes.seed).slice(0, m.C) : NLM.tokenize(state.query).slice(0, m.C);
    if (!seed.length) seed = NLM.tokenize('蒸気タービン').slice(0, m.C);
    var gen = NSCode.babyLLM.join(LAB.generate(seed, { temperature: state.temperature, topK: 6, maxTokens: 48 }));
    box.innerHTML =
      '<div class="ns-qa-answer__src" style="margin-bottom:6px"><span class="ns-tag">ニューラル生成</span> ' + highlight(gen, state.query) + '</div>' +
      '<p class="ns-empty__hint">構成: 埋め込み(' + m.D + ') → 隠れ層 tanh(' + m.H + ') → softmax(' + m.V + ' 語)。' +
        '学習 ' + m.steps + ' ステップ / 最終 loss ' + m.loss.toFixed(3) + ' / 重み 約 ' + st.params.toLocaleString() + ' 個。' +
        'n-gram（数え上げ）と違い、勾配降下で重みを学習した<b>本物のニューラルネット</b>です。' +
        ' 仕組み・学習データの追加・実物の中身は <a href="#/neural">Neural Lab</a> で。</p>';
  }

  function highlight(text, query) {
    var ws = (query.toLowerCase().match(/[a-z0-9]{2,}/g) || []).concat(query.match(/[぀-ヿ一-鿿ｦ-ﾟ]{2,}/g) || []);
    var html = C.esc(text);
    ws.forEach(function (w) { html = html.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>'); });
    return html;
  }

  NSCode.registerView({
    route: '#/ask', module: 'ask', title: 'Ask (RAG)',
    render: function () {
      return C.PageHeader({ title: '🔎 Ask (RAG)', purpose: '文書を入れて質問 → 検索して根拠から回答を構成。さらに端末内のニューラルネット／n-gram が“生成”も実演（API不要）' }) +
        C.Panel({ title: '1. ナレッジベース（文書を追加）', hint: '貼り付け or .txt/.md/.pdf をアップロード（端末内処理）',
          body:
            '<textarea id="docText" class="ns-input" rows="4" placeholder="ここに技術文書を貼り付け…（例：運転手順書 / トラブル報告書 / 仕様書）"></textarea>' +
            '<div class="ns-actions">' +
              '<button id="addDoc" class="ns-btn">テキストを追加</button>' +
              '<label class="ns-btn ns-btn--ghost" style="cursor:pointer">ファイル追加<input id="docFile" type="file" accept=".txt,.md,.pdf,text/plain,application/pdf" multiple hidden></label>' +
              '<button id="resetDocs" class="ns-btn ns-btn--ghost">サンプルに戻す</button>' +
            '</div>' +
            '<div id="docStatus" class="ns-empty__hint"></div>' +
            '<div id="docList"></div>' }) +
        C.Panel({ title: '2. 質問する', hint: '関連チャンクを検索 → その文脈で極小LLMが回答を生成（生成はランダム性あり）',
          body:
            '<div class="ns-qa-bar"><input id="askQ" class="ns-input" value="' + C.esc(state.query) + '">' +
            '<button id="askBtn" class="ns-btn">回答を生成</button>' +
            '<button id="askRegen" class="ns-btn ns-btn--ghost">再生成</button></div>' +
            C.Controls([
              { label: '検索 TopK: <b id="askKv">' + state.topK + '</b>', control: '<input id="askK" class="ns-range" type="range" min="1" max="8" value="' + state.topK + '">' },
              { label: '温度 Temperature: <b id="askTv">' + state.temperature + '</b>', control: '<input id="askT" class="ns-range" type="range" min="0.1" max="1.5" step="0.1" value="' + state.temperature + '">' }
            ]) }) +
        C.Panel({ title: '3. 回答（根拠に基づく）', hint: '検索した文脈から質問に最も関連する文を抽出して構成（自然な日本語）。根拠も併記',
          body: '<div id="askAns"></div>' }) +
        C.Panel({ title: '🧠 ニューラル生成（ブラウザ内で学習）', hint: '埋め込み → 隠れ層 → softmax の小さなニューラルネットを端末内で勾配降下学習し、次トークンを予測して生成（n-gram とは別物・API不要）', body: '<div id="askNeural"></div>' }) +
        C.Panel({ title: '参考: n-gram LLM の「生成」デモ（次トークン予測）', hint: '回答とは別に、数え上げ型の n-gram LLM が1トークンずつ生成する様子を学習用に表示（赤ちゃん級・API不要）', body: '<div id="askTrace"></div>' }) +
        C.Panel({ title: 'モデルに渡した文脈プロンプト（参考）', body: '<pre id="askPrompt" class="ns-code"></pre>' });
    },
    onMount: function () {
      el('addDoc').addEventListener('click', function () {
        var t = el('docText').value.trim(); if (!t) return;
        var docs = A.getDocs(); docs.push({ name: 'テキスト' + (docs.length + 1), text: t }); A.setDocs(docs);
        el('docText').value = ''; renderDocs(); setStatus('追加しました。'); startNeural();
      });
      el('resetDocs').addEventListener('click', function () { A.resetDocs(); renderDocs(); setStatus('サンプル文書に戻しました。'); startNeural(); });
      el('docFile').addEventListener('change', function () { handleFiles(this.files); this.value = ''; });
      el('askQ').addEventListener('input', function () { state.query = el('askQ').value; persist(); });
      el('askK').addEventListener('input', function () { state.topK = +el('askK').value; el('askKv').textContent = state.topK; persist(); });
      el('askT').addEventListener('input', function () { state.temperature = +el('askT').value; el('askTv').textContent = state.temperature; persist(); });
      el('askBtn').addEventListener('click', runAsk);
      el('askRegen').addEventListener('click', runAsk);
      el('askQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runAsk(); } });
      if (labUnsub) labUnsub();
      labUnsub = LAB.onChange(renderNeural);   // re-render the neural panel as it trains
      renderDocs(); startNeural(); runAsk();
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
      A.setDocs(docs); renderDocs(); setStatus(docsAdded.filter(Boolean).length + ' 件の文書を追加しました。'); startNeural(); runAsk();
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
        var docs = A.getDocs(); docs.splice(+b.getAttribute('data-i'), 1); A.setDocs(docs); renderDocs(); startNeural(); runAsk();
      });
    });
  }

  function runAsk() {
    var out = el('askAns'), pr = el('askPrompt'), tr = el('askTrace'); if (!out) return;
    var q = (el('askQ') ? el('askQ').value : state.query).trim();
    var res = q ? A.ask(q, { topK: state.topK, temperature: state.temperature, maxTokens: 60 }) : null;
    lastRes = res;
    if (!res) {
      out.innerHTML = C.EmptyState({ icon: '🔎', message: '文書を追加して質問してください。' });
      if (pr) pr.textContent = ''; if (tr) tr.innerHTML = ''; renderNeural(); return;
    }
    var srcs = {}; res.hits.forEach(function (h) { srcs[h.chunk.source] = 1; });
    var ansHtml = (res.answer && res.answer.length)
      ? '<ul class="ns-qa-answer__list">' + res.answer.map(function (s) { return '<li>' + highlight(s, q) + '</li>'; }).join('') + '</ul>'
      : '<p class="ns-empty__hint">関連する文が見つかりませんでした。文書を追加するか質問を変えてください。</p>';
    out.innerHTML =
      '<div class="ns-qa-answer"><div class="ns-qa-answer__label">回答（根拠に基づく）</div>' +
        ansHtml +
        '<div class="ns-qa-answer__src">出典: ' + Object.keys(srcs).map(function (s) { return '<span class="ns-tag">' + C.esc(s) + '</span>'; }).join(' ') + '</div></div>' +
      '<p class="ns-empty__hint">根拠（検索された関連チャンク・スコア順）— この文脈で回答を構成:</p>' +
      res.hits.map(function (h, i) {
        return '<div class="ns-hit"><div class="ns-hit__head"><span>#' + (i + 1) + ' · ' + C.esc(h.chunk.source) + '</span>' +
          '<span class="ns-hit__score">cos ' + h.score.toFixed(3) + '</span></div>' +
          '<div class="ns-progress"><div class="ns-progress__fill" style="width:' + Math.round(h.score * 100) + '%"></div></div>' +
          '<p class="ns-hit__text">' + highlight(h.chunk.text.slice(0, 240), q) + (h.chunk.text.length > 240 ? '…' : '') + '</p></div>';
      }).join('');

    if (tr) {
      var genLine = '<div class="ns-qa-answer__src" style="margin-bottom:8px">' +
        '<span class="ns-tag">極小LLMの生成（参考・赤ちゃん級）</span> ' + highlight(res.generated || '(生成できませんでした)', q) +
        ' <span class="ns-empty__hint">seed: ' + C.esc(res.seed) + ' ／ 学習語彙: ' + res.vocab + '</span></div>';
      tr.innerHTML = genLine + ((res.trace && res.trace.length)
        ? '<div class="ns-trace2">' + res.trace.map(function (r) {
            return '<div class="ns-trace2__row"><span class="ns-trace2__ctx">' + C.esc(r.context || '(先頭)') + ' →</span>' +
              r.top.map(function (t) {
                return '<span class="ns-tok' + (t.tok === r.chosen ? ' is-pick' : '') + '">' + C.esc(t.tok === '\n' ? '⏎' : t.tok) + '<i>' + Math.round(t.prob * 100) + '%</i></span>';
              }).join('') + '</div>';
          }).join('') + '</div>' +
          '<p class="ns-empty__hint">温度を上げると候補が平準化（多様）、下げると最有力に集中（決定的）。再生成で別のサンプルになります。</p>'
        : '<p class="ns-empty__hint">生成過程を表示できませんでした。</p>');
    }
    if (pr) pr.textContent = res.prompt;
    renderNeural();
  }
})(window.NSCode);

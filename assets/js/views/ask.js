/* Ask (the baby) — NOT RAG. The knowledge base documents are compiled INTO a
 * tiny in-browser neural network (NSCode.neuralLab): the MDs are held in the
 * net's weights. A question is answered by neural recall — seed from a keyword
 * and let the network generate from what it learned. Adding documents retrains
 * the net; with or without new material, answers come from the weights, not a
 * document search. (It's baby-level, so answers can be imperfect.) */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, A = NSCode.askEngine, R = NSCode.research, LAB = NSCode.neuralLab;
  function el(id) { return document.getElementById(id); }

  var state = Object.assign({ query: 'タービンとボイラを備える廃棄物発電施設の仕組みは？', temperature: 0.5 },
    NSCode.api.labState('#/ask') || {});
  function persist() { NSCode.api.labState('#/ask', state); }
  var unsub = null;

  function highlight(text, query) {
    var ws = (query.toLowerCase().match(/[a-z0-9]{2,}/g) || []).concat(query.match(/[぀-ヿ一-鿿ｦ-ﾟ]{2,}/g) || []);
    var html = C.esc(text);
    ws.forEach(function (w) { html = html.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>'); });
    return html;
  }

  NSCode.registerView({
    route: '#/ask', module: 'ask', title: 'Ask (Neural)',
    render: function () {
      return C.PageHeader({ title: '🍼 Ask the baby', purpose: '文書をニューラルネットに学習させ、その重みから質問に回答（RAG検索ではなく神経回路の記憶）' }) +
        C.Panel({ title: '1. 知識を学習させる（任意）', hint: '文書は保存されず、ニューラルネットの重みに取り込まれます（ファイル一覧は持ちません）',
          body:
            '<textarea id="docText" class="ns-input" rows="4" placeholder="覚えさせたい文章を貼り付け…（例：運転手順書 / トラブル報告書 / 仕様書）"></textarea>' +
            '<div class="ns-actions">' +
              '<button id="addDoc" class="ns-btn">学習させる</button>' +
              '<label class="ns-btn ns-btn--ghost" style="cursor:pointer">ファイルで学習<input id="docFile" type="file" accept=".txt,.md,.pdf,text/plain,application/pdf" multiple hidden></label>' +
              '<button id="resetDocs" class="ns-btn ns-btn--ghost">既定の知識に戻す</button>' +
            '</div>' +
            '<div id="docStatus" class="ns-empty__hint"></div>' }) +
        C.Panel({ title: '2. 質問する', hint: '質問のキーワードからニューラルネットが記憶を引き出して回答を生成',
          body:
            '<div class="ns-qa-bar"><input id="askQ" class="ns-input" value="' + C.esc(state.query) + '">' +
            '<button id="askBtn" class="ns-btn">回答</button>' +
            '<button id="askRegen" class="ns-btn ns-btn--ghost">別の回答</button></div>' +
            C.Controls([
              { label: '温度 Temperature: <b id="askTv">' + state.temperature + '</b>', control: '<input id="askT" class="ns-range" type="range" min="0.2" max="1.0" step="0.05" value="' + state.temperature + '">' }
            ]) }) +
        C.Panel({ title: '3. 回答（ニューラルネットが生成）', hint: '極小ニューラルネット（赤ちゃん級）の記憶からの生成のため、不完全なことがあります',
          body: '<div id="askAns"></div>' }) +
        C.Panel({ title: 'このニューラルについて', body: '<div id="askModel"></div>' });
    },
    onMount: function () {
      el('addDoc').addEventListener('click', function () {
        var t = el('docText').value.trim(); if (!t) return;
        var docs = A.getDocs(); docs.push({ name: 'mem' + (docs.length + 1), text: t }); A.setDocs(docs);
        el('docText').value = ''; setStatus('学習中… ニューラルネットに取り込んでいます。'); LAB.ensure();
      });
      el('resetDocs').addEventListener('click', function () { A.resetDocs(); setStatus('既定の知識に戻しました。再学習します…'); LAB.ensure(); });
      el('docFile').addEventListener('change', function () { handleFiles(this.files); this.value = ''; });
      el('askQ').addEventListener('input', function () { state.query = el('askQ').value; persist(); });
      el('askT').addEventListener('input', function () { state.temperature = +el('askT').value; el('askTv').textContent = state.temperature; persist(); });
      el('askBtn').addEventListener('click', runAsk);
      el('askRegen').addEventListener('click', runAsk);
      el('askQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runAsk(); } });

      if (unsub) unsub();
      unsub = LAB.onChange(function () { renderModel(); runAsk(); });
      LAB.ensure(); renderModel(); runAsk();
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
      A.setDocs(docs); setStatus(docsAdded.filter(Boolean).length + ' 件を学習中… ニューラルネットに取り込んでいます。'); LAB.ensure();
    }).catch(function (e) { setStatus('読み込みエラー: ' + e.message); });
  }

  function runAsk() {
    var out = el('askAns'); if (!out) return;
    var q = (el('askQ') ? el('askQ').value : state.query).trim();
    if (!q) { out.innerHTML = C.EmptyState({ icon: '🍼', message: '質問を入力してください。' }); return; }
    var st = LAB.state;
    if (st.training || !st.model) {
      var p = st.prog || { step: 0, total: (st.opts && st.opts.steps) || 1, loss: 0 };
      var pct = Math.round(100 * p.step / p.total);
      out.innerHTML = '<p class="ns-empty__hint">ニューラルネットを学習中… ' + pct + '%（loss ' + (p.loss ? p.loss.toFixed(3) : '—') + '）。学習が終わると回答します。</p>' +
        '<div class="ns-progress"><div class="ns-progress__fill" style="width:' + pct + '%"></div></div>';
      return;
    }
    var a = LAB.answer(q, { temperature: state.temperature, candidates: 12, maxTokens: 52 });
    if (!a || !a.text) {
      out.innerHTML = '<p class="ns-empty__hint">この質問に対応する記憶が見つかりませんでした。関連する文書を「学習させる」と答えられるようになります。</p>';
      return;
    }
    out.innerHTML =
      '<div class="ns-qa-answer"><div class="ns-qa-answer__label">回答（ニューラルネットの記憶から生成）</div>' +
        '<p class="ns-qa-answer__lead">' + highlight(a.text, q) + '</p>' +
        '<div class="ns-qa-answer__src">起点キーワード: <span class="ns-tag">' + C.esc(a.seed) + '</span>' +
          ' ／ <span class="ns-empty__hint">文書検索（RAG）ではなく、学習済みの重みからの生成です。「別の回答」で別サンプル。</span></div></div>';
  }

  function renderModel() {
    var box = el('askModel'); if (!box) return;
    var st = LAB.state;
    if (st.training) {
      var p = st.prog || { step: 0, total: (st.opts && st.opts.steps) || 1, loss: 0 };
      var pct = Math.round(100 * p.step / p.total);
      box.innerHTML = '<p class="ns-empty__hint">学習中… ' + pct + '%（loss ' + (p.loss ? p.loss.toFixed(3) : '—') + '）</p>' +
        '<div class="ns-progress"><div class="ns-progress__fill" style="width:' + pct + '%"></div></div>';
      return;
    }
    if (!st.model) { box.innerHTML = '<p class="ns-empty__hint">未学習</p>'; return; }
    var m = st.model;
    box.innerHTML = '<p class="ns-empty__hint">構成: 埋め込み(' + m.D + ') → 隠れ層 tanh(' + m.H + ') → softmax(' + m.V + ' 語) ／ ' +
      '重み 約 ' + st.params.toLocaleString() + ' 個 ／ 学習 ' + m.steps.toLocaleString() + ' ステップ ／ loss ' + m.loss.toFixed(3) + '。' +
      'これらの重みが文書の知識を保持しています。中身は <a href="#/neural">Neural Lab</a> で観察できます。</p>';
  }
})(window.NSCode);

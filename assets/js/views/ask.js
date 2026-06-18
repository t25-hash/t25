/* Ask (the baby) — HYBRID chat: search + weights (the Claude-style pipeline).
 * For each question: SEARCH the knowledge base for the relevant chunks, then a
 * small neural net LEARNS just those chunks and GENERATES the answer from its
 * weights. Only retrieved chunks are learned, so it scales to large PDFs.
 *
 * UI: a phone-style chat. The conversation builds up as bubbles and the input is
 * pinned at the bottom. Ask stays focused on 質問→赤ちゃんの回答; the memory summary
 * and the grammar (SML) normalization are published to lastRun and inspected in
 * their own Labs (#/memory, #/grammar). The search 根拠 stay here, folded under
 * each answer, to keep the retrieval transparent. */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, A = NSCode.askEngine, R = NSCode.research;
  function el(id) { return document.getElementById(id); }

  var CHIPS = ['歯車の種類は？', '軸受の選び方は？', '公差とはめあいとは？', 'ねじの緩み止めは？'];
  var MAX_HISTORY = 20;

  var state = Object.assign({ source: 'kb', query: '', temperature: 0.45, history: [] },
    NSCode.api.labState('#/ask') || {});
  if (!Array.isArray(state.history)) state.history = [];
  function persist() { NSCode.api.labState('#/ask', state); }
  var askToken = 0;   // unique id per in-flight answer (each writes its own bubble)

  function highlight(text, query) {
    var ws = (query.toLowerCase().match(/[a-z0-9]{2,}/g) || []).concat(query.match(/[぀-ヿ一-鿿ｦ-ﾟ]{2,}/g) || []);
    var html = C.esc(text);
    ws.forEach(function (w) { html = html.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>'); });
    return html;
  }

  function kbBody() {
    return '<div class="ns-empty__hint">📚 機械工学の教科書 <b>5,809 文書</b>（α機械工学概説 / β設計工学 / γ産業機械）。事前に作った索引で関連文書だけを取り出し、その文脈をニューラルが学習して回答します（初回のみ索引を読み込み・gzip約4MB）。</div>';
  }
  function mineBody() {
    return '<textarea id="docText" class="ns-input" rows="4" placeholder="覚えさせたい文章を貼り付け…（例：技術文書 / 仕様書 / 教科書の記述）"></textarea>' +
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

  /* ---- chat bubbles -------------------------------------------------------- */
  // history entry: { q, a }  where a = { text, source, weak, hits:[{source,score,text,more}] }
  // or, on failure, { q, error }.

  function slimAnswer(a) {
    return {
      text: a.text, source: a.source, weak: !!a.weak,
      hits: (a.hits || []).map(function (h) {
        var t = h.chunk.text || '';
        return { source: h.chunk.source, score: h.score, text: t.slice(0, 200), more: t.length > 200 };
      })
    };
  }

  function citeDetails(q, hits, label) {
    if (!hits || !hits.length) return '';
    var items = hits.map(function (h, i) {
      return '<div class="ns-hit"><div class="ns-hit__head"><span>#' + (i + 1) + ' · ' + C.esc(h.source) + '</span>' +
        '<span class="ns-hit__score">cos ' + (h.score != null ? h.score.toFixed(3) : '—') + '</span></div>' +
        '<p class="ns-hit__text">' + highlight(h.text, q) + (h.more ? '…' : '') + '</p></div>';
    }).join('');
    return '<details class="ns-chat__cite"><summary>' + (label || '根拠を表示') + '（' + hits.length + '件）</summary>' + items + '</details>';
  }

  function botBody(entry) {
    var q = entry.q, a = entry.a;
    if (entry.error) return '<p class="ns-empty__hint">エラー: ' + C.esc(entry.error) + '</p>';
    if (!a || !a.hits || !a.hits.length) {
      return '<p class="ns-empty__hint">関連する知識が見つかりませんでした。上の「知識ベース」で資料を学習させてください。</p>';
    }
    if (a.weak) {
      return '<p class="ns-empty__hint">ご質問に十分一致する記述が知識ベースに見つかりませんでした。語句を具体的にして、もう一度お試しください。</p>' +
        citeDetails(q, a.hits, '検索で近かった候補');
    }
    var html = (a.text
      ? '<p class="ns-qa-answer__lead">' + highlight(a.text, q).replace(/\n/g, '<br>') + '</p>'
      : '<p class="ns-empty__hint">回答を構成できませんでした。</p>');
    if (a.source) html += '<div class="ns-qa-answer__src">出典: <span class="ns-tag">' + C.esc(a.source) + '</span></div>';
    html += citeDetails(q, a.hits);
    html += '<p class="ns-empty__hint ns-chat__links">🧠 要約は <a href="#/memory">Memory Lab</a>／🔧 文法は <a href="#/grammar">Grammar-agent</a> で確認できます。</p>';
    return html;
  }

  function userBubble(q) {
    return '<div class="ns-msg ns-msg--user"><div class="ns-msg__body">' + C.esc(q) + '</div></div>';
  }
  function botBubble(entry, id) {
    return '<div class="ns-msg ns-msg--bot"' + (id ? ' id="' + id + '"' : '') + '>' +
      '<div class="ns-msg__avatar">🍼</div>' +
      '<div class="ns-msg__body">' + botBody(entry) + '</div></div>';
  }
  function pendingBubble(id) {
    return '<div class="ns-msg ns-msg--bot" id="' + id + '">' +
      '<div class="ns-msg__avatar">🍼</div>' +
      '<div class="ns-msg__body">' +
        '<p class="ns-empty__hint ns-msg__thinking">考え中… 関連箇所を検索し、ニューラルが学習しています（0%）</p>' +
        '<div class="ns-progress"><div class="ns-progress__fill" style="width:0%"></div></div>' +
      '</div></div>';
  }

  function welcomeHtml() {
    var chips = CHIPS.map(function (c) { return '<button class="ns-chat__chip" data-q="' + C.esc(c) + '">' + C.esc(c) + '</button>'; }).join('');
    return '<div class="ns-chat__welcome"><div class="ns-msg__avatar">🍼</div>' +
      '<p>こんにちは。機械工学の知識ベースについて質問してください。関連箇所を検索し、赤ちゃんニューラルがその文脈を学習して答えます。</p>' +
      '<div class="ns-chat__chips">' + chips + '</div></div>';
  }

  function logHtml() {
    if (!state.history.length) return welcomeHtml();
    return state.history.map(function (e) { return userBubble(e.q) + botBubble(e); }).join('');
  }

  function scrollBottom() {
    window.requestAnimationFrame(function () { window.scrollTo(0, document.body.scrollHeight); });
  }

  NSCode.registerView({
    route: '#/ask', module: 'ask', title: 'Ask (Hybrid)',
    render: function () {
      var srcSel =
        '<select id="srcSel" class="ns-input">' +
          '<option value="kb"' + (state.source === 'kb' ? ' selected' : '') + '>機械工学 KB（5,809文書）</option>' +
          '<option value="mine"' + (state.source === 'mine' ? ' selected' : '') + '>自分の知識（貼付/PDF）</option></select>';
      return C.PageHeader({ title: '🍼 Ask the baby', purpose: '関連箇所を検索 → その文脈をニューラルが学習して回答（検索＋重み＝Claude型・API不要）' }) +
        '<details class="ns-chat__kb">' +
          '<summary>📚 知識ベース・設定</summary>' +
          C.Controls([{ label: '対象', control: srcSel }]) +
          '<div id="srcArea">' + (state.source === 'kb' ? kbBody() : mineBody()) + '</div>' +
          C.Controls([{ label: '温度 Temperature: <b id="askTv">' + state.temperature + '</b>', control: '<input id="askT" class="ns-range" type="range" min="0.2" max="1.0" step="0.05" value="' + state.temperature + '">' }]) +
          '<p class="ns-empty__hint">重みの様子は <a href="#/neural">Neural Lab</a>、PDFの取り込みは <a href="#/pdf">PDF抽出</a> で。</p>' +
        '</details>' +
        '<div class="ns-chat">' +
          '<div id="chatLog" class="ns-chat__log">' + logHtml() + '</div>' +
          '<div class="ns-chat__composer">' +
            '<input id="askQ" class="ns-input" placeholder="質問を入力…（例：歯車の種類は？）" value="' + C.esc(state.query) + '">' +
            '<button id="askBtn" class="ns-btn">送信</button>' +
            '<button id="askRegen" class="ns-btn ns-btn--ghost" title="直近の質問を再実行">別の回答</button>' +
          '</div>' +
        '</div>';
    },
    onMount: function () {
      el('srcSel').addEventListener('change', function () { state.source = el('srcSel').value; persist(); NSCode.renderCurrent(); });
      if (state.source === 'mine') wireMine();
      el('askQ').addEventListener('input', function () { state.query = el('askQ').value; persist(); });
      el('askT').addEventListener('input', function () { state.temperature = +el('askT').value; el('askTv').textContent = state.temperature; persist(); });
      el('askBtn').addEventListener('click', function () { runAsk(); });
      el('askRegen').addEventListener('click', function () {
        var last = state.history.length ? state.history[state.history.length - 1].q : '';
        runAsk(last || null);
      });
      el('askQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runAsk(); } });
      el('chatLog').addEventListener('click', function (e) {
        var chip = e.target.closest && e.target.closest('.ns-chat__chip');
        if (chip) runAsk(chip.getAttribute('data-q'));
      });
      scrollBottom();
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

  function commit(entry) {
    state.history.push(entry);
    if (state.history.length > MAX_HISTORY) state.history = state.history.slice(-MAX_HISTORY);
    persist();
  }

  // runAsk(qOverride): qOverride present (chip / 別の回答) keeps the input; otherwise
  // the composer's value is used and cleared. Each call writes to its own bubble, so
  // overlapping answers don't clobber one another.
  function runAsk(qOverride) {
    var input = el('askQ'), log = el('chatLog');
    if (!log) return;
    var fromInput = (qOverride == null);
    var q = (fromInput ? (input ? input.value : state.query) : qOverride).trim();
    if (!q) return;
    if (fromInput && input) { input.value = ''; state.query = ''; persist(); }

    var welcome = log.querySelector('.ns-chat__welcome');
    if (welcome) log.innerHTML = '';
    var token = ++askToken, botId = 'askBot' + token;
    log.insertAdjacentHTML('beforeend', userBubble(q));
    log.insertAdjacentHTML('beforeend', pendingBubble(botId));
    scrollBottom();

    var run = state.source === 'kb' ? A.hybridAnswerKB : A.hybridAnswer;
    run(q, {
      temperature: state.temperature,
      onProgress: function (s) {
        var node = el(botId); if (!node) return;
        var pct = Math.round(100 * s.step / s.total);
        var bar = node.querySelector('.ns-progress__fill'), th = node.querySelector('.ns-msg__thinking');
        if (bar) bar.style.width = pct + '%';
        if (th) th.textContent = '考え中… 関連箇所を検索し、ニューラルが学習しています（' + pct + '%）';
      }
    }).then(function (a) {
      var entry = { q: q, a: slimAnswer(a || {}) };
      commit(entry);
      var node = el(botId);
      if (node) { node.innerHTML = '<div class="ns-msg__avatar">🍼</div><div class="ns-msg__body">' + botBody(entry) + '</div>'; }
      scrollBottom();
    }).catch(function (e) {
      var entry = { q: q, error: (e && e.message) ? e.message : String(e) };
      commit(entry);
      var node = el(botId);
      if (node) { node.innerHTML = '<div class="ns-msg__avatar">🍼</div><div class="ns-msg__body">' + botBody(entry) + '</div>'; }
      scrollBottom();
    });
  }
})(window.NSCode);

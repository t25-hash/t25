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

  var state = Object.assign({ source: 'kb', query: '', temperature: 0.45, gen: false, history: [] },
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
  function calcBody() {
    return '<div class="ns-empty__hint">📐 <b>計算式・表レジストリ</b>。どの対象で質問しても、回答が計算式や表に関係する場合は、KB回答のあとに関連する<b>計算式（式名・式・記号説明つき）</b>と<b>表（表形式）</b>を自動で連投します。例：「歯車の強度」「軸受の寿命」「はめあい」「熱伝達率」。</div>';
  }
  function srcBody(src) { return src === 'kb' ? kbBody() : src === 'calc' ? calcBody() : mineBody(); }
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
      text: a.text, source: a.source, weak: !!a.weak, learned: !!a.learned,
      compose: (a.compose || []).slice(0, 8),   // constituent sentences → block on 👎
      hits: (a.hits || []).map(function (h) {
        var t = h.chunk.text || '';
        return { source: h.chunk.source, score: h.score, text: t.slice(0, 200), more: t.length > 200 };
      })
    };
  }

  /* 👍/👎 row + learned tag. Only meaningful for a real (non-weak) answer. */
  function feedbackRow(entry) {
    if (!NSCode.feedback || !entry.a || entry.a.weak || entry.error || !entry.a.text) return '';
    var fb = entry.feedback && entry.feedback.label;
    var id = entry.id == null ? '' : entry.id;
    function btn(label, icon, txt) {
      return '<button class="ns-feedback__btn' + (fb === label ? ' is-active is-' + label : '') + '"' +
        ' data-fb="' + label + '" data-fb-id="' + id + '" title="' + txt + '">' + icon + '</button>';
    }
    var note = fb ? '<span class="ns-feedback__note">' + (fb === 'good' ? '👍 学習しました' : '👎 学習しました（別の回答を生成）') + '</span>' : '';
    return '<div class="ns-feedback">' + btn('good', '👍', '意図に沿う回答') + btn('bad', '👎', '意図に沿わない（別回答を再生成）') + note + '</div>';
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
    // 抽出回答は grammar agent の正規化文を優先表示（複文は normalize 側で原文保持）。
    // 表示直前に tidy で PDF 由来ノイズ（表のローマ数字連・重複・先頭断片）を除去。
    var shown = a.normalized || a.text;
    if (shown && NSCode.grammar && NSCode.grammar.tidy) shown = NSCode.grammar.tidy(shown);
    var html;
    if (a.gentext) {   // abstractive answer (in-browser LLM), grounded on the same hits
      html = '<p class="ns-qa-answer__lead">' + highlight(a.gentext, q).replace(/\n/g, '<br>') +
        ' <span class="ns-msg__learned ns-msg__gen">生成</span>' + (a.learned ? ' <span class="ns-msg__learned">学習済み</span>' : '') + '</p>';
      if (shown) html += '<details class="ns-chat__cite"><summary>抽出（参考）</summary><p class="ns-hit__text">' + highlight(shown, q).replace(/\n/g, '<br>') + '</p></details>';
    } else if (a.genPending) {
      html = '<p class="ns-empty__hint ns-msg__thinking">抽象生成中…（ブラウザ内LLM）</p>' +
        '<p class="ns-qa-answer__lead">' + highlight(shown || '', q).replace(/\n/g, '<br>') + (a.learned ? ' <span class="ns-msg__learned">学習済み</span>' : '') + '</p>';
    } else {
      html = (shown
        ? '<p class="ns-qa-answer__lead">' + highlight(shown, q).replace(/\n/g, '<br>') + (a.learned ? ' <span class="ns-msg__learned">学習済み</span>' : '') + '</p>'
        : '<p class="ns-empty__hint">回答を構成できませんでした。</p>');
    }
    if (a.genNote) html += '<p class="ns-empty__hint">' + C.esc(a.genNote) + '</p>';
    if (a.source) html += '<div class="ns-qa-answer__src">出典: <span class="ns-tag">' + C.esc(a.source) + '</span></div>';
    html += feedbackRow(entry);
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
  /* ---- 計算式・表の連投（KB回答後に NSCode.calc へ「引っ掛かった」ら） ---------- */
  function formulaBubble(f) {
    var syms = f.where.map(function (w) {
      return '<li><code>' + C.esc(w.sym) + '</code>：' + C.esc(w.desc) + '</li>';
    }).join('');
    return '<div class="ns-msg ns-msg--bot ns-msg--calc">' +
      '<div class="ns-msg__avatar">📐</div>' +
      '<div class="ns-msg__body">' +
        '<div class="ns-calc__name">【式】' + C.esc(f.name) + '</div>' +
        '<div class="ns-calc__expr">' + C.esc(f.expr) + '</div>' +
        '<div class="ns-calc__where"><span class="ns-calc__label">記号</span><ul class="ns-calc__syms">' + syms + '</ul></div>' +
      '</div></div>';
  }
  function tableBubble(t) {
    return '<div class="ns-msg ns-msg--bot ns-msg--calc">' +
      '<div class="ns-msg__avatar">📊</div>' +
      '<div class="ns-msg__body">' +
        '<div class="ns-calc__name">【表】' + C.esc(t.name) + '</div>' +
        C.Table(t.headers, t.rows) +
      '</div></div>';
  }
  // follow-up bubbles for one answered question (empty unless the question hooks
  // into the calc registry). Formulas first (式名＋式＋記号説明), then tables (表形式).
  function extrasHtml(q) {
    if (!NSCode.calc) return '';
    var r = NSCode.calc.lookup(q);
    if (!r.formulas.length && !r.tables.length) return '';
    return r.formulas.map(formulaBubble).join('') + r.tables.map(tableBubble).join('');
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
    return state.history.map(function (e) {
      var extras = (e.a && !e.a.weak && !e.error) ? extrasHtml(e.q) : '';
      return userBubble(e.q) + botBubble(e) + extras;
    }).join('');
  }

  function scrollBottom() {
    window.requestAnimationFrame(function () { window.scrollTo(0, document.body.scrollHeight); });
  }

  /* 🎓 collapsible learning-status panel: what good/bad grading has taught so far */
  function trainPanel() {
    if (!NSCode.feedback) return '';
    var s = NSCode.feedback.stats();
    var terms = s.learnedTerms.length
      ? s.learnedTerms.map(function (t) { return '<span class="ns-tag">' + C.esc(t.term) + ' ×' + t.weight + '</span>'; }).join(' ')
      : '<span class="ns-empty__hint">まだありません</span>';
    var model = s.model ? ('steps ' + s.model.steps + ' / loss ' + s.model.loss + ' / 語彙 ' + s.model.vocab) : 'まだ学習していません';
    return '<details class="ns-chat__kb ns-train">' +
      '<summary>🎓 学習状況（👍 ' + s.good + ' / 👎 ' + s.bad + '）</summary>' +
      '<p class="ns-empty__hint">good/bad の評価で「検索の重み・回避する回答・育つニューラル」を更新します（端末内・外部APIなし）。</p>' +
      '<div class="ns-train__row"><b>学習した語</b><div>' + terms + '</div></div>' +
      '<div class="ns-train__row"><b>記憶した回答</b> ' + s.accepted + ' 件 ／ <b>回避登録</b> ' + s.blockedQ + ' 問</div>' +
      '<div class="ns-train__row"><b>育つニューラル</b> ' + model + '</div>' +
      '<button id="fbReset" class="ns-btn ns-btn--ghost">学習をリセット</button>' +
      '</details>';
  }

  /* re-render one bot bubble's body in place (by its live DOM id) */
  function rerenderBubble(botId, entry) {
    var node = el(botId); if (!node) return;
    node.innerHTML = '<div class="ns-msg__avatar">🍼</div><div class="ns-msg__body">' + botBody(entry) + '</div>';
  }

  /* abstractive pass (optional): rewrite the answer with the in-browser LLM,
   * grounded on the SAME retrieved passages. Pure augmentation — on any failure
   * (no WebGPU / weights not vendored / error) the extractive answer stays. */
  function maybeGenerate(entry, botId) {
    if (!state.gen || !NSCode.sml || !entry.a || entry.a.weak || entry.error || !entry.a.hits || !entry.a.hits.length) return;
    entry.a.genPending = true; rerenderBubble(botId, entry); scrollBottom();
    // Feed the CURATED, on-target content (the same the extractive answer draws on —
    // selected intent sentence, composed lines, context memo) to generation FIRST,
    // then the raw retrieved chunks. Otherwise generation is limited to raw chunks
    // (often mid-sentence fragments) and reads thin/off-target.
    var seeds = [];
    if (entry.a.text) seeds.push(entry.a.text);
    if (entry.a.compose && entry.a.compose.length) seeds = seeds.concat(entry.a.compose);
    if (entry.a.memo) seeds.push(entry.a.memo);
    var ctx = seeds.concat(entry.a.hits.map(function (h) { return h.text; }));
    // in-house SML grounded (copy-constrained) generation: on-device, no external
    // model, no WebGPU. The extractive answer (entry.a.text) stays as 参考/fallback.
    NSCode.sml.groundedAnswer(entry.q, ctx, { temperature: state.temperature, seeds: seeds }).then(function (txt) {
      entry.a.genPending = false;
      if (txt) {
        // Grammar Compiler Layer も生成回答に適用（抽出と同じく文法正規化を通す）。
        // 失敗・未ロード時は生成生文をそのまま使う（破壊しない）。
        var g = NSCode.grammar ? NSCode.grammar.normalize(txt) : null;
        entry.a.gentext = (g && g.text) ? g.text : txt;
        entry.a.gensml = g ? g.sentences : null;   // Lab/デバッグ用に SML 分解を保持
        persist();
      }
      else { entry.a.genNote = '※ 生成を構成できなかったため抽出で回答します'; }
      rerenderBubble(botId, entry); scrollBottom();
    }).catch(function (e) {
      entry.a.genPending = false; entry.a.genNote = '※ 生成に失敗したため抽出で回答（' + (e && e.message ? e.message : e) + '）';
      rerenderBubble(botId, entry);
    });
  }

  /* a 👍/👎 click: persist the grade, update the row, and on 👎 auto-regenerate */
  function onFeedback(btn) {
    if (!NSCode.feedback) return;
    var label = btn.getAttribute('data-fb'), id = +btn.getAttribute('data-fb-id'), entry = null;
    for (var i = 0; i < state.history.length; i++) if (state.history[i].id === id) { entry = state.history[i]; break; }
    if (!entry || (entry.feedback && entry.feedback.label)) return;   // grade once per answer
    entry.feedback = { label: label, ts: Date.now() };
    persist();
    var row = btn.closest && btn.closest('.ns-feedback'); if (row) row.outerHTML = feedbackRow(entry);
    NSCode.feedback.record(entry.q, entry.a, label);   // good: also trains the persistent net (async)
    if (label === 'bad') runAsk(entry.q, { noRecall: true });   // immediately try a different answer
  }

  NSCode.registerView({
    route: '#/ask', module: 'ask', title: 'Ask (Hybrid)',
    render: function () {
      var srcSel =
        '<select id="srcSel" class="ns-input">' +
          '<option value="kb"' + (state.source === 'kb' ? ' selected' : '') + '>機械工学 KB（5,809文書）</option>' +
          '<option value="calc"' + (state.source === 'calc' ? ' selected' : '') + '>計算式・表 DB（281章）</option>' +
          '<option value="mine"' + (state.source === 'mine' ? ' selected' : '') + '>自分の知識（貼付/PDF）</option></select>';
      return C.PageHeader({ title: '🍼 Ask the baby', purpose: '関連箇所を検索 → その文脈をニューラルが学習して回答（検索＋重み＝Claude型・API不要）' }) +
        '<details class="ns-chat__kb">' +
          '<summary>📚 知識ベース・設定</summary>' +
          C.Controls([{ label: '対象', control: srcSel }]) +
          '<div id="srcArea">' + srcBody(state.source) + '</div>' +
          C.Controls([{ label: '温度 Temperature: <b id="askTv">' + state.temperature + '</b>', control: '<input id="askT" class="ns-range" type="range" min="0.2" max="1.0" step="0.05" value="' + state.temperature + '">' }]) +
          C.Controls([{ label: '回答モード', control:
            '<label class="ns-switch"><input id="askGen" type="checkbox"' + (state.gen ? ' checked' : '') + '> ' +
            (state.gen ? '<b>🧠 抽象生成（自前SML・接地制約・実験）</b>' : '<b>📑 抽出（既定・推奨）</b>') +
            '</label>' }]) +
          '<p class="ns-empty__hint">OFF＝従来どおり<b>根拠の実文を抽出</b>（安定）。ON＝検索した根拠に縛って<b>自前SMLが言い換え生成</b>（端末内・外部API/重み/WebGPU不要、抽出も「参考」併記）。<b>※実験：</b>幻覚はしません（根拠語のみ）が、現状は文章がまだ拙いことがあります。使うほど（学習・👍/👎）改善します。</p>' +
          '<p class="ns-empty__hint">重みの様子は <a href="#/neural">Neural Lab</a>、PDFの取り込みは <a href="#/pdf">PDF抽出</a> で。</p>' +
        '</details>' +
        trainPanel() +
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
      // grammar agent を kuromoji 形態素解析で段階的に強化（非ブロッキング・端末内）。
      // 失敗（vendor 未配置など）時は従来のルール解析にフォールバック。
      if (NSCode.grammar && NSCode.grammar.initKuromoji) NSCode.grammar.initKuromoji().catch(function () {});
      el('srcSel').addEventListener('change', function () { state.source = el('srcSel').value; persist(); NSCode.renderCurrent(); });
      if (state.source === 'mine') wireMine();
      el('askQ').addEventListener('input', function () { state.query = el('askQ').value; persist(); });
      el('askT').addEventListener('input', function () { state.temperature = +el('askT').value; el('askTv').textContent = state.temperature; persist(); });
      var gen = el('askGen');
      if (gen) gen.addEventListener('change', function () { state.gen = gen.checked; persist(); });
      el('askBtn').addEventListener('click', function () { runAsk(); });
      el('askRegen').addEventListener('click', function () {
        var last = state.history.length ? state.history[state.history.length - 1].q : '';
        runAsk(last || null, { noRecall: true });   // force a fresh (non-recalled) answer
      });
      el('askQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runAsk(); } });
      el('chatLog').addEventListener('click', function (e) {
        var fbtn = e.target.closest && e.target.closest('.ns-feedback__btn');
        if (fbtn) { onFeedback(fbtn); return; }
        var chip = e.target.closest && e.target.closest('.ns-chat__chip');
        if (chip) runAsk(chip.getAttribute('data-q'));
      });
      var rst = el('fbReset');
      if (rst) rst.addEventListener('click', function () {
        if (NSCode.feedback && window.confirm('学習内容（評価・重み・記憶・育てたニューラル）をすべて消去します。よろしいですか？')) {
          NSCode.feedback.reset(); NSCode.renderCurrent();
        }
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
    if (entry.id == null) { state.seq = (state.seq || 0) + 1; entry.id = state.seq; }
    state.history.push(entry);
    if (state.history.length > MAX_HISTORY) state.history = state.history.slice(-MAX_HISTORY);
    persist();
  }

  // runAsk(qOverride): qOverride present (chip / 別の回答) keeps the input; otherwise
  // the composer's value is used and cleared. Each call writes to its own bubble, so
  // overlapping answers don't clobber one another.
  function runAsk(qOverride, runOpts) {
    runOpts = runOpts || {};
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

    var prebuilt = state.source === 'kb' || state.source === 'calc';   // prebuilt stores: KB or 計算式・表DB
    var run = prebuilt ? A.hybridAnswerKB : A.hybridAnswer;
    run(q, {
      store: state.source,
      noRecall: !!runOpts.noRecall,   // 👎 regenerate: skip the vetted-answer shortcut
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
      if (node) {
        node.innerHTML = '<div class="ns-msg__avatar">🍼</div><div class="ns-msg__body">' + botBody(entry) + '</div>';
        // 連投: if the question hooks into the calc registry, post the related
        // formulas (式名＋式＋記号説明) and tables (表形式) as follow-up bubbles.
        var ex = (entry.a && !entry.a.weak && !entry.error) ? extrasHtml(q) : '';
        if (ex) node.insertAdjacentHTML('afterend', ex);
      }
      scrollBottom();
      maybeGenerate(entry, botId);   // optional in-browser abstractive rewrite (gated)
    }).catch(function (e) {
      var entry = { q: q, error: (e && e.message) ? e.message : String(e) };
      commit(entry);
      var node = el(botId);
      if (node) { node.innerHTML = '<div class="ns-msg__avatar">🍼</div><div class="ns-msg__body">' + botBody(entry) + '</div>'; }
      scrollBottom();
    });
  }
})(window.NSCode);

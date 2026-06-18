/* Neural Lab — explains the in-browser neural network, lets you ADD training
 * data (which retrains it), and at the bottom shows Ask's ACTUAL base neural
 * model (NSCode.neuralLab) as it really is: live loss, real weight counts, the
 * softmax distribution, embedding values, and generation. */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, A = NSCode.askEngine, NLM = NSCode.neuralLM, LAB = NSCode.neuralLab;
  function el(id) { return document.getElementById(id); }

  var unsub = null, autoFilled = false, pendingReplace = false;

  /* dynamic defaults (no hardcoded sample words): prefer the latest Ask question,
   * else the most frequent multi-char subword the model actually learned — so the
   * seed/context always match whatever corpus is loaded and generation works. */
  function corpusToken() {
    var m = LAB.state.model;
    if (m && m.vocab && m.vocab.itos) {
      var cand = m.vocab.itos.filter(function (t) { return t && t.length >= 2 && /[぀-ヿ一-鿿]/.test(t); });
      if (cand.length) return cand[0];
      for (var i = 1; i < m.vocab.itos.length; i++) { if (m.vocab.itos[i] && m.vocab.itos[i] !== '\n') return m.vocab.itos[i]; }
    }
    return '';
  }
  function askQuery() {
    var r = NSCode.lastRun && NSCode.lastRun.get();
    return (r && r.query) ? r.query : '';
  }
  function defaultSeed() { return askQuery() || corpusToken(); }
  function defaultCtx() {
    var q = askQuery(), m = LAB.state.model;
    if (q && m) { var enc = NLM.encode(m, q); if (enc.length) return m.vocab.itos[enc[0]] || corpusToken(); }
    return corpusToken();
  }
  function fillSeedDefaults() {
    var s = el('nlSeed'); if (s && !s.value.trim()) s.value = defaultSeed();
    var c = el('nlCtx'); if (c && !c.value.trim()) c.value = defaultCtx();
  }

  var EXPLAIN =
    '<p class="ns-lesson">ニューラルネットは、入力を数値ベクトルに変換し、重み付き和と非線形関数を重ねて出力を計算する仕組みです。ここで動くのは、文章の「次のトークン」を予測する小さな<b>ニューラル言語モデル</b>です。トークンはコーパスから自動学習した<b>サブワード</b>（よく出る語のまとまり：「機械」「歯車」「軸受」など）で、文字単位より自然な日本語を生成できます（端末内学習・DL なし）。</p>' +
    '<pre class="ns-code">前の C 個のトークン\n' +
    '   │  ① 埋め込み（各トークン → ベクトル）\n' +
    '   ▼\n' +
    ' 連結ベクトル x\n' +
    '   │  ② 隠れ層  h = tanh(W1·x + b1)\n' +
    '   ▼\n' +
    ' 隠れ表現 h\n' +
    '   │  ③ 出力層  logits = W2·h + b2\n' +
    '   ▼\n' +
    ' softmax → 次トークンの確率分布</pre>' +
    '<p class="ns-lesson">学習では、正解トークンの確率が上がるように、誤差（クロスエントロピー）を<b>逆伝播</b>して重み W1・W2 と埋め込みを少しずつ更新します（勾配降下／SGD）。これを何千回も繰り返すと loss が下がり、文章を生成できるようになります。</p>' +
    '<p class="ns-empty__hint">n-gram（数え上げ）と違い、こちらは<b>重みを学習する本物のニューラルネット</b>です。規模は赤ちゃん級なので生成は素朴ですが、中で起きていることは実機と同じです。</p>';

  var ADD =
    '<p class="ns-lesson">このモデルは Ask と同じナレッジベース（文書）から学習します。文章を追加すると KB に文書が増え、モデルを<b>再学習</b>します。</p>' +
    '<textarea id="nlAddText" class="ns-input" rows="4" placeholder="学習させたい文章を貼り付け…（例：技術文書 / 教科書の記述 / 仕様）"></textarea>' +
    '<div class="ns-actions">' +
      '<button id="nlAdd" class="ns-btn">学習データに追加して再学習</button>' +
      '<button id="nlReset" class="ns-btn ns-btn--ghost">サンプルに戻す</button>' +
    '</div>' +
    '<div id="nlAddStatus" class="ns-empty__hint"></div>' +
    '<div id="nlKb"></div>';

  var ZIP =
    '<p class="ns-lesson">フォルダごと ZIP にまとめた <b>Markdown(.md)</b> を渡すと、<b>階層（フォルダ構成）を保ったまま</b>一括で学習データに取り込みます。各ファイルのパスがそのまま出典名になり、フォルダ名は見出しとして本文先頭に付くので、モデルは<b>階層の文脈ごと</b>学習します。</p>' +
    '<div class="ns-actions">' +
      '<label id="nlZipPick" class="ns-btn" style="cursor:pointer">ZIP を選ぶ（.md を一括）<input id="nlZip" type="file" accept=".zip,application/zip,application/x-zip-compressed" hidden></label>' +
      '<button id="nlZipReplace" class="ns-btn ns-btn--ghost" title="既存のサンプル文書を消してから取り込みます">サンプルを消して取り込む</button>' +
    '</div>' +
    '<p class="ns-empty__hint">端末内だけで展開します（外部送信なし）。対応: 無圧縮 / DEFLATE。暗号化・ZIP64 は非対応。.md / .markdown 以外は自動でスキップします。</p>' +
    '<div id="nlZipStatus" class="ns-empty__hint"></div>' +
    '<div id="nlZipTree"></div>';

  function hyperBody() {
    var o = LAB.state.opts;
    return C.Controls([
      { label: '学習ステップ: <b id="nlStepsV">' + o.steps + '</b>', control: '<input id="nlSteps" class="ns-range" type="range" min="2000" max="30000" step="1000" value="' + o.steps + '">' },
      { label: '学習率 lr: <b id="nlLrV">' + o.lr + '</b>', control: '<input id="nlLr" class="ns-range" type="range" min="0.05" max="0.30" step="0.01" value="' + o.lr + '">' },
      { label: '隠れ層ユニット H: <b id="nlHidV">' + o.hidden + '</b>', control: '<input id="nlHid" class="ns-range" type="range" min="16" max="96" step="8" value="' + o.hidden + '">' }
    ]) + '<div class="ns-actions"><button id="nlRetrain" class="ns-btn">この設定で再学習</button></div>' +
      '<p class="ns-empty__hint">ステップや隠れ層を増やすと loss は下がりやすくなりますが、学習時間は延びます（端末内で実行）。</p>';
  }

  var LIVE =
    '<p class="ns-lesson">下は Ask が回答生成に使っている<b>実物のニューラルネット</b>です。学習の進み（loss）と内部の数値をそのまま表示します。</p>' +
    '<div id="nlProg"></div>' +
    '<div id="nlStats"></div>' +
    '<p class="ns-lesson" style="margin-top:16px"><b>① このモデルで生成する</b></p>' +
    '<div class="ns-qa-bar"><input id="nlSeed" class="ns-input" placeholder="生成の起点（コーパス/質問から自動）"><button id="nlGen" class="ns-btn">生成</button></div>' +
    '<div id="nlGenOut"></div>' +
    '<p class="ns-lesson" style="margin-top:16px"><b>② 次トークンの確率（softmax の実値）</b></p>' +
    '<div class="ns-qa-bar"><input id="nlCtx" class="ns-input" placeholder="文脈トークン（コーパス/質問から自動）"><button id="nlProbBtn" class="ns-btn ns-btn--ghost">予測</button></div>' +
    '<div id="nlProbOut"></div>' +
    '<p class="ns-lesson" style="margin-top:16px"><b>③ 埋め込みの実値（学習で得たベクトル）</b></p>' +
    '<div id="nlEmbOut"></div>';

  NSCode.registerView({
    route: '#/neural', module: 'neural', title: 'Neural Lab',
    render: function () {
      return C.PageHeader({ title: '🧠 Neural Lab', purpose: 'Ask のベースになる極小ニューラルネットを学習・観察する' }) +
        C.Panel({ title: 'ニューラルネットとは', body: EXPLAIN }) +
        C.Panel({ title: '学習データを追加して再学習', hint: 'Ask と共通のナレッジベースに文書を足してモデルを学習させる', body: ADD }) +
        C.Panel({ title: 'ZIP（.md 一括）から階層ごと学習', hint: 'フォルダ構成を保ったまま Markdown をまとめて取り込む', body: ZIP }) +
        C.Panel({ title: '学習設定（ハイパーパラメータ）', body: hyperBody() }) +
        C.Panel({ title: '学習マップ（サブワード埋め込みの2D投影）', hint: 'KB から学んだトークンを意味の近さで配置（PCA）。近いほど使われ方が似ている',
          body: '<div id="nlMap"></div><div id="nlSubs"></div>' }) +
        C.Panel({ title: 'Ask のベースニューラル（実物）', hint: 'いま動いているモデルの中身をそのまま表示', body: LIVE });
    },
    onMount: function () {
      renderKb();

      el('nlAdd').addEventListener('click', function () {
        var t = el('nlAddText').value.trim(); if (!t) return;
        var docs = A.getDocs(); docs.push({ name: '追加テキスト' + (docs.length + 1), text: t }); A.setDocs(docs);
        el('nlAddText').value = ''; renderKb();
        setAddStatus('学習データに追加しました。再学習します…');
        LAB.ensure();   // KB changed -> retrains
      });
      el('nlReset').addEventListener('click', function () {
        A.resetDocs(); renderKb(); setAddStatus('サンプルのナレッジベースに戻しました。再学習します…'); LAB.ensure();
      });

      el('nlZip').addEventListener('change', function () {
        if (this.files && this.files[0]) importZip(this.files[0], pendingReplace);
        pendingReplace = false; this.value = '';
      });
      el('nlZipPick').addEventListener('click', function () { pendingReplace = false; });
      el('nlZipReplace').addEventListener('click', function () {
        pendingReplace = true; el('nlZip').click();
      });

      bindRange('nlSteps', 'nlStepsV', function (v) { return v; });
      bindRange('nlLr', 'nlLrV', function (v) { return v; });
      bindRange('nlHid', 'nlHidV', function (v) { return v; });
      el('nlRetrain').addEventListener('click', function () {
        setAddStatus('新しい設定で再学習します…');
        LAB.retrain({ steps: +el('nlSteps').value, lr: +el('nlLr').value, hidden: +el('nlHid').value });
      });

      el('nlGen').addEventListener('click', renderGen);
      el('nlSeed').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); renderGen(); } });
      el('nlProbBtn').addEventListener('click', renderProbs);
      el('nlCtx').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); renderProbs(); } });

      if (unsub) unsub();
      unsub = LAB.onChange(onLab);
      LAB.ensure();              // train if not already
      onLab();                   // paint current state immediately
    }
  });

  function onLab() {
    renderProg(); renderStats();
    var st = LAB.state;
    if (st.training) { autoFilled = false; return; }
    if (st.model && !autoFilled) { autoFilled = true; fillSeedDefaults(); renderGen(); renderProbs(); renderEmb(); renderMap(); }
  }

  function renderMap() {
    var box = el('nlMap'); if (!box) return;
    var m = LAB.state.model; if (!m) { box.innerHTML = ''; return; }
    var pts = NSCode.neuralLM.embedMap(m, { max: 64 });
    if (!pts.length) { box.innerHTML = '<p class="ns-empty__hint">トークンが少なく投影できません。</p>'; return; }
    var maxF = pts.reduce(function (a, p) { return Math.max(a, p.freq); }, 1);
    var labels = {}; pts.slice().sort(function (a, b) { return b.freq - a.freq; }).slice(0, 36).forEach(function (p) { labels[p.tok] = 1; });
    var svg = pts.map(function (p) {
      var cx = (3 + p.nx * 94).toFixed(1), cy = (3 + (1 - p.ny) * 94).toFixed(1);
      var r = (0.7 + 1.8 * Math.log(1 + p.freq) / Math.log(1 + maxF)).toFixed(2);
      var dot = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="var(--accent)" opacity="0.55"/>';
      var lab = labels[p.tok] ? '<text x="' + (+cx + +r + 0.4).toFixed(1) + '" y="' + cy + '" font-size="2.1" fill="var(--text)" dominant-baseline="middle">' + C.esc(p.tok === '\n' ? '⏎' : p.tok) + '</text>' : '';
      return dot + lab;
    }).join('');
    box.innerHTML = '<svg viewBox="0 0 100 100" style="width:100%;height:auto;background:var(--surface-2);border-radius:8px;border:1px solid var(--border)">' + svg + '</svg>' +
      '<p class="ns-empty__hint">点＝学習したトークン（サブワード）。位置は埋め込みベクトルの主成分2軸への投影で、近いほど使われ方が似ています。大きい点ほど高頻度。</p>';
    var subs = el('nlSubs');
    if (subs) {
      var sw = m.vocab.itos.filter(function (t) { return t.length >= 2 && /[぀-ヿ一-鿿]/.test(t); }).slice(0, 40);
      subs.innerHTML = '<p class="ns-empty__hint" style="margin-top:10px">学習したサブワード（' + ((m.merges && m.merges.length) || 0) + ' 回マージ・頻度順）:</p>' +
        sw.map(function (t) { return '<span class="ns-tag">' + C.esc(t) + '</span>'; }).join(' ');
    }
  }

  function setAddStatus(m) { var s = el('nlAddStatus'); if (s) s.textContent = m || ''; }
  function setZipStatus(m) { var s = el('nlZipStatus'); if (s) s.textContent = m || ''; }

  function isMd(path) { return /\.(md|markdown)$/i.test(path); }
  function ignored(path) {
    // macOS が ZIP に混ぜるメタデータを除外
    return /(^|\/)__MACOSX\//.test(path) || /(^|\/)\._/.test(path) || /(^|\/)\.DS_Store$/i.test(path);
  }
  // パス（フォルダ階層）を Markdown 見出しに変換して本文先頭へ付与
  function breadcrumbHeading(path) {
    return '# ' + path.replace(/\.(md|markdown)$/i, '').split('/').join(' / ');
  }
  // 軽い正規化：改行を統一し NFKC するが、段落（空行）は保持する
  function normalizeMd(raw) {
    var t = String(raw || '').replace(/\r\n?/g, '\n');
    try { t = t.normalize('NFKC'); } catch (e) {}
    return t.replace(/\n{3,}/g, '\n\n').trim();
  }

  function importZip(file, replace) {
    setZipStatus('「' + file.name + '」を端末内で展開中…');
    el('nlZipTree').innerHTML = '';
    var reader = new FileReader();
    reader.onerror = function () { setZipStatus('ファイルを読み込めませんでした。'); };
    reader.onload = function () {
      var entries;
      try { entries = NSCode.unzip(reader.result); }
      catch (e) { setZipStatus('ZIP を展開できませんでした: ' + (e && e.message ? e.message : e)); return; }

      var mds = entries.filter(function (e) { return isMd(e.path) && !ignored(e.path) && e.text.trim(); })
        .sort(function (a, b) { return a.path < b.path ? -1 : a.path > b.path ? 1 : 0; });
      if (!mds.length) {
        setZipStatus('ZIP 内に学習できる .md / .markdown が見つかりませんでした（' + entries.length + ' エントリを確認）。');
        return;
      }

      // 既存 KB に統合（同じパス名は置き換え）。replace 指定なら空から作る。
      var docs = replace ? [] : A.getDocs();
      var byName = {}; docs.forEach(function (d, i) { byName[d.name] = i; });
      var added = 0, updated = 0, chars = 0;
      mds.forEach(function (e) {
        var text = breadcrumbHeading(e.path) + '\n\n' + normalizeMd(e.text);
        chars += text.length;
        var doc = { name: e.path, text: text };
        if (Object.prototype.hasOwnProperty.call(byName, e.path)) { docs[byName[e.path]] = doc; updated++; }
        else { byName[e.path] = docs.length; docs.push(doc); added++; }
      });
      A.setDocs(docs);
      renderKb();
      el('nlZipTree').innerHTML = renderZipTree(mds.map(function (e) { return e.path; }));
      setZipStatus((replace ? 'サンプルを置き換えて ' : '') + mds.length + ' 件の Markdown を階層ごと取り込みました'
        + '（新規 ' + added + ' / 更新 ' + updated + ' ／ 計 ' + chars.toLocaleString() + ' 字）。再学習します…');
      LAB.ensure();   // KB が変わったので再学習
    };
    reader.readAsArrayBuffer(file);
  }

  // 取り込んだファイル群をフォルダ階層のツリーとして描画
  function renderZipTree(paths) {
    var root = {};
    paths.forEach(function (p) {
      var parts = p.split('/'), node = root;
      parts.forEach(function (part, i) {
        var leaf = i === parts.length - 1;
        node[part] = node[part] || { __leaf: leaf, children: {} };
        node = node[part].children;
      });
    });
    function walk(node, depth) {
      return Object.keys(node).sort().map(function (k) {
        var info = node[k], pad = '';
        for (var i = 0; i < depth; i++) pad += '  ';
        var icon = info.__leaf ? '📄 ' : '📁 ';
        return pad + icon + C.esc(k) + '\n' + walk(info.children, depth + 1);
      }).join('');
    }
    return '<p class="ns-empty__hint">取り込んだ階層構成（' + paths.length + ' ファイル）:</p>' +
      '<pre class="ns-code">' + walk(root, 0).replace(/\n+$/,'') + '</pre>';
  }

  function bindRange(id, valId, fmt) {
    var r = el(id); if (!r) return;
    r.addEventListener('input', function () { var v = el(valId); if (v) v.textContent = fmt(r.value); });
  }

  function renderKb() {
    var box = el('nlKb'); if (!box) return;
    var docs = A.getDocs();
    box.innerHTML = '<p class="ns-empty__hint">学習データ: ' + docs.length + ' 文書（Ask と共通）</p>';
  }

  function renderProg() {
    var box = el('nlProg'); if (!box) return;
    var st = LAB.state;
    if (st.training) {
      var p = st.prog || { step: 0, total: st.opts.steps, loss: 0 };
      var pct = Math.round(100 * p.step / p.total);
      box.innerHTML = '<p class="ns-empty__hint">学習中… ' + pct + '%（loss ' + (p.loss ? p.loss.toFixed(3) : '—') + '）勾配降下で重みを更新しています。</p>' +
        '<div class="ns-progress"><div class="ns-progress__fill" style="width:' + pct + '%"></div></div>';
    } else if (st.model) {
      box.innerHTML = '<p class="ns-empty__hint">学習完了 — 最終 loss <b>' + st.model.loss.toFixed(3) + '</b> / ' + st.model.steps.toLocaleString() + ' ステップ</p>';
    } else {
      box.innerHTML = '<p class="ns-empty__hint">未学習</p>';
    }
  }

  function renderStats() {
    var box = el('nlStats'); if (!box) return;
    var st = LAB.state, m = st.model;
    if (!m) { box.innerHTML = ''; return; }
    box.innerHTML = C.Table(['項目', '値'], [
      ['語彙数 V', String(m.V) + '（サブワード）'],
      ['学習したサブワード結合', String((m.merges && m.merges.length) || 0) + ' 回（BPE）'],
      ['埋め込み次元 D', String(m.D)],
      ['隠れ層ユニット H', String(m.H)],
      ['文脈長 C', String(m.C)],
      ['学習可能な重み', st.params.toLocaleString() + ' 個'],
      ['学習トークン数', m.ids.length.toLocaleString()],
      ['学習ステップ', m.steps.toLocaleString()],
      ['最終 loss', m.loss.toFixed(3)]
    ]);
  }

  function renderGen() {
    var out = el('nlGenOut'); if (!out) return;
    var st = LAB.state;
    if (!st.model) { out.innerHTML = '<p class="ns-empty__hint">学習が終わると生成できます。</p>'; return; }
    var seedStr = (el('nlSeed') && el('nlSeed').value.trim()) || defaultSeed();
    var seed = NLM.encode(st.model, seedStr).slice(0, st.model.C);
    if (!seed.length) seed = NLM.encode(st.model, corpusToken()).slice(0, st.model.C);
    // self-check agent: 自由生成は1発だと壊れやすいので、複数候補を生成し、
    // 「整文スコア（文字言語モデルの流暢さ − 繰り返しペナルティ）」で自己評価して
    // 最良を採用する（観測→評価→選択のループ・完全オフライン）。
    var K = 6, cands = [];
    for (var i = 0; i < K; i++) {
      var temp = 0.5 + 0.09 * i;                              // 0.5〜1.0 で多様化
      var text = NSCode.babyLLM.join(LAB.generate(seed, { temperature: temp, topK: 6, maxTokens: 48 }));
      cands.push({ text: text, score: genScore(text) });
    }
    cands.sort(function (a, b) { return b.score - a.score; });
    var best = cands[0];
    out.innerHTML = '<div class="ns-qa-answer__src"><span class="ns-tag">ニューラル生成</span> ' + C.esc(best.text) + '</div>' +
      '<p class="ns-empty__hint">🧹 文法チェック（自己評価エージェント）：' + K + '候補を生成し、整文スコア最良を採用（スコア ' +
      cands.map(function (c) { return c.score.toFixed(2); }).join(' / ') + '）</p>';
  }

  /* 整文スコア：文字言語モデルの流暢さ（日本語らしさ）から、繰り返し（赤ちゃん生成の
   * 主な破綻）のペナルティを引いた値。高いほど自然。完全オフライン。 */
  function genScore(text) {
    var t = String(text || '');
    if (t.length < 4) return -1e9;
    var flu = (A.fluency ? A.fluency(t) : 0);                 // ask-engine の文字bigramLM
    var rep = 0; for (var i = 1; i < t.length; i++) if (t[i] === t[i - 1]) rep++;   // 同一文字の連続
    var bg = {}, dup = 0;                                     // 繰り返しbigram
    for (var j = 1; j < t.length; j++) { var k = t[j - 1] + t[j]; if (bg[k]) dup++; else bg[k] = 1; }
    return flu - 4 * (rep / t.length) - 1.5 * (dup / Math.max(1, t.length - 1));
  }

  function renderProbs() {
    var out = el('nlProbOut'); if (!out) return;
    var st = LAB.state;
    if (!st.model) { out.innerHTML = '<p class="ns-empty__hint">学習が終わると予測できます。</p>'; return; }
    var ctx = (el('nlCtx') && el('nlCtx').value.trim()) || defaultCtx();
    var top = LAB.nextProbs(ctx, 8) || [];
    out.innerHTML = '<p class="ns-empty__hint">文脈「' + C.esc(ctx) + '」の次に来る確率が高いトークン（モデルの実出力）:</p>' +
      '<div class="ns-trace2"><div class="ns-trace2__row">' + top.map(function (t) {
        return '<span class="ns-tok">' + C.esc(t.tok === '\n' ? '⏎' : t.tok) + '<i>' + (t.prob * 100).toFixed(1) + '%</i></span>';
      }).join('') + '</div></div>';
  }

  function renderEmb() {
    var out = el('nlEmbOut'); if (!out) return;
    var m = LAB.state.model;
    if (!m) { out.innerHTML = '<p class="ns-empty__hint">学習が終わると埋め込みを表示します。</p>'; return; }
    var nTok = Math.min(8, m.V - 1), nDim = Math.min(8, m.D);
    var headers = ['token']; for (var d = 0; d < nDim; d++) headers.push('e' + d);
    var rows = [];
    for (var i = 1; i <= nTok; i++) {
      var r = [m.vocab.itos[i]];
      for (var d2 = 0; d2 < nDim; d2++) r.push(m.Emb[i * m.D + d2].toFixed(2));
      rows.push(r);
    }
    out.innerHTML = '<p class="ns-empty__hint">各トークンの埋め込みベクトル（先頭 ' + nDim + ' 次元・学習で得た実数値）:</p>' + C.Table(headers, rows);
  }
})(window.NSCode);

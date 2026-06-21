/* NSCode 日本語文法エンジン — SML（意味スロット）を自然な日本語へ「コンパイル」する
 * 決定論的ルールエンジン。生成AIの自由生成を、意味を変えずに日本語文法へ正規化する
 * 最終変換層（Grammar Compiler Layer）。API なし・端末内・ビルド不要。
 *
 *   NSCode.grammar.compile(sml) -> { sentence, grammar, changes, naturalness, confidence }
 *   sml: { subject, time, place, object, action, tense, politeness, negative, ... }
 *        または "key: value" 行テキスト / スペース区切りのラベル列
 */
(function (NSCode) {
  'use strict';

  /* ---- 動詞の活用クラス判定（共通動詞は辞書、未知語はかな規則で推定） ---- */
  var ICHIDAN = {
    '見る':1,'観る':1,'食べる':1,'寝る':1,'起きる':1,'着る':1,'出る':1,'入れる':1,'開ける':1,'閉める':1,
    '教える':1,'覚える':1,'考える':1,'答える':1,'調べる':1,'始める':1,'続ける':1,'集める':1,'決める':1,
    '捨てる':1,'忘れる':1,'借りる':1,'信じる':1,'感じる':1,'生きる':1,'得る':1,'いる':1,'できる':1,
    '変える':1,'数える':1,'比べる':1,'並べる':1,'伝える':1,'見せる':1,'見える':1,'聞こえる':1,'届ける':1
  };
  var GODAN_RU = {
    '帰る':1,'入る':1,'走る':1,'知る':1,'切る':1,'要る':1,'限る':1,'減る':1,'滑る':1,'握る':1,'参る':1,
    '喋る':1,'散る':1,'ある':1,'なる':1,'作る':1,'送る':1,'登る':1,'取る':1,'撮る':1,'乗る':1,'売る':1,
    '降る':1,'座る':1,'残る':1,'守る':1,'振る':1,'配る':1,'怒る':1,'戻る':1,'渡る':1,'回る':1,'光る':1
  };
  function vclass(v) {
    if (/する$/.test(v)) return 'suru';
    if (v === '来る' || v === 'くる') return 'kuru';
    if (v.slice(-1) !== 'る') return 'godan';
    if (ICHIDAN[v]) return 'ichidan';
    if (GODAN_RU[v]) return 'godan';
    var pre = v.slice(-2, -1);
    return /[いきしちにひみりぎじぢびぴえけせてねへめれげぜでべぺ]/.test(pre) ? 'ichidan' : 'godan';
  }

  var ROW_I = { 'う':'い','く':'き','ぐ':'ぎ','す':'し','つ':'ち','ぬ':'に','ぶ':'び','む':'み','る':'り' };
  var ROW_A = { 'う':'わ','く':'か','ぐ':'が','す':'さ','つ':'た','ぬ':'な','ぶ':'ば','む':'ま','る':'ら' };
  var TA   = { 'う':'った','つ':'った','る':'った','く':'いた','ぐ':'いだ','す':'した','ぬ':'んだ','ぶ':'んだ','む':'んだ' };

  function masuStem(v, cls) {
    if (cls === 'ichidan') return v.slice(0, -1);
    if (cls === 'suru') return v.slice(0, -2) + 'し';
    if (cls === 'kuru') return v === '来る' ? '来' : 'き';
    var last = v.slice(-1); return v.slice(0, -1) + (ROW_I[last] || last);
  }
  function naiStem(v, cls) {                       // 未然形（〜ない の語幹）
    if (cls === 'ichidan') return v.slice(0, -1);
    if (cls === 'suru') return v.slice(0, -2) + 'し';
    if (cls === 'kuru') return v === '来る' ? '来' : 'こ';
    var last = v.slice(-1); return v.slice(0, -1) + (ROW_A[last] || last);
  }
  function plainPast(v, cls) {
    if (cls === 'ichidan') return v.slice(0, -1) + 'た';
    if (cls === 'suru') return v.slice(0, -2) + 'した';
    if (cls === 'kuru') return v === '来る' ? '来た' : 'きた';
    if (v === '行く') return '行った';
    var last = v.slice(-1); return v.slice(0, -1) + (TA[last] || 'た');
  }

  /* 動詞活用: tense=past|present, polite, negative */
  function conjVerb(verb, o) {
    o = o || {};
    var cls = vclass(verb), past = o.tense === 'past', polite = !!o.polite, neg = !!o.negative;
    if (polite) {
      var st = masuStem(verb, cls);
      if (!neg) return st + (past ? 'ました' : 'ます');
      return st + (past ? 'ませんでした' : 'ません');
    }
    if (!neg) return past ? plainPast(verb, cls) : verb;
    var nst = naiStem(verb, cls);
    if (cls === 'godan' && /[あ-ん]$/.test(verb.slice(-1)) && false) { /* noop */ }
    return nst + (past ? 'なかった' : 'ない');
  }

  /* い形容詞の活用（な形容詞は簡易対応） */
  function conjAdj(adj, o) {
    o = o || {}; var past = o.tense === 'past', polite = !!o.polite, neg = !!o.negative;
    if (/い$/.test(adj) && adj !== 'きれい') {
      var stem = adj.slice(0, -1);
      if (!neg) {
        if (!past) return polite ? adj + 'です' : adj;
        return polite ? adj + 'でした' : stem + 'かった';
      }
      if (!past) return polite ? stem + 'くありません' : stem + 'くない';
      return polite ? stem + 'くありませんでした' : stem + 'くなかった';
    }
    // な形容詞 / 名詞述語
    if (!neg) { if (!past) return polite ? adj + 'です' : adj + 'だ'; return polite ? adj + 'でした' : adj + 'だった'; }
    if (!past) return polite ? adj + 'ではありません' : adj + 'ではない';
    return polite ? adj + 'ではありませんでした' : adj + 'ではなかった';
  }

  /* ---- 入力パース（オブジェクト / "key: value" 行 / ラベル列） ---- */
  var TENSE = { '過去':'past','現在':'present','未来':'present','past':'past','present':'present' };
  var POLITE = { '丁寧':'polite','です・ます':'polite','polite':'polite','普通':'plain','plain':'plain','尊敬':'honorific','honorific':'honorific','謙譲':'humble','humble':'humble' };
  function parse(input) {
    if (input && typeof input === 'object') return input;
    var s = String(input || '').trim(), sml = {};
    if (s.indexOf(':') >= 0) {                    // key: value 行
      s.split(/\n/).forEach(function (line) {
        var i = line.indexOf(':'); if (i < 0) return;
        var k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
        if (v) sml[k] = v;
      });
      return sml;
    }
    return { _tokens: s.split(/[\s　]+/).filter(Boolean) };  // ラベル列は素トークンとして渡す
  }

  /* ---- メイン: SML → 自然文 ---- */
  function compile(input) {
    var sml = parse(input), changes = [], guessed = false;

    // ラベル列（"私は 昨日 学校 本 読む 過去 丁寧"）の素トークンを役割推定
    if (sml._tokens) {
      var t = sml._tokens.slice(), o = {};
      for (var i = t.length - 1; i >= 0; i--) {            // 末尾の時制・丁寧マーカーを回収
        if (POLITE[t[i]]) { o.politeness = t[i]; t.splice(i, 1); }
        else if (TENSE[t[i]]) { o.tense = t[i]; t.splice(i, 1); }
        else if (t[i] === '否定' || t[i] === '打消') { o.negative = '1'; t.splice(i, 1); }
      }
      if (t.length) o.action = t.pop().replace(/[をはがにでへとのより]$/, '');  // 末尾＝述語
      if (t.length) o.object = t.pop().replace(/[をはがにでへとのより]$/, '');
      if (t.length) o.subject = t.shift().replace(/[はがも]$/, '');
      if (t.length) o.time = t.shift();
      if (t.length) o.place = t.shift();
      sml = o; guessed = true;
    }

    var g = function (k) { return sml[k] != null ? String(sml[k]).trim() : ''; };
    var tense = TENSE[g('tense')] || 'present';
    var pol = POLITE[g('politeness') || g('politeness') ] || (g('politeness') ? 'polite' : 'polite');
    var polite = pol !== 'plain';
    var negative = /^(1|true|はい|否定|yes)$/i.test(g('negative'));

    var parts = [];
    function add(text, particle, role) {
      if (!text) return;
      // 既に助詞が付いていれば尊重、無ければ補完
      if (particle && !/[はがをにでへとのより]$/.test(text)) { parts.push(text + particle); changes.push('助詞「' + particle + '」を補完'); }
      else parts.push(text);
    }
    // 語順: 主語(は) → 時間 → 場所(で) → 対象(を) → 述語
    add(g('subject'), 'は', 'subject');
    if (g('time')) parts.push(g('time'));
    add(g('place'), 'で', 'place');
    if (g('destination') || g('direction')) add(g('destination') || g('direction'), 'へ', 'dest');
    if (g('means')) add(g('means'), 'で', 'means');
    if (g('companion')) add(g('companion'), 'と', 'companion');
    add(g('object'), 'を', 'object');

    // 述語（動詞 or 形容詞/名詞）
    var pred = '', action = g('action') || g('verb') || g('predicate') || g('adjective');
    var surface = sml.actionSurface || sml.actionsurface;
    if (surface) { pred = surface; if (g('subject') || g('object')) changes.push('語順を自然化'); }
    else if (action) {
      var isAdj = !!g('adjective') || (/[いし]$/.test(action) && !/る$|う$|く$|ぐ$|す$|つ$|ぬ$|ぶ$|む$/.test(action) && !g('verb'));
      if (g('adjective') || (isAdj && !g('verb') && !g('action'))) pred = conjAdj(action, { tense: tense, polite: polite, negative: negative });
      else { pred = conjVerb(action, { tense: tense, polite: polite, negative: negative }); if (vclass(action) === 'godan' && action.slice(-1) === 'る' && !GODAN_RU[action] && !ICHIDAN[action]) guessed = true; }
      if (pred !== action) changes.push('述語を活用（' + tense + '・' + (polite ? '丁寧' : '普通') + (negative ? '・否定' : '') + '）');
    }
    if (pred) parts.push(pred);

    var sentence = parts.join('');
    if (sentence && !/[。！？]$/.test(sentence)) { sentence += '。'; changes.push('句点を付与'); }
    if (parts.length >= 3) changes.push('語順を自然化');

    var naturalness = sentence ? (guessed ? 0.85 : 0.97) : 0;
    var confidence = sentence ? (guessed ? 0.8 : 0.95) : 0;
    return {
      sentence: sentence,
      grammar: sentence ? 'Correct' : 'Empty',
      changes: changes,
      naturalness: naturalness,
      confidence: confidence
    };
  }

  /* ---- 逆変換: 自由テキスト → SML → 正規化（Ask 生成の最終変換層） ---- */
  // 表層の述語 → 辞書形＋時制・丁寧・否定（ベストエフォート）
  function stemToDict(st) {
    if (!st) return null;
    if (st === 'し') return 'する';
    if (st === '来' || st === 'き') return '来る';
    if (/.し$/.test(st)) return st.slice(0, -1) + 'する';     // 勉強し → 勉強する
    var inv = { 'い':'う','き':'く','ぎ':'ぐ','し':'す','ち':'つ','に':'ぬ','び':'ぶ','み':'む','り':'る' };
    var last = st.slice(-1);
    return inv[last] ? st.slice(0, -1) + inv[last] : st + 'る';  // godan / ichidan
  }
  function dictFromSurface(p) {
    var r;
    if (/ませんでした$/.test(p)) { r = stemToDict(p.slice(0, -7)); return r && { dict: r, tense: 'past', polite: true, negative: true }; }
    if (/ました$/.test(p)) { r = stemToDict(p.slice(0, -3)); return r && { dict: r, tense: 'past', polite: true }; }
    if (/ません$/.test(p)) { r = stemToDict(p.slice(0, -4)); return r && { dict: r, tense: 'present', polite: true, negative: true }; }
    if (/ます$/.test(p)) { r = stemToDict(p.slice(0, -2)); return r && { dict: r, tense: 'present', polite: true }; }
    if (/くありませんでした$/.test(p)) return { dict: p.replace(/くありませんでした$/, 'い'), tense: 'past', polite: true, negative: true, isAdj: true };
    if (/くありません$/.test(p)) return { dict: p.replace(/くありません$/, 'い'), tense: 'present', polite: true, negative: true, isAdj: true };
    if (/くなかった$/.test(p)) return { dict: p.replace(/くなかった$/, 'い'), tense: 'past', negative: true, isAdj: true };
    if (/くない$/.test(p)) return { dict: p.replace(/くない$/, 'い'), tense: 'present', negative: true, isAdj: true };
    if (/かったです$/.test(p)) return { dict: p.replace(/かったです$/, 'い'), tense: 'past', polite: true, isAdj: true };
    if (/かった$/.test(p)) return { dict: p.replace(/かった$/, 'い'), tense: 'past', isAdj: true };
    if (/でした$/.test(p)) return { dict: p.replace(/でした$/, ''), tense: 'past', polite: true, isAdj: true };
    if (/です$/.test(p)) return { dict: p.replace(/です$/, ''), tense: 'present', polite: true, isAdj: true };
    if (/んだ$/.test(p)) return { dict: p.slice(0, -2) + 'む', tense: 'past' };
    if (/いた$/.test(p)) return { dict: p.slice(0, -2) + 'く', tense: 'past' };
    if (/いだ$/.test(p)) return { dict: p.slice(0, -2) + 'ぐ', tense: 'past' };
    if (/した$/.test(p) && p.length > 2) return { dict: p.slice(0, -2) + 'す', tense: 'past' };
    if (/った$/.test(p)) return { dict: p.slice(0, -2) + 'る', tense: 'past' };   // 曖昧→る
    if (/る$/.test(p)) return { dict: p, tense: 'present' };
    return null;
  }
  // 1文 → SML（助詞でセグメント分割し役割付与）
  function toSML(sentence) {
    var raw = String(sentence || '').replace(/[\s　]/g, '').trim();
    if (!raw) return null;
    var s = raw.replace(/[。．！？]+$/, '');
    var P = /[をはがでにへと]/g, last = -1, mm;
    while ((mm = P.exec(s))) last = mm.index;
    var head = last >= 0 ? s.slice(0, last + 1) : '';
    var predSurface = last >= 0 ? s.slice(last + 1) : s;
    var rev = dictFromSurface(predSurface);
    var sml = { _original: raw };
    if (rev) {
      sml.tense = rev.tense || 'present'; sml.politeness = rev.polite ? 'polite' : 'plain'; sml.negative = !!rev.negative;
      if (rev.isAdj) sml.adjective = rev.dict; else sml.action = rev.dict;
    } else { sml.actionSurface = predSurface; sml.politeness = /ます|です/.test(predSurface) ? 'polite' : 'plain'; }
    var groups = [], cur = '';
    for (var i = 0; i < head.length; i++) {
      var ch = head[i];
      if ('をはがでにへと'.indexOf(ch) >= 0) { if (cur) { groups.push({ t: cur, p: ch }); cur = ''; } }
      else cur += ch;
    }
    groups.forEach(function (g) {
      if (g.p === 'を') sml.object = sml.object || g.t;
      else if (g.p === 'は' || g.p === 'が') sml.subject = sml.subject || g.t;
      else if (g.p === 'で') sml.place = sml.place || g.t;
      else if (g.p === 'に' || g.p === 'へ') sml.destination = sml.destination || g.t;
      else if (g.p === 'と') sml.companion = sml.companion || g.t;
    });
    return sml;
  }
  function ensureP(s) { return s && !/[。．！？]$/.test(s) ? s + '。' : s; }
  // 内容語（漢字・カタカナ・英数）のラン。助詞や活用語尾(ひらがな)は除外。
  function contentRuns(s) { return String(s || '').match(/[一-鿿ァ-ヶー0-9A-Za-z]+/g) || []; }
  function preservesContent(orig, made) {
    // (1) 内容語が同じ「順序」で現れること。再コンパイルが節内のスロットを並べ替えて
    // 「ラジアルとアキシアル…に適す」→「アキシアル…へラジアルと適す」のように意味を
    // 壊すのを防ぐ（順序入替・スクランブルを拒否＝原文保持）。
    var o = contentRuns(orig), m = contentRuns(made), j = 0;
    for (var i = 0; i < o.length; i++) {
      while (j < m.length && m[j] !== o[i]) j++;
      if (j >= m.length) return false;
      j++;
    }
    // (2) 格助詞を新たに導入しないこと（「荷重に応じて」→「荷重へ応じて」の に→へ 破損を拒否）。
    function pc(s) { var c = {}, a = s.match(/[はがをにへとでも]/g) || []; a.forEach(function (x) { c[x] = (c[x] || 0) + 1; }); return c; }
    var co = pc(orig), cm = pc(made);
    for (var k in cm) if ((cm[k] || 0) > (co[k] || 0)) return false;
    return true;
  }
  // 1節を再コンパイルしてよいか。長さ・読点では弾かない（文字数に関係なく通す方針）。
  // 節分割後の各節はもう読点を含まないので、辞書形述語が取れた節だけを安全に再構成する。
  // 述語が辞書形に逆変換できない節（連用中止・て形などの actionSurface）は原文保持。
  function canRecompile(s, sml) {
    if (sml.actionSurface || (!sml.action && !sml.adjective)) return false;
    return true;
  }
  /* ===== kuromoji 形態素解析（任意・段階的強化） =================================
   * 端末内で動く本格的な形態素解析器。読み込めれば toSML をルール推定から品詞ベースの
   * 正確な解析に置き換える（述語の辞書形・時制・丁寧・否定、そして「終止形か連用中止か」
   * を確実に判定）。未ロード時は従来のルール解析にフォールバック（壊さない）。
   * tokenize はロード後は同期なので normalize の同期 API はそのまま維持できる。 */
  var _tokenizer = null, _initing = null;
  function setTokenizer(tok) { _tokenizer = tok || null; return _tokenizer; }
  function ready() { return !!_tokenizer; }
  /* kuromoji を遅延ロードしてトークナイザを構築（ブラウザ）。SheetJS/PDF.js と同じ
   * vendor 遅延ロード方式。重い辞書(約18MB)は初回利用時のみ取得し、以後は同期解析。 */
  function initKuromoji(opts) {
    opts = opts || {};
    if (_tokenizer) return Promise.resolve(_tokenizer);
    if (_initing) return _initing;
    var dicPath = opts.dicPath || 'assets/vendor/kuromoji/dict/';
    var src = opts.src || 'assets/vendor/kuromoji/kuromoji.js';
    _initing = new Promise(function (resolve, reject) {
      function build() {
        if (!window.kuromoji) return reject(new Error('kuromoji global not found'));
        window.kuromoji.builder({ dicPath: dicPath }).build(function (err, tok) {
          if (err) { _initing = null; return reject(err); }
          _tokenizer = tok; resolve(tok);
        });
      }
      if (window.kuromoji) return build();
      if (typeof document === 'undefined') return reject(new Error('no document'));
      var sc = document.createElement('script'); sc.src = src; sc.async = true;
      sc.onload = build; sc.onerror = function () { _initing = null; reject(new Error('kuromoji.js load failed')); };
      document.head.appendChild(sc);
    });
    return _initing;
  }

  // 表現できる格/係助詞 → SML スロット（compile が再構成できるものだけ）
  var KSLOT = { 'は': 'subject', 'が': 'subject', 'を': 'object', 'で': 'place', 'に': 'destination', 'へ': 'destination', 'と': 'companion' };
  function isPred(t) { return t.pos === '動詞' || t.pos === '形容詞' || t.pos === '助動詞'; }
  /* 1節（読点なし）→ SML。kuromoji の品詞・活用で述語と格構造を正確に取る。
   * 安全側に倒し、表現できない助詞・修飾節を含む複雑節や非終止（連用中止/て形）は
   * null を返して原文保持させる（recompile しない）。 */
  function toSMLk(core) {
    var tk;
    try { tk = _tokenizer.tokenize(core); } catch (e) { return null; }
    if (!tk || !tk.length) return null;
    while (tk.length && tk[tk.length - 1].pos === '記号' && !/[A-Za-z0-9]/.test(tk[tk.length - 1].surface_form)) tk.pop();
    if (!tk.length) return null;
    var i = tk.length - 1;
    while (i >= 0 && tk[i].pos === '助詞') i--;            // 終助詞・接続助詞の末尾を外す
    var end = i;
    while (i >= 0 && isPred(tk[i])) i--;                   // 述語ラン（動詞/形容詞/助動詞）
    var predStart = i + 1;
    var head = tk.slice(0, Math.max(predStart, 0)), pred = tk.slice(predStart, end + 1);
    var sml = { _original: core }, dictForm = null, isAdj = false;
    for (var k = 0; k < pred.length; k++) {
      var t = pred[k];
      if (t.pos === '形容詞') { dictForm = t.basic_form; isAdj = true; break; }
      if (t.pos === '動詞') {
        dictForm = t.basic_form;
        if (dictForm === 'する' && head.length && head[head.length - 1].pos === '名詞' && head[head.length - 1].pos_detail_1 === 'サ変接続') {
          dictForm = head[head.length - 1].surface_form + 'する'; head = head.slice(0, -1);   // サ変名詞＋する
        }
        break;
      }
    }
    if (!dictForm) {   // 名詞述語（N＋だ/です/である）
      if (head.length && head[head.length - 1].pos === '名詞' && pred.length && pred.every(function (t) { return t.pos === '助動詞'; })) {
        isAdj = true; dictForm = head[head.length - 1].surface_form; head = head.slice(0, -1);
      } else return null;
    }
    // 終止形か？ 連用中止・て形・未然などは非終止＝原文保持（compile すると文法が壊れる）
    var finite = !pred.length || pred[pred.length - 1].conjugated_form === '基本形';
    if (!finite) return null;
    var polite = false, past = false, negative = false;
    pred.forEach(function (t) {
      if (t.pos === '助動詞') {
        var b = t.basic_form, s = t.surface_form;
        if (b === 'ます' || b === 'です') polite = true;
        if (b === 'た' || s === 'た' || s === 'だ' || s === 'でし') past = true;
        if (b === 'ない' || b === 'ぬ' || b === 'ん') negative = true;
      }
      if (t.pos === '形容詞' && t.basic_form === 'ない') negative = true;
    });
    // head → スロット（名詞＋表現可能な助詞のみ。修飾節・副詞・未対応助詞があれば bail）
    var buf = '';
    for (var h = 0; h < head.length; h++) {
      var ht = head[h];
      if (ht.pos === '助詞') {
        var sl = KSLOT[ht.surface_form]; if (!sl) return null;
        if (buf) { if (!sml[sl]) sml[sl] = buf; buf = ''; }
      } else if (ht.pos === '名詞' || ht.pos === '接頭詞' || (ht.pos === '記号' && /[A-Za-z0-9ー・]/.test(ht.surface_form))) {
        buf += ht.surface_form;
      } else return null;        // 副詞/連体詞/動詞/形容詞などの修飾は複雑 → 原文保持
    }
    if (buf) return null;        // 助詞の付かない宙ぶらりんな名詞 → 原文保持
    sml.tense = past ? 'past' : 'present';
    sml.politeness = polite ? 'polite' : 'plain';
    sml.negative = negative;
    if (isAdj) sml.adjective = dictForm; else sml.action = dictForm;
    return sml;
  }
  // 1節 → SML（kuromoji が使えればそれを、無ければ従来のルール解析を使う）
  function analyzeClause(core) { return _tokenizer ? toSMLk(core) : toSML(core); }

  /* ===== 接地生成（grounded generation）のための kuromoji 解析ヘルパ =============
   * 赤ちゃんモデルが「どの語を使うか」を生成・選択する一方、文の骨格は SML スロットに
   * 固定して compile で組み立てる（生成自体に文法ルールを入れる）。そのための部品。 */
  function analyze(text) { if (!_tokenizer) return null; try { return _tokenizer.tokenize(String(text || '')); } catch (e) { return null; } }
  // 文中の複合名詞句とその直後の助詞を取り出す（スロット候補の語彙プール）
  function nouns(tokens) {
    if (!tokens) return [];
    var out = [], buf = '';
    tokens.forEach(function (t) {
      if (t.pos === '名詞' || t.pos === '接頭詞' || (t.pos === '記号' && /[A-Za-z0-9ー・]/.test(t.surface_form))) buf += t.surface_form;
      else { if (buf) { out.push({ text: buf, particle: t.pos === '助詞' ? t.surface_form : '' }); buf = ''; } }
    });
    if (buf) out.push({ text: buf, particle: '' });
    return out;
  }
  // 文の主述語を辞書形＋時制/丁寧/否定/終止判定で取り出す（名詞述語は genus を返す）
  function predicate(tokens) {
    if (!tokens || !tokens.length) return null;
    var tk = tokens.slice();
    while (tk.length && tk[tk.length - 1].pos === '記号' && !/[A-Za-z0-9]/.test(tk[tk.length - 1].surface_form)) tk.pop();
    var i = tk.length - 1;
    while (i >= 0 && tk[i].pos === '助詞') i--;
    var end = i;
    while (i >= 0 && isPred(tk[i])) i--;
    var pred = tk.slice(i + 1, end + 1), head = tk.slice(0, i + 1);
    if (!pred.length) return null;
    var dict = null, isAdj = false;
    for (var k = 0; k < pred.length; k++) {
      var t = pred[k];
      if (t.pos === '形容詞') { dict = t.basic_form; isAdj = true; break; }
      if (t.pos === '動詞') {
        dict = t.basic_form;
        if (dict === 'する' && head.length && head[head.length - 1].pos === '名詞' && head[head.length - 1].pos_detail_1 === 'サ変接続') dict = head[head.length - 1].surface_form + 'する';
        break;
      }
    }
    if (!dict) {   // 名詞述語：述部が助動詞のみ → 直前の連続名詞を genus とする
      var g = '', j = head.length - 1;
      while (j >= 0 && (head[j].pos === '名詞' || head[j].pos === '接頭詞')) { g = head[j].surface_form + g; j--; }
      if (g && pred.every(function (t) { return t.pos === '助動詞'; })) { isAdj = true; dict = g; }
      else return null;
    }
    var polite = false, past = false, negative = false;
    pred.forEach(function (t) {
      if (t.pos === '助動詞') { var b = t.basic_form, s = t.surface_form;
        if (b === 'ます' || b === 'です') polite = true;
        if (b === 'た' || s === 'た' || s === 'だ' || s === 'でし') past = true;
        if (b === 'ない' || b === 'ぬ' || b === 'ん') negative = true; }
      if (t.pos === '形容詞' && t.basic_form === 'ない') negative = true;
    });
    return { dict: dict, isAdj: isAdj, tense: past ? 'past' : 'present', polite: polite, negative: negative, finite: pred[pred.length - 1].conjugated_form === '基本形' };
  }
  /* 文末が「終止述語」で終わっているか（名詞止め・連用中止・助詞止めを弾く）。
   * coherence.finite は「文中に終止述語が1つでもあるか」なので、文末保証には弱い。
   * これは最終トークンが 動詞/形容詞/助動詞 の基本形であることを要求する。 */
  function endsFinite(s) {
    if (!_tokenizer) return true;
    var tk; try { tk = _tokenizer.tokenize(String(s || '')); } catch (e) { return true; }
    while (tk.length && tk[tk.length - 1].pos === '記号') tk.pop();
    if (!tk.length) return false;
    var last = tk[tk.length - 1];
    // kuromoji mislabels listing/final particles (や・か・ね・よ…) as 助動詞 基本形;
    // these are NOT valid sentence-final predicates, so reject them.
    if (last.pos === '助動詞') return last.conjugated_form === '基本形' && !/^(や|か|かな|ね|よ|わ|さ|ぞ|な|の|っけ|かしら)$/.test(last.surface_form);
    if (last.pos === '動詞' || last.pos === '形容詞') return last.conjugated_form === '基本形';
    return false;   // 名詞止め・助詞止め・連用形止め → 非終止
  }
  /* 表示用の軽量クリーンアップ（意味は変えない・破壊しない）。抽出回答にも残る PDF 由来の
   * ノイズを除去：表の「系列Ⅰ系列Ⅱ…」連、隣接重複チャンク、先頭の数字・記号断片。 */
  function tidy(s) {
    if (!s) return s;
    return String(s)
      .replace(/(?:系列[Ⅰ-Ⅻ]+\s*)+/g, '')                                  // 表のローマ数字連
      .replace(/([一-鿿ァ-ヶーA-Za-zⅠ-Ⅻ0-9]{4,16}?)\1+/g, '$1')             // 隣接重複チャンク
      .replace(/^([一-鿿ァ-ヶー]{2,4})\1/, '$1')                              // 先頭の重複語（ねじねじ山→ねじ山）
      .replace(/^(?:また|さらに|しかし|そして|なお|ただし|一方|つまり|すなわち|そのため|したがって|よって|これに対して)[、，]/, '')  // 先頭の接続詞
      .replace(/^[\s　、，,。．・.0-9０-９/／\-]+/, '')                          // 先頭の断片
      .trim();
  }

  /* kuromoji による生成文の「コヒーレンス判定」（生成後処理）。極小ニューラル生成器が
   * 出すトークン崩壊文（助詞・記号の羅列／同語の連続／終止述語なし）を形態素的に検出し、
   * 弾けるようにする。呼び出し側はこれが false なら抽出回答にフォールバックする。
   * kuromoji 未ロード時は内容語ベースの簡易ヒューリスティック。 */
  function coherence(text) {
    var s = String(text || '').trim();
    if (!s) return { ok: false, score: 0, reason: 'empty' };
    if (!_tokenizer) {
      var runs = contentRuns(s);
      return { ok: runs.join('').length >= 6 && runs.length >= 2, score: runs.length, reason: 'heuristic' };
    }
    var tk; try { tk = _tokenizer.tokenize(s); } catch (e) { return { ok: false, score: 0, reason: 'tokenize-failed' }; }
    if (!tk.length) return { ok: false, score: 0, reason: 'no-tokens' };
    var content = 0, funcsym = 0, hasPred = false, hasFinite = false, adjRepeat = 0, funcRun = 0, maxFuncRun = 0;
    var startsBad = (tk[0].pos === '助詞' || tk[0].pos === '記号');
    tk.forEach(function (t, idx) {
      var p = t.pos;
      if (p === '名詞' || (p === '動詞' && t.pos_detail_1 === '自立') || p === '形容詞' || p === '副詞') content++;
      var fn = (p === '助詞' || p === '記号');
      if (fn || p === '助動詞') funcsym++;
      if (fn) { funcRun++; if (funcRun > maxFuncRun) maxFuncRun = funcRun; } else funcRun = 0;
      if (p === '動詞' || p === '形容詞' || p === '助動詞') { hasPred = true; if (t.conjugated_form === '基本形') hasFinite = true; }
      if (idx > 0 && t.surface_form === tk[idx - 1].surface_form) adjRepeat++;   // 直近重複（崩壊の兆候）
    });
    var ratio = content / ((content + funcsym) || 1);
    // 生成は設計上 1 文（最初の句点で停止）なので、文中に句点が複数ある＝過分割の崩壊兆候
    var enders = (s.match(/[。．！？]/g) || []).length;
    // 崩壊判定: 先頭が助詞/記号・関数語の連続3以上・隣接重複2以上・終止述語なし・
    //          内容語比率が低い・句点が複数（過分割）
    var ok = !startsBad && hasFinite && content >= 2 && maxFuncRun <= 2 && adjRepeat <= 1 && ratio >= 0.30 && enders <= 1;
    return { ok: ok, score: +ratio.toFixed(2), reason: 'kuromoji', content: content, funcsym: funcsym, finite: hasFinite, adjRepeat: adjRepeat, maxFuncRun: maxFuncRun, startsBad: startsBad, enders: enders };
  }

  /* 自由テキスト → 文ごと・節ごとに SML 化 → compile で正規化。長さに関係なく全文を
   * 通すため、文を読点で節へ分割し、各節を独立に正規化して再結合する。意味保持を厳守
   * （preservesContent 不成立や辞書形不明の節は原文のまま通す＝破壊しない）。 */
  function normalize(text, opts) {
    opts = opts || {};
    var sents = String(text || '').split(/(?<=[。．！？])/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (!sents.length && text) sents = [String(text).trim()];
    var per = [], out = [];
    sents.forEach(function (s) {
      // 文を読点で節に分割（区切りは左の節に残す）。読点が無ければ 1 節。
      var clauses = s.split(/(?<=[、，,])/).filter(Boolean);
      var rebuilt = '', clauseInfo = [], anyApplied = false, firstSml = null;
      clauses.forEach(function (cl) {
        var trail = (cl.match(/[、，,]$/) || [''])[0];
        var core = trail ? cl.slice(0, -1) : cl;
        var sml = analyzeClause(core), normalized = core, changes = [], applied = false;
        if (sml) {
          if (opts.politeness) sml.politeness = opts.politeness;
          if (canRecompile(core, sml)) {
            var r = compile(sml);
            if (r.sentence && preservesContent(core, r.sentence)) {
              // compile は句点を付けるが、節（末尾以外）には不要なので外す
              normalized = r.sentence.replace(/[。．！？]+$/, ''); changes = r.changes; applied = true;
            }
          }
        }
        if (!firstSml) firstSml = sml;
        anyApplied = anyApplied || applied;
        clauseInfo.push({ original: core, sml: sml, normalized: normalized, changes: changes, applied: applied });
        rebuilt += normalized + trail;
      });
      rebuilt = ensureP(rebuilt);
      per.push({ original: s, sml: firstSml, normalized: rebuilt, changes: [], applied: anyApplied, clauses: clauseInfo });
      out.push(rebuilt);
    });
    return { text: out.join(''), sentences: per };
  }

  NSCode.grammar = { compile: compile, conjVerb: conjVerb, conjAdj: conjAdj, vclass: vclass,
    toSML: toSML, normalize: normalize, dictFromSurface: dictFromSurface,
    initKuromoji: initKuromoji, setTokenizer: setTokenizer, ready: ready, toSMLk: toSMLk, coherence: coherence,
    analyze: analyze, nouns: nouns, predicate: predicate, endsFinite: endsFinite, tidy: tidy, _setTokenizer: setTokenizer };
})(window.NSCode);

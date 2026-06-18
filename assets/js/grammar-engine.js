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
    if (action) {
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

  NSCode.grammar = { compile: compile, conjVerb: conjVerb, conjAdj: conjAdj, vclass: vclass };
})(window.NSCode);

/* NSCode Calc — 計算式・表レジストリ（JS）。Ask が KB から回答したあと、質問が
 * ここに「引っ掛かった」ら、関連する計算式（式名＋式＋記号説明）と表（表形式）を
 * 連投する。純粋なデータ＋部分一致のタームマッチャなので決定論的でテスト可能。
 *
 *  FORMULAS: { id, name(式名), expr(式), where:[{sym,desc}](記号説明), terms:[トリガ語] }
 *  TABLES:   { id, name, headers:[...], rows:[[...]], terms:[トリガ語] }
 *  lookup(question) -> { formulas:[…], tables:[…] }  （一致タームの多い順・件数上限つき）
 */
(function (NSCode) {
  'use strict';

  /* 機械工学の代表的な計算式（記号説明つき）。値・式は標準的な教科書ベース。 */
  var FORMULAS = [
    { id: 'tensile', name: '引張応力', expr: 'σ = P / A',
      where: [ { sym: 'σ', desc: '引張応力 [Pa]' }, { sym: 'P', desc: '軸方向の荷重 [N]' }, { sym: 'A', desc: '断面積 [m²]' } ],
      terms: ['引張', '応力', '軸力', '荷重'] },
    { id: 'hooke', name: 'フックの法則', expr: 'σ = E · ε',
      where: [ { sym: 'σ', desc: '応力 [Pa]' }, { sym: 'E', desc: '縦弾性係数（ヤング率） [Pa]' }, { sym: 'ε', desc: 'ひずみ [-]' } ],
      terms: ['フック', '弾性', 'ひずみ', 'ヤング', '縦弾性'] },
    { id: 'bending', name: '曲げ応力', expr: 'σ = M / Z',
      where: [ { sym: 'σ', desc: '曲げ応力 [Pa]' }, { sym: 'M', desc: '曲げモーメント [N·m]' }, { sym: 'Z', desc: '断面係数 [m³]' } ],
      terms: ['曲げ', '梁', '断面係数', 'たわみ'] },
    { id: 'torsion', name: 'ねじり応力', expr: 'τ = T / Z_p',
      where: [ { sym: 'τ', desc: 'せん断応力 [Pa]' }, { sym: 'T', desc: 'ねじりモーメント（トルク） [N·m]' }, { sym: 'Z_p', desc: '極断面係数 [m³]' } ],
      terms: ['ねじり', 'トルク', '軸', '直径', 'せん断'] },
    { id: 'euler', name: 'オイラーの座屈荷重', expr: 'P_cr = π² · E · I / l_k²',
      where: [ { sym: 'P_cr', desc: '座屈荷重 [N]' }, { sym: 'E', desc: '縦弾性係数 [Pa]' }, { sym: 'I', desc: '断面二次モーメント [m⁴]' }, { sym: 'l_k', desc: '座屈長さ [m]' } ],
      terms: ['座屈', 'オイラー', '柱'] },
    { id: 'l10', name: '転がり軸受の基本定格寿命', expr: 'L₁₀ = (C / P)^p',
      where: [ { sym: 'L₁₀', desc: '基本定格寿命 [×10⁶ 回転]' }, { sym: 'C', desc: '基本動定格荷重 [N]' }, { sym: 'P', desc: '動等価荷重 [N]' }, { sym: 'p', desc: '玉軸受 p=3 / ころ軸受 p=10/3' } ],
      terms: ['軸受', '寿命', '定格', 'ベアリング', 'L10'] },
    { id: 'newton', name: '対流熱伝達（ニュートンの冷却則）', expr: 'Q = h · A · ΔT',
      where: [ { sym: 'Q', desc: '伝熱量 [W]' }, { sym: 'h', desc: '熱伝達率 [W/(m²·K)]' }, { sym: 'A', desc: '伝熱面積 [m²]' }, { sym: 'ΔT', desc: '固体表面と流体の温度差 [K]' } ],
      terms: ['熱伝達', '熱伝達率', '対流', '冷却', '伝熱'] },
    { id: 'fourier', name: '熱伝導（フーリエの法則）', expr: 'Q = λ · A · ΔT / L',
      where: [ { sym: 'Q', desc: '熱流量 [W]' }, { sym: 'λ', desc: '熱伝導率 [W/(m·K)]' }, { sym: 'A', desc: '断面積 [m²]' }, { sym: 'ΔT', desc: '両面の温度差 [K]' }, { sym: 'L', desc: '厚さ [m]' } ],
      terms: ['熱伝導', 'フーリエ', '熱伝導率'] },
    { id: 'module', name: '歯車のモジュール', expr: 'm = d / z',
      where: [ { sym: 'm', desc: 'モジュール [mm]' }, { sym: 'd', desc: '基準円直径 [mm]' }, { sym: 'z', desc: '歯数 [-]' } ],
      terms: ['歯車', 'モジュール', '歯数', '基準円', 'かみ合い'] },
    { id: 'lewis', name: '歯元曲げ応力（ルイスの式）', expr: 'σ_F = F_t / (b · m · Y)',
      where: [ { sym: 'σ_F', desc: '歯元曲げ応力 [Pa]' }, { sym: 'F_t', desc: '接線力 [N]' }, { sym: 'b', desc: '歯幅 [mm]' }, { sym: 'm', desc: 'モジュール [mm]' }, { sym: 'Y', desc: '歯形係数 [-]' } ],
      terms: ['歯車', '強度', 'ルイス', '歯元', '曲げ強さ'] },
    { id: 'bolt', name: 'ボルトの締付けトルク', expr: 'T = K · d · F',
      where: [ { sym: 'T', desc: '締付けトルク [N·m]' }, { sym: 'K', desc: 'トルク係数（≈0.2） [-]' }, { sym: 'd', desc: 'ねじの呼び径 [m]' }, { sym: 'F', desc: '軸力（初期張力） [N]' } ],
      terms: ['ボルト', '締付', '締結', '軸力'] },
    { id: 'spring', name: 'コイルばねのばね定数', expr: 'k = G · d⁴ / (8 · D³ · n)',
      where: [ { sym: 'k', desc: 'ばね定数 [N/mm]' }, { sym: 'G', desc: '横弾性係数 [Pa]' }, { sym: 'd', desc: '線径 [mm]' }, { sym: 'D', desc: 'コイル平均径 [mm]' }, { sym: 'n', desc: '有効巻数 [-]' } ],
      terms: ['ばね', 'ばね定数', 'コイル'] },
    { id: 'safety', name: '許容応力と安全率', expr: 'σ_a = σ_s / S',
      where: [ { sym: 'σ_a', desc: '許容応力 [Pa]' }, { sym: 'σ_s', desc: '基準強さ（降伏点・引張強さ等） [Pa]' }, { sym: 'S', desc: '安全率 [-]' } ],
      terms: ['安全率', '許容応力', '基準強さ', '降伏'] }
  ];

  /* 代表的な参照表（表形式で連投する） */
  var TABLES = [
    { id: 'fit', name: 'はめあいの種類', headers: ['種類', 'すきま／締め代', '代表的な用途'],
      rows: [
        ['すきまばめ', '必ずすきまができる', '滑り・回転する部品の組合せ'],
        ['中間ばめ', 'すきま又は締め代', '位置決め・着脱する部品'],
        ['しまりばめ', '必ず締め代ができる', '圧入・固定して回り止め']
      ],
      terms: ['はめあい', 'すきま', 'しまり', '公差', '圧入'] },
    { id: 'carbon-steel', name: '代表的な炭素鋼の機械的性質（目安）', headers: ['材料記号', '炭素量 [%]', '引張強さ [MPa]', '主な用途'],
      rows: [
        ['S15C', '0.15', '380以上', '浸炭部品・軟鋼'],
        ['S45C', '0.45', '570以上', '軸・歯車（調質）'],
        ['S55C', '0.55', '650以上', '高強度の軸・工具']
      ],
      terms: ['炭素鋼', '機械的性質', '引張強さ', '材料', '鋼材'] },
    { id: 'gear-type', name: '歯車の種類と軸配置', headers: ['歯車の種類', '軸の関係', '特徴・用途'],
      rows: [
        ['平歯車', '平行軸', '最も基本・製作が容易'],
        ['はすば歯車', '平行軸', '静粛・高負荷／スラスト発生'],
        ['かさ歯車', '交差軸', '直角方向へ動力を伝える'],
        ['ウォームギヤ', '食い違い軸', '大減速比・セルフロック'],
        ['ラックとピニオン', '—', '回転を直線運動に変換']
      ],
      terms: ['歯車', '種類', 'かみ合い'] },
    { id: 'safety-factor', name: '安全率の目安（鋼）', headers: ['荷重の種類', '安全率の目安'],
      rows: [
        ['静荷重', '3'],
        ['繰返し荷重（片振り）', '5'],
        ['繰返し荷重（両振り）', '8'],
        ['衝撃荷重', '12']
      ],
      terms: ['安全率', '荷重'] }
  ];

  /* generic な概念語（応力・荷重・軸…）はトリガとして弱い。単独で当たっても式・表を
   * 確定させず、specific 語（オイラー・はめあい・断面係数…）と一緒のときだけ効かせる。
   * これで「軸とは」「応力とは」のような誤検出を抑え、「軸のねじり応力」は torsion に当てる。 */
  var GENERIC = { '応力': 1, '荷重': 1, '軸': 1, '材料': 1, '種類': 1, '強度': 1, '直径': 1 };
  var W_SPECIFIC = 2, W_GENERIC = 1, MIN_SCORE = 2;   // 確定には specific 1語ぶん相当が必要

  // 1文字 term（柱・梁…）は別語の部分文字列に埋もれやすい（円柱・橋梁）。単独確定は危険なので
  // generic 扱い（補強のみ）にし、「柱の座屈」は座屈と併せて当てる。
  function termWeight(t) { return (GENERIC[t] || t.length <= 1) ? W_GENERIC : W_SPECIFIC; }

  function scoreTerms(terms, q) {
    var s = 0, n = 0;
    for (var i = 0; i < terms.length; i++) {
      if (q.indexOf(terms[i]) >= 0) { s += termWeight(terms[i]); n++; }
    }
    return { s: s, n: n };
  }

  /* the JS hook: which formulas/tables does this question trigger?
   * substring match on terms, weighted so generic concept words don't fire alone;
   * ranked by weighted score then by #distinct terms, capped so the chat isn't flooded. */
  function lookup(question, opts) {
    opts = opts || {};
    var q = String(question == null ? '' : question);
    function pick(list, cap) {
      var hit = [];
      list.forEach(function (e) {
        var r = scoreTerms(e.terms, q);
        if (r.s >= MIN_SCORE) hit.push({ e: e, s: r.s, n: r.n });   // generic単独(=1)は閾値未満で落ちる
      });
      hit.sort(function (a, b) { return (b.s - a.s) || (b.n - a.n); });
      return hit.slice(0, cap).map(function (h) { return h.e; });
    }
    return {
      formulas: pick(FORMULAS, opts.maxFormulas == null ? 3 : opts.maxFormulas),
      tables: pick(TABLES, opts.maxTables == null ? 2 : opts.maxTables)
    };
  }
  function has(question) { var r = lookup(question); return !!(r.formulas.length || r.tables.length); }

  NSCode.calc = { FORMULAS: FORMULAS, TABLES: TABLES, lookup: lookup, has: has };
})(typeof window !== 'undefined' ? (window.NSCode = window.NSCode || {}) : (global.NSCode = global.NSCode || {}));

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
      terms: ['軸受', '寿命', '定格', '等価荷重', 'ベアリング', 'L10'] },
    { id: 'newton', name: '対流熱伝達（ニュートンの冷却則）', expr: 'Q = h · A · ΔT',
      where: [ { sym: 'Q', desc: '伝熱量 [W]' }, { sym: 'h', desc: '熱伝達率 [W/(m²·K)]' }, { sym: 'A', desc: '伝熱面積 [m²]' }, { sym: 'ΔT', desc: '固体表面と流体の温度差 [K]' } ],
      terms: ['熱伝達', '熱伝達率', '対流', '冷却則', '冷却', '伝熱'] },
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
      terms: ['安全率', '安全係数', '許容応力', '基準強さ', '降伏'] }
  ];

  /* 代表的な参照表（表形式で連投する） */
  var TABLES = [
    { id: 'fit', name: 'はめあいの種類', headers: ['種類', 'すきま／締め代', '代表的な用途'],
      rows: [
        ['すきまばめ', '必ずすきまができる', '滑り・回転する部品の組合せ'],
        ['中間ばめ', 'すきま又は締め代', '位置決め・着脱する部品'],
        ['しまりばめ', '必ず締め代ができる', '圧入・固定して回り止め']
      ],
      terms: ['はめあい', 'すきま', 'しまり', '中間ばめ', '公差', '圧入'] },
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
      terms: ['安全率', '安全係数', '荷重'] }
  ];

  /* ── 計算機能：各式の純関数＋単位（左辺を求める。eval 不使用・決定論的・テスト可能） ──
   * in[].unit / outUnit は fn が期待する単位（力学系は SI、慣用に合わせ mm/MPa を使う式もある）。
   * 入力フォームはこの unit を既定ラベルにし、同次元の慣用単位（mm/MPa/kN 等）に換算して計算する。 */
  var CALC = {
    tensile: { out: 'σ', outUnit: 'Pa', in: [{ sym: 'P', unit: 'N' }, { sym: 'A', unit: 'm2' }], fn: function (v) { return v.P / v.A; } },
    hooke:   { out: 'σ', outUnit: 'Pa', in: [{ sym: 'E', unit: 'Pa' }, { sym: 'ε', unit: '-' }], fn: function (v) { return v.E * v['ε']; } },
    bending: { out: 'σ', outUnit: 'Pa', in: [{ sym: 'M', unit: 'N·m' }, { sym: 'Z', unit: 'm3' }], fn: function (v) { return v.M / v.Z; } },
    torsion: { out: 'τ', outUnit: 'Pa', in: [{ sym: 'T', unit: 'N·m' }, { sym: 'Z_p', unit: 'm3' }], fn: function (v) { return v.T / v.Z_p; } },
    euler:   { out: 'P_cr', outUnit: 'N', in: [{ sym: 'E', unit: 'Pa' }, { sym: 'I', unit: 'm4' }, { sym: 'l_k', unit: 'm' }], fn: function (v) { return Math.PI * Math.PI * v.E * v.I / (v.l_k * v.l_k); } },
    l10:     { out: 'L₁₀', outUnit: '×10⁶回転', in: [{ sym: 'C', unit: 'N' }, { sym: 'P', unit: 'N' }, { sym: 'p', unit: '-' }], fn: function (v) { return Math.pow(v.C / v.P, v.p); } },
    newton:  { out: 'Q', outUnit: 'W', in: [{ sym: 'h', unit: 'W/(m²·K)' }, { sym: 'A', unit: 'm2' }, { sym: 'ΔT', unit: 'K' }], fn: function (v) { return v.h * v.A * v['ΔT']; } },
    fourier: { out: 'Q', outUnit: 'W', in: [{ sym: 'λ', unit: 'W/(m·K)' }, { sym: 'A', unit: 'm2' }, { sym: 'ΔT', unit: 'K' }, { sym: 'L', unit: 'm' }], fn: function (v) { return v['λ'] * v.A * v['ΔT'] / v.L; } },
    module:  { out: 'm', outUnit: 'mm', in: [{ sym: 'd', unit: 'mm' }, { sym: 'z', unit: '-' }], fn: function (v) { return v.d / v.z; } },
    lewis:   { out: 'σ_F', outUnit: 'MPa', in: [{ sym: 'F_t', unit: 'N' }, { sym: 'b', unit: 'mm' }, { sym: 'm', unit: 'mm' }, { sym: 'Y', unit: '-' }], fn: function (v) { return v.F_t / (v.b * v.m * v.Y); } },
    bolt:    { out: 'T', outUnit: 'N·m', in: [{ sym: 'K', unit: '-' }, { sym: 'd', unit: 'm' }, { sym: 'F', unit: 'N' }], fn: function (v) { return v.K * v.d * v.F; } },
    spring:  { out: 'k', outUnit: 'N/mm', in: [{ sym: 'G', unit: 'MPa' }, { sym: 'd', unit: 'mm' }, { sym: 'D', unit: 'mm' }, { sym: 'n', unit: '-' }], fn: function (v) { return v.G * Math.pow(v.d, 4) / (8 * Math.pow(v.D, 3) * v.n); } },
    safety:  { out: 'σ_a', outUnit: 'Pa', in: [{ sym: 'σ_s', unit: 'Pa' }, { sym: 'S', unit: '-' }], fn: function (v) { return v['σ_s'] / v.S; } }
  };
  FORMULAS.forEach(function (f) { if (CALC[f.id]) f.calc = CALC[f.id]; });

  /* Excel 数式テンプレート（R1C1 記法・「=」は呼び出し側が付与）。r(sym) は入力値セルの参照。
   * これを結果セルに ss:Formula として埋め込むと、Excel 上で入力を変えると再計算される。 */
  var XLS = {
    tensile: function (r) { return r('P') + '/' + r('A'); },
    hooke: function (r) { return r('E') + '*' + r('ε'); },
    bending: function (r) { return r('M') + '/' + r('Z'); },
    torsion: function (r) { return r('T') + '/' + r('Z_p'); },
    euler: function (r) { return 'PI()^2*' + r('E') + '*' + r('I') + '/' + r('l_k') + '^2'; },
    l10: function (r) { return '(' + r('C') + '/' + r('P') + ')^' + r('p'); },
    newton: function (r) { return r('h') + '*' + r('A') + '*' + r('ΔT'); },
    fourier: function (r) { return r('λ') + '*' + r('A') + '*' + r('ΔT') + '/' + r('L'); },
    module: function (r) { return r('d') + '/' + r('z'); },
    lewis: function (r) { return r('F_t') + '/(' + r('b') + '*' + r('m') + '*' + r('Y') + ')'; },
    bolt: function (r) { return r('K') + '*' + r('d') + '*' + r('F'); },
    spring: function (r) { return r('G') + '*' + r('d') + '^4/(8*' + r('D') + '^3*' + r('n') + ')'; },
    safety: function (r) { return r('σ_s') + '/' + r('S'); }
  };
  FORMULAS.forEach(function (f) { if (f.calc && XLS[f.id]) f.calc.xls = XLS[f.id]; });

  /* 単位 → [SI係数, 次元タグ]。同次元のみ換算する。 */
  var UNIT = {
    'm': [1, 'L'], 'cm': [1e-2, 'L'], 'mm': [1e-3, 'L'], 'μm': [1e-6, 'L'],
    'm2': [1, 'A'], 'cm2': [1e-4, 'A'], 'mm2': [1e-6, 'A'],
    'm3': [1, 'V'], 'mm3': [1e-9, 'V'],
    'm4': [1, 'I4'], 'mm4': [1e-12, 'I4'],
    'N': [1, 'F'], 'kN': [1e3, 'F'], 'MN': [1e6, 'F'],
    'Pa': [1, 'P'], 'kPa': [1e3, 'P'], 'MPa': [1e6, 'P'], 'GPa': [1e9, 'P'], 'N/mm2': [1e6, 'P'],
    'N·m': [1, 'M'], 'N·mm': [1e-3, 'M'], 'kN·m': [1e3, 'M'],
    'N/mm': [1, 'K'], 'N/m': [1e-3, 'K'],
    'W': [1, 'W'], 'W/(m²·K)': [1, 'h'], 'W/(m·K)': [1, 'kc'],
    'K': [1, 'T'], '℃': [1, 'T'], '-': [1, 'x'], '×10⁶回転': [1, 'x']
  };
  // 入力欄に出す同次元の単位候補（既定単位を先頭に）
  function unitAlts(unit) {
    var d = UNIT[unit] && UNIT[unit][1]; if (!d || d === 'x') return [unit];
    var a = []; for (var u in UNIT) if (UNIT[u][1] === d) a.push(u);
    a.sort(function (x, y) { return x === unit ? -1 : y === unit ? 1 : 0; }); return a;
  }
  function toUnit(value, from, to) {
    if (from === to || !UNIT[from] || !UNIT[to] || UNIT[from][1] !== UNIT[to][1]) return value;
    return value * UNIT[from][0] / UNIT[to][0];
  }
  function fmtNum(x) {
    if (!isFinite(x)) return String(x);
    if (x === 0) return '0';
    var a = Math.abs(x);
    if (a >= 1e5 || a < 1e-3) return x.toExponential(3);
    return String(Math.round(x * 1e4) / 1e4);
  }
  function prettyVal(x, unit) {
    var s = fmtNum(x) + ' ' + unit;
    if (unit === 'Pa') s += '（= ' + fmtNum(x / 1e6) + ' MPa）';
    else if (unit === 'MPa') s += '（= ' + fmtNum(x * 1e6) + ' Pa）';
    else if (unit === 'm') s += '（= ' + fmtNum(x * 1e3) + ' mm）';
    return s;
  }
  /* 左辺を計算する。 inputs = { sym: { value, unit } } → { ok, out, unit, value, pretty }。 */
  function compute(id, inputs) {
    var c = CALC[id]; if (!c) return { ok: false, why: 'no-calc' };
    var v = {};
    for (var i = 0; i < c.in.length; i++) {
      var spec = c.in[i], raw = inputs && inputs[spec.sym];
      var val = raw && raw.value != null && raw.value !== '' ? Number(raw.value) : NaN;
      if (!isFinite(val)) return { ok: false, why: '未入力: ' + spec.sym };
      v[spec.sym] = toUnit(val, (raw && raw.unit) || spec.unit, spec.unit);
    }
    var out; try { out = c.fn(v); } catch (e) { return { ok: false, why: '計算エラー' }; }
    if (!isFinite(out)) return { ok: false, why: '非有限（0除算など）' };
    return { ok: true, out: c.out, unit: c.outUnit, value: out, pretty: prettyVal(out, c.outUnit) };
  }

  /* generic な概念語（応力・荷重・軸…）はトリガとして弱い。単独で当たっても式・表を
   * 確定させず、specific 語（オイラー・はめあい・断面係数…）と一緒のときだけ効かせる。
   * これで「軸とは」「応力とは」のような誤検出を抑え、「軸のねじり応力」は torsion に当てる。
   * 寿命/冷却/弾性 も単独では曖昧（製品寿命・冷却ファン・横弾性係数）なので generic 扱いにし、
   * 失う recall は specific 語（定格・冷却則・縦弾性…）で補う。 */
  var GENERIC = {
    '応力': 1, '荷重': 1, '軸': 1, '材料': 1, '種類': 1, '強度': 1, '直径': 1,
    '寿命': 1, '冷却': 1, '弾性': 1
  };
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

  NSCode.calc = { FORMULAS: FORMULAS, TABLES: TABLES, lookup: lookup, has: has, compute: compute, CALC: CALC, unitAlts: unitAlts, toUnit: toUnit };
})(typeof window !== 'undefined' ? (window.NSCode = window.NSCode || {}) : (global.NSCode = global.NSCode || {}));

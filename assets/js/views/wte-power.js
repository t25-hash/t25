/* 発電量予測（ニューラル）— a trained regression neural net computes the
 * electric power of a waste-to-energy plant from waste throughput + composition
 * + boiler / generation efficiency. Shows the net's prediction next to the
 * physics formula so you can see the neural net actually does the calculation. */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, W = NSCode.wte, LABP = NSCode.wtePower;
  function el(id) { return document.getElementById(id); }
  var unsub = null;

  var state = Object.assign({ ton: 300, comp: [35, 12, 30, 10, 13], etaB: 0.82, etaG: 0.25 },
    NSCode.api.labState('#/wte') || {});
  function persist() { NSCode.api.labState('#/wte', state); }

  function range(id, min, max, step, val) {
    return '<input id="' + id + '" class="ns-range" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '">';
  }

  var THEORY =
    '<p class="ns-lesson">発電量は次の流れで決まります。ニューラルネットはこの関係を<b>データから学習</b>して再現します。</p>' +
    '<pre class="ns-code">ごみ組成（紙/プラ/厨芥/木/不燃）\n' +
    '   │ ① 低位発熱量 LHV(kJ/kg) = Σ 各割合 × 成分発熱量\n' +
    '   ▼\n' +
    'ごみカロリー LHV\n' +
    '   │ ② 入熱 Qin(kW) = 処理量(kg/s) × LHV\n' +
    '   ▼\n' +
    '入熱 Qin\n' +
    '   │ ③ 発電量 P(kW) = Qin × ボイラ効率 × 発電端効率\n' +
    '   ▼\n' +
    '発電量 P</pre>' +
    '<p class="ns-empty__hint">成分発熱量（kJ/kg・概算）: ' +
      W.COMP.map(function (c) { return c.label + ' ' + c.H; }).join(' / ') +
      '。発電端効率はタービン＋発電機の総合効率（ざっくり仮定）。</p>';

  NSCode.registerView({
    route: '#/wte', module: 'wte', title: '発電量予測 (Neural)',
    render: function () {
      var o = LABP.state.opts;
      return C.PageHeader({ title: '⚡ 発電量予測（ニューラル）', purpose: 'ごみ処理量・組成・効率から、学習済みニューラルネットが発電量を計算' }) +
        C.Panel({ title: '考え方（物理モデル）', body: THEORY }) +
        C.Panel({ title: 'ニューラルネットの学習状況', hint: '物理式から生成したデータで回帰ニューラルネット（MLP）を端末内学習',
          body:
            '<div id="wProg"></div>' +
            C.Controls([
              { label: '学習ステップ: <b id="wStepsV">' + o.steps + '</b>', control: range('wSteps', 4000, 30000, 1000, o.steps) },
              { label: '隠れ層ユニット: <b id="wHidV">' + o.hidden + '</b>', control: range('wHid', 8, 40, 4, o.hidden) }
            ]) +
            '<div class="ns-actions"><button id="wRetrain" class="ns-btn">この設定で再学習</button></div>' }) +
        C.Panel({ title: '入力（プラント条件）', hint: 'スライダーを動かすと発電量が即時に再計算されます',
          body:
            C.Controls([
              { label: 'ごみ処理量: <b id="wTonV">' + state.ton + '</b> t/日', control: range('wTon', 50, 600, 5, state.ton) }
            ]) +
            '<p class="ns-empty__hint" style="margin-top:6px">ごみ組成（相対量、合計100%に正規化）</p>' +
            C.Controls(W.COMP.map(function (c, i) {
              return { label: c.label + ': <b id="wC' + i + 'V">' + state.comp[i] + '</b>', control: range('wC' + i, 0, 50, 1, state.comp[i]) };
            })) +
            '<div id="wCompPct" class="ns-empty__hint"></div>' +
            C.Controls([
              { label: 'ボイラ効率: <b id="wEtaBV">' + state.etaB + '</b>', control: range('wEtaB', 0.6, 0.92, 0.01, state.etaB) },
              { label: '発電端効率（タービン+発電機）: <b id="wEtaGV">' + state.etaG + '</b>', control: range('wEtaG', 0.12, 0.32, 0.01, state.etaG) }
            ]) }) +
        C.Panel({ title: '結果', body: '<div id="wOut"></div>' });
    },
    onMount: function () {
      var ids = ['wTon', 'wEtaB', 'wEtaG', 'wC0', 'wC1', 'wC2', 'wC3', 'wC4'];
      ids.forEach(function (id) { var e = el(id); if (e) e.addEventListener('input', recompute); });

      bindLabel('wSteps', 'wStepsV');
      bindLabel('wHid', 'wHidV');
      el('wRetrain').addEventListener('click', function () {
        LABP.retrain({ steps: +el('wSteps').value, hidden: +el('wHid').value });
      });

      if (unsub) unsub();
      unsub = LABP.onChange(function () { renderProg(); recompute(); });
      LABP.ensure();
      renderProg(); recompute();
    }
  });

  function bindLabel(id, valId) { var r = el(id); if (r) r.addEventListener('input', function () { var v = el(valId); if (v) v.textContent = r.value; }); }

  function readInputs() {
    state.ton = +el('wTon').value;
    state.comp = [0, 1, 2, 3, 4].map(function (i) { return +el('wC' + i).value; });
    state.etaB = +el('wEtaB').value;
    state.etaG = +el('wEtaG').value;
    persist();
    var fr = W.normalizeFracs(state.comp);
    return { ton: state.ton, fr: fr, etaB: state.etaB, etaG: state.etaG };
  }

  function renderProg() {
    var box = el('wProg'); if (!box) return;
    var st = LABP.state;
    if (st.training) {
      var p = st.prog || { step: 0, total: st.opts.steps, rel: 1 };
      var pct = Math.round(100 * p.step / p.total);
      box.innerHTML = '<p class="ns-empty__hint">学習中… ' + pct + '%（平均誤差 ' + (p.rel != null ? (p.rel * 100).toFixed(1) + '%' : '—') + ' / RMSE ' + (p.rmse ? Math.round(p.rmse) + ' kW' : '—') + '）</p>' +
        '<div class="ns-progress"><div class="ns-progress__fill" style="width:' + pct + '%"></div></div>';
    } else if (st.model) {
      var rel = W.evalRel(st.model, st.ds);
      box.innerHTML = '<p class="ns-empty__hint">学習完了 — 検証データでの平均誤差 <b>' + (rel * 100).toFixed(1) + '%</b>（' + st.model.steps.toLocaleString() + ' ステップ）。以後、入力に対して発電量を即時に推論します。</p>';
    } else {
      box.innerHTML = '<p class="ns-empty__hint">未学習</p>';
    }
  }

  function recompute() {
    var out = el('wOut'); if (!out) return;
    var inp = readInputs();
    var fr = inp.fr;
    // update slider value labels + normalized %
    el('wTonV').textContent = state.ton;
    el('wEtaBV').textContent = state.etaB; el('wEtaGV').textContent = state.etaG;
    [0, 1, 2, 3, 4].forEach(function (i) { el('wC' + i + 'V').textContent = state.comp[i]; });
    el('wCompPct').textContent = '正規化: ' + W.COMP.map(function (c, i) { return c.label + ' ' + (fr[i] * 100).toFixed(0) + '%'; }).join(' / ');

    var phys = W.physics(inp.ton, fr, inp.etaB, inp.etaG);
    var nn = LABP.predict(inp);
    var mw = function (kw) { return (kw / 1000).toFixed(2); };
    var nnBlock = (nn == null)
      ? '<p class="ns-empty__hint">ニューラルネットの学習が終わると予測値を表示します。</p>'
      : '<div class="ns-grid" style="--cols:2">' +
          C.Metric({ label: '発電量（ニューラル予測）', value: Math.round(nn).toLocaleString(), unit: 'kW' }) +
          C.Metric({ label: '〃（参考: 理論式）', value: Math.round(phys.P).toLocaleString(), unit: 'kW' }) +
        '</div>' +
        '<p class="ns-empty__hint">ニューラル予測 ' + mw(nn) + ' MW ／ 理論式 ' + mw(phys.P) + ' MW ／ 差 ' +
          (phys.P > 0 ? (Math.abs(nn - phys.P) / phys.P * 100).toFixed(1) : '—') + '%</p>';

    out.innerHTML =
      '<div class="ns-grid" style="--cols:3">' +
        C.Metric({ label: 'ごみカロリー LHV', value: Math.round(phys.lhv).toLocaleString(), unit: 'kJ/kg' }) +
        C.Metric({ label: '〃', value: Math.round(phys.kcal).toLocaleString(), unit: 'kcal/kg' }) +
        C.Metric({ label: '入熱 Qin', value: mw(phys.Qin), unit: 'MW' }) +
      '</div>' +
      '<div class="ns-qa-answer" style="margin-top:12px"><div class="ns-qa-answer__label">発電量（ニューラルネットが計算）</div>' + nnBlock + '</div>';
  }
})(window.NSCode);

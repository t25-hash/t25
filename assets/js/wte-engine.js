/* WtE power predictor — a REAL regression neural network (MLP) that learns to
 * compute the electric power output of a waste-to-energy plant from waste
 * throughput + composition + efficiencies.
 *
 * Physics chain (the "ground truth" the net is trained to reproduce):
 *   ごみ組成 → 低位発熱量 LHV(kJ/kg) = Σ 各成分割合 × 成分発熱量
 *   入熱 Qin(kW) = 処理量(kg/s) × LHV
 *   発電量 P(kW)  = Qin × ボイラ効率 × 発電端効率（タービン+発電機）
 *
 * We sample many random plants, compute P with the formula, and train an MLP
 * (8 inputs → tanh → tanh → 1 linear) by backprop/SGD on standardized data.
 * Once trained, predict(inp) returns the net's P — which matches the formula,
 * i.e. the neural net actually computes the generation. No API, no libraries. */
(function (NSCode) {
  'use strict';

  /* waste components: as-received lower heating value (kJ/kg), rough values */
  var COMP = [
    { key: 'paper',   label: '紙類',           H: 13000 },
    { key: 'plastic', label: 'プラスチック類', H: 33000 },
    { key: 'food',    label: '厨芥（生ごみ）', H: 4000 },
    { key: 'wood',    label: '木・草・繊維',   H: 13000 },
    { key: 'other',   label: '不燃・その他',   H: 1000 }
  ];
  var NC = COMP.length;

  /* ---- physics (ground truth) ---- */
  function lhv(fracs) { var s = 0; for (var i = 0; i < NC; i++) s += fracs[i] * COMP[i].H; return s; } // kJ/kg
  function physics(ton, fracs, etaB, etaG) {
    var L = lhv(fracs);                 // kJ/kg (low heating value, ごみカロリー)
    var kgs = ton * 1000 / 86400;       // kg/s
    var Qin = kgs * L;                  // kW (thermal input)
    var P = Qin * etaB * etaG;          // kW (electric)
    return { lhv: L, kcal: L / 4.186, kgs: kgs, Qin: Qin, P: P };
  }
  function normalizeFracs(raw) {
    var s = 0, i; for (i = 0; i < raw.length; i++) s += raw[i];
    if (s <= 0) return raw.map(function () { return 1 / raw.length; });
    return raw.map(function (v) { return v / s; });
  }
  function vecOf(inp) { return [inp.ton, inp.fr[0], inp.fr[1], inp.fr[2], inp.fr[3], inp.fr[4], inp.etaB, inp.etaG]; }

  /* ---- random plant sampler (realistic-ish ranges) ---- */
  function sample() {
    var ton = 50 + Math.random() * 550;                 // 50..600 t/day
    var raw = [0.20 + Math.random() * 0.30, 0.05 + Math.random() * 0.15, 0.15 + Math.random() * 0.25,
               0.03 + Math.random() * 0.12, 0.03 + Math.random() * 0.17];
    var fr = normalizeFracs(raw);
    var etaB = 0.72 + Math.random() * 0.16;              // boiler 0.72..0.88
    var etaG = 0.12 + Math.random() * 0.16;              // generation-end 0.12..0.28
                                                         // (covers 300℃/25bar≈0.15 〜 450℃/60bar≈0.26)
    var inp = { ton: ton, fr: fr, etaB: etaB, etaG: etaG };
    return { x: vecOf(inp), y: physics(ton, fr, etaB, etaG).P, inp: inp };
  }
  function buildDataset(n) { var ds = []; for (var i = 0; i < (n || 800); i++) ds.push(sample()); return ds; }

  /* ---- standardization ---- */
  function fitNorm(ds) {
    var n = ds.length, dim = ds[0].x.length, i, d;
    var xMean = new Array(dim).fill(0), xStd = new Array(dim).fill(0), yMean = 0, yStd = 0;
    for (i = 0; i < n; i++) { d = ds[i]; for (var k = 0; k < dim; k++) xMean[k] += d.x[k]; yMean += d.y; }
    for (var k2 = 0; k2 < dim; k2++) xMean[k2] /= n; yMean /= n;
    for (i = 0; i < n; i++) { d = ds[i]; for (var k3 = 0; k3 < dim; k3++) { var dx = d.x[k3] - xMean[k3]; xStd[k3] += dx * dx; } var dy = d.y - yMean; yStd += dy * dy; }
    for (var k4 = 0; k4 < dim; k4++) xStd[k4] = Math.sqrt(xStd[k4] / n) || 1; yStd = Math.sqrt(yStd / n) || 1;
    return { xMean: xMean, xStd: xStd, yMean: yMean, yStd: yStd };
  }
  function normX(norm, x) { var o = new Float64Array(x.length); for (var i = 0; i < x.length; i++) o[i] = (x[i] - norm.xMean[i]) / norm.xStd[i]; return o; }
  function denormY(norm, yn) { return yn * norm.yStd + norm.yMean; }

  /* ---- generic dense MLP (tanh hidden, linear output) ---- */
  function initLayer(nin, nout) {
    var W = new Float64Array(nin * nout), b = new Float64Array(nout), s = Math.sqrt(2 / (nin + nout));
    for (var i = 0; i < W.length; i++) W[i] = (Math.random() * 2 - 1) * s;
    return { nin: nin, nout: nout, W: W, b: b };
  }
  function createModel(sizes) {
    var layers = []; for (var i = 0; i < sizes.length - 1; i++) layers.push(initLayer(sizes[i], sizes[i + 1]));
    return { sizes: sizes, layers: layers, norm: null, steps: 0, loss: 0 };
  }
  function forwardAll(m, x) {
    var a = x, acts = [x], zs = [], L = m.layers.length;
    for (var l = 0; l < L; l++) {
      var ly = m.layers[l], z = new Float64Array(ly.nout), out = new Float64Array(ly.nout), last = (l === L - 1);
      for (var o = 0; o < ly.nout; o++) {
        var s = ly.b[o];
        for (var i = 0; i < ly.nin; i++) s += a[i] * ly.W[i * ly.nout + o];
        z[o] = s; out[o] = last ? s : Math.tanh(s);
      }
      zs.push(z); acts.push(out); a = out;
    }
    return { acts: acts, out: a };
  }
  function trainStep(m, x, yTrue, lr) {
    var f = forwardAll(m, x), L = m.layers.length;
    var delta = new Float64Array(m.layers[L - 1].nout), loss = 0;
    for (var o = 0; o < delta.length; o++) { var e = f.out[o] - yTrue[o]; delta[o] = 2 * e; loss += e * e; }
    for (var l = L - 1; l >= 0; l--) {
      var ly = m.layers[l], aPrev = f.acts[l], dPrev = new Float64Array(ly.nin);
      for (var o2 = 0; o2 < ly.nout; o2++) {
        var d = delta[o2];
        for (var i = 0; i < ly.nin; i++) { dPrev[i] += d * ly.W[i * ly.nout + o2]; ly.W[i * ly.nout + o2] -= lr * d * aPrev[i]; }
        ly.b[o2] -= lr * d;
      }
      if (l > 0) { var actsIn = f.acts[l]; for (var i2 = 0; i2 < ly.nin; i2++) { var av = actsIn[i2]; dPrev[i2] *= (1 - av * av); } delta = dPrev; }
    }
    return loss;
  }

  /* train async in chunks; reports normalized MSE + a denormalized RMSE/relative
   * error so progress is interpretable. */
  function trainAsync(m, ds, opts) {
    opts = opts || {};
    var total = opts.steps || 9000, chunk = opts.chunk || 600, lr0 = opts.lr || 0.02;
    var onProgress = opts.onProgress, done = 0, ema = 0, N = ds.length;
    m.norm = m.norm || fitNorm(ds);
    return new Promise(function (resolve) {
      function run() {
        var end = Math.min(done + chunk, total);
        for (; done < end; done++) {
          var lr = lr0 * (1 - 0.6 * done / total);
          var d = ds[(Math.random() * N) | 0];
          var xn = normX(m.norm, d.x), yn = new Float64Array([(d.y - m.norm.yMean) / m.norm.yStd]);
          var l = trainStep(m, xn, yn, lr);
          ema = ema ? ema * 0.995 + l * 0.005 : l;
        }
        m.steps = done; m.loss = ema;
        if (onProgress) onProgress({ step: done, total: total, mse: ema, rmse: Math.sqrt(ema) * m.norm.yStd, rel: evalRel(m, ds) });
        if (done < total) setTimeout(run, 0); else resolve(m);
      }
      run();
    });
  }

  function predict(m, inp) {
    if (!m.norm) return null;
    var out = forwardAll(m, normX(m.norm, vecOf(inp))).out[0];
    return denormY(m.norm, out);
  }
  /* mean relative error on a sample of the dataset (for a human-readable score) */
  function evalRel(m, ds) {
    var n = Math.min(120, ds.length), s = 0, c = 0;
    for (var i = 0; i < n; i++) { var d = ds[(i * 7919) % ds.length]; var p = predict(m, d.inp); if (d.y > 1) { s += Math.abs(p - d.y) / d.y; c++; } }
    return c ? s / c : 0;
  }

  NSCode.wte = {
    COMP: COMP, NC: NC, lhv: lhv, physics: physics, normalizeFracs: normalizeFracs, vecOf: vecOf,
    sample: sample, buildDataset: buildDataset, createModel: createModel,
    forwardAll: forwardAll, trainAsync: trainAsync, predict: predict, evalRel: evalRel
  };

  /* ---- shared singleton: the trained predictor ---- */
  NSCode.wtePower = (function () {
    var state = { model: null, ds: null, training: false, prog: null, opts: { steps: 16000, lr: 0.02, hidden: 20, samples: 1000 } };
    var listeners = [];
    function notify() { for (var i = 0; i < listeners.length; i++) { try { listeners[i](state); } catch (e) {} } }
    function ensure(force) {
      if (!force && (state.model || state.training)) { notify(); return; }
      state.training = true; state.model = null; state.prog = { step: 0, total: state.opts.steps, mse: 0, rmse: 0, rel: 1 };
      state.ds = buildDataset(state.opts.samples);
      var m = createModel([8, state.opts.hidden, state.opts.hidden, 1]);
      notify();
      trainAsync(m, state.ds, { steps: state.opts.steps, lr: state.opts.lr, onProgress: function (s) { state.prog = s; notify(); } })
        .then(function () { state.model = m; state.training = false; notify(); });
    }
    return {
      state: state,
      onChange: function (fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
      ensure: ensure,
      retrain: function (opts) { if (opts) { for (var k in opts) state.opts[k] = opts[k]; } ensure(true); },
      predict: function (inp) { return state.model ? predict(state.model, inp) : null; }
    };
  })();
})(window.NSCode);

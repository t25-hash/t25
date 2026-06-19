/* Feedback learning loop — the "education" layer for Ask the baby.
 *
 * Ask answers are search+extraction: real sentences pulled from retrieved docs,
 * re-ranked by a per-question neural net. On their own they often miss intent and
 * never improve. This module lets the user grade each answer 👍/👎 and turns that
 * signal into THREE persistent levers (all local, no external API):
 *
 *   1) retrieval boost  — 👍 raises the weight of the question's terms so future
 *      searches favour the topics that satisfied the user (rag.retrieve({boost})).
 *   2) avoid + recall   — 👎 blocks the extracted sentence(s) for that question so
 *      a re-ask picks a different passage; 👍 remembers the question→answer so a
 *      near-duplicate question can reuse the vetted answer.
 *   3) accumulating net — 👍 answers feed a persistent neural LM that is warm-
 *      started from its previous weights and trained a little more each time, so
 *      its sentence-confidence (seqLogProb) sharpens toward "good" answers and is
 *      blended into Ask's re-ranking.
 *
 * State lives in localStorage (NSCode.store key "feedback"). Empty state = total
 * no-op, so Ask behaves exactly as before until the user starts grading.
 */
(function (NSCode) {
  'use strict';

  var STORE_KEY = 'feedback';
  var MAX_TERM = 3.0;          // boost weight ceiling
  var BASE_TERM = 1.0;         // unlearned weight (no boost)
  var REWARD = 0.5;            // +weight per 👍
  var MAX_ACCEPTED = 200, MAX_EVENTS = 500, MAX_BLOCKED_PER_Q = 50;
  var RECALL_MINCOS = 0.9;     // near-duplicate threshold for answer reuse
  var TRAIN_STEPS = 900;       // extra SGD steps per 👍 (warm-started)
  var MODEL_OPTS = { context: 3, dim: 24, hidden: 64, maxVocab: 480 };

  function fresh() { return { terms: {}, accepted: [], blocked: {}, model: null, events: [], good: 0, bad: 0 }; }
  function load() { var s = NSCode.store ? NSCode.store.get(STORE_KEY, null) : null; return s || fresh(); }
  function save() { if (NSCode.store) NSCode.store.set(STORE_KEY, data); }
  var data = load();
  var _model = null;           // restored persistent model (lazy)

  /* boost keys MUST match rag-engine's tokenizer so they hit the query vector */
  function ragTerms(t) { return (NSCode.rag && NSCode.rag.terms) ? NSCode.rag.terms(t) : []; }

  /* specific terms (kanji/katakana/latin runs ≥2) minus generic words — used for
   * the recall signature and the per-question block key. */
  var GENERIC = {};
  ('基礎 基本 分類 概要 定義 特徴 種類 方法 手法 仕組 構成 構造 応用 利用 評価 設計 解析 技術 装置 ' +
   'システム モデル 理論 原理 管理 問題 影響 関係 性質 目的 効果 対策 動向 歴史 意義 概念 機能 役割 課題 現状 動作')
    .split(' ').forEach(function (t) { GENERIC[t] = 1; });
  function keyTerms(q) {
    var runs = String(q == null ? '' : q).match(/[一-鿿]{2,}|[ァ-ヶー]{2,}|[A-Za-z][A-Za-z0-9\-]+/g) || [];
    var seen = {}, out = [];
    runs.forEach(function (r) { if (r.length >= 2 && !GENERIC[r] && !seen[r]) { seen[r] = 1; out.push(r); } });
    return out;
  }
  function sig(q) {
    var k = keyTerms(q);
    return (k.length ? k.slice().sort().join('|') : String(q == null ? '' : q).replace(/\s+/g, '')).toLowerCase();
  }

  /* split an answer into sentences (no lookbehind, for broad support) */
  function sentences(text) {
    return String(text == null ? '' : text)
      .replace(/([。．！？!?])/g, '$1').split('')
      .map(function (s) { return s.trim(); }).filter(function (s) { return s.length >= 6; });
  }

  function embedOf(t) {
    if (!NSCode.embeddings) return null;
    return Array.prototype.slice.call(NSCode.embeddings.embed(t, 64));
  }

  /* ---- public: record a grade -------------------------------------------- */
  // answer = { text, source, compose? }. Returns a Promise (good may train the net).
  function record(question, answer, label) {
    answer = answer || {};
    var text = answer.text || '';
    data.events.push({ q: String(question || ''), label: label, ts: Date.now() });
    if (data.events.length > MAX_EVENTS) data.events = data.events.slice(-MAX_EVENTS);

    if (label === 'good') {
      data.good = (data.good || 0) + 1;
      var seen = {};
      ragTerms(question).forEach(function (t) {
        if (seen[t]) return; seen[t] = 1;
        data.terms[t] = Math.min(MAX_TERM, (data.terms[t] || BASE_TERM) + REWARD);
      });
      if (text) {
        data.accepted.push({ qTerms: keyTerms(question), qEmb: embedOf(question), text: text, source: answer.source || '', ts: Date.now() });
        if (data.accepted.length > MAX_ACCEPTED) data.accepted = data.accepted.slice(-MAX_ACCEPTED);
      }
      save();
      return trainGood();
    }

    if (label === 'bad') {
      data.bad = (data.bad || 0) + 1;
      var k = sig(question), list = data.blocked[k] || [];
      var add = [text].concat(sentences(text)).concat(answer.compose || []);
      add.forEach(function (s) { s = (s || '').trim(); if (s && list.indexOf(s) < 0) list.push(s); });
      data.blocked[k] = list.slice(-MAX_BLOCKED_PER_Q);
      save();
      return Promise.resolve(null);
    }
    save();
    return Promise.resolve(null);
  }

  /* ---- public: levers consumed by ask-engine ----------------------------- */
  function boosts(question) {
    var out = {}, any = false;
    ragTerms(question).forEach(function (t) {
      if (data.terms[t] && data.terms[t] > BASE_TERM) { out[t] = data.terms[t]; any = true; }
    });
    return any ? out : null;     // null = no boost (retrieve stays identical)
  }
  function blockedFor(question) {
    var k = sig(question);
    return (data.blocked[k] || []).slice();
  }
  function recall(question, minCos) {
    minCos = minCos == null ? RECALL_MINCOS : minCos;
    if (!data.accepted.length || !NSCode.embeddings) return null;
    var qe = NSCode.embeddings.embed(question, 64), best = null, bs = minCos;
    data.accepted.forEach(function (a) {
      if (!a.qEmb) return;
      var c = NSCode.embeddings.cosine(qe, Float32Array.from(a.qEmb));
      if (c >= bs) { bs = c; best = a; }
    });
    return best ? { text: best.text, source: best.source, cos: bs } : null;
  }
  function model() {
    if (_model) return _model;
    if (data.model && NSCode.neuralLM) _model = NSCode.neuralLM.restore(data.model);
    return _model;
  }

  /* ---- persistent neural model (accumulates over 👍) --------------------- */
  function corpusText() {
    return data.accepted.map(function (a) { return (a.qTerms || []).join(' ') + ' ' + a.text; }).join('\n');
  }
  function trainGood() {
    var L = NSCode.neuralLM;
    if (!L) return Promise.resolve(null);
    var corpus = corpusText();
    var m = L.create(corpus, MODEL_OPTS);
    if (m.ids.length <= m.C + 4) return Promise.resolve(null);   // too little to train yet
    var prev = model();
    if (prev) L.warmStart(m, prev);
    return L.trainAsync(m, { steps: TRAIN_STEPS, chunk: 300, lr: 0.12 }).then(function () {
      _model = m; data.model = L.serialize(m); save(); return m;
    });
  }

  /* ---- status + reset (for the Ask "学習状況" panel) --------------------- */
  function stats() {
    var top = Object.keys(data.terms)
      .filter(function (t) { return data.terms[t] > BASE_TERM; })
      .sort(function (a, b) { return data.terms[b] - data.terms[a]; })
      .slice(0, 12)
      .map(function (t) { return { term: t, weight: +data.terms[t].toFixed(2) }; });
    return {
      good: data.good || 0, bad: data.bad || 0,
      learnedTerms: top, accepted: data.accepted.length,
      blockedQ: Object.keys(data.blocked).length,
      model: data.model ? { steps: data.model.steps || 0, loss: +(data.model.loss || 0).toFixed(3), vocab: data.model.V || 0 } : null
    };
  }
  function reset() { data = fresh(); _model = null; save(); }

  NSCode.feedback = {
    record: record, boosts: boosts, blockedFor: blockedFor, recall: recall,
    model: model, stats: stats, reset: reset,
    keyTerms: keyTerms, sig: sig
  };
})(window.NSCode);

/* NSCode Ask engine — a small but REAL RAG over your own documents, offline.
 * Pipeline: your docs -> chunk -> TF-IDF cosine retrieve -> grounded answer.
 * Retrieval is real (NSCode.rag). The answer is EXTRACTIVE (top sentences from
 * retrieved passages, ranked by embedding similarity) — no text generation;
 * an LLM-generated answer needs the backend in docs/05. KB is persisted. */
(function (NSCode) {
  'use strict';
  var store = NSCode.store;

  var DEFAULT_DOCS = [
    { name: 'rag-basics.md', text:
      'RAG（検索拡張生成）は、外部知識を検索してプロンプトに注入し、回答の事実性を高める手法です。\n\n' +
      'まず文書をチャンクに分割し、各チャンクをベクトル化して索引します。質問が来たら、質問に近いチャンクを類似度で取り出します。\n\n' +
      '取り出したチャンクをコンテキストとしてプロンプトに入れ、その範囲だけを根拠に答えさせます。これにより、モデルが知らない最新情報や社内文書にも答えられます。\n\n' +
      'チャンクサイズが大きすぎると無関係な情報が混ざり、小さすぎると文脈が切れます。オーバーラップを設けると境界の文脈が保たれます。' },
    { name: 'agents.md', text:
      'エージェントは観察・思考・行動のループを回し、ツールを使ってタスクを達成します。\n\n' +
      '計画を立て、行動し、結果を観察し、必要なら計画を修正して再試行します。RAG はエージェントの「知識を調べる」行動としても使えます。' }
  ];

  function getDocs() { return store.get('ask.docs', DEFAULT_DOCS); }
  function setDocs(docs) { store.set('ask.docs', docs); }
  function resetDocs() { store.set('ask.docs', DEFAULT_DOCS); return DEFAULT_DOCS; }

  /* chunk every doc, tagging each chunk with its source document name */
  function buildChunks(docs) {
    var all = [];
    docs.forEach(function (d) {
      NSCode.rag.chunk(d.text || '', { size: 320, overlap: 60, separator: '\n\n' })
        .forEach(function (c) { all.push({ id: all.length, text: c.text, source: d.name }); });
    });
    return all;
  }

  /* ask a question over the docs -> { answer:[{s,src,score}], hits, prompt, chunks } */
  function ask(query, opts) {
    opts = opts || {};
    var docs = opts.docs || getDocs();
    var chunks = buildChunks(docs);
    if (!chunks.length || !query) return null;
    var res = NSCode.rag.retrieve(query, chunks, { topK: opts.topK || 4, threshold: 0 });
    var emb = NSCode.embeddings, qv = emb.embed(query, 64);
    var sents = [];
    res.hits.forEach(function (h) {
      NSCode.research.splitSentences(h.chunk.text).forEach(function (s) {
        sents.push({ s: s, src: h.chunk.source, score: emb.cosine(qv, emb.embed(s, 64)) });
      });
    });
    sents.sort(function (a, b) { return b.score - a.score; });
    var answer = [];
    for (var i = 0; i < sents.length && answer.length < 3; i++) {
      var c = sents[i].s;
      var dup = answer.some(function (p) { return p.s.indexOf(c) >= 0 || c.indexOf(p.s) >= 0; });
      if (!dup) answer.push(sents[i]);
    }
    return { answer: answer, hits: res.hits, chunks: chunks, prompt: NSCode.rag.buildContext(res.hits, null, query) };
  }

  NSCode.askEngine = {
    DEFAULT_DOCS: DEFAULT_DOCS,
    getDocs: getDocs, setDocs: setDocs, resetDocs: resetDocs,
    buildChunks: buildChunks, ask: ask
  };
})(window.NSCode);

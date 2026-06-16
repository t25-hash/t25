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

  /* ask a question over the docs, the Claude Code way (RAG → generate):
   * retrieve relevant chunks → train a tiny in-browser LM on them → GENERATE an
   * answer by next-token prediction. Returns { generated, seed, trace, hits, prompt }. */
  function ask(query, opts) {
    opts = opts || {};
    var docs = opts.docs || getDocs();
    var chunks = buildChunks(docs);
    if (!chunks.length || !query) return null;
    var res = NSCode.rag.retrieve(query, chunks, { topK: opts.topK || 4, threshold: 0 });
    var emb = NSCode.embeddings, qv = emb.embed(query, 64);
    var L = NSCode.babyLLM;

    // training text: whole corpus + retrieved context (context weighted x2 so the
    // generated answer is grounded in what was retrieved for THIS question)
    var contextText = res.hits.map(function (h) { return h.chunk.text; }).join('\n');
    var corpusText = docs.map(function (d) { return d.text; }).join('\n');
    var model = L.train(corpusText + '\n' + contextText + '\n' + contextText, 3);

    // seed: the opening tokens of the most query-relevant sentence (keeps it on-topic)
    var sents = NSCode.research.splitSentences(contextText);
    sents.sort(function (a, b) { return emb.cosine(qv, emb.embed(b, 64)) - emb.cosine(qv, emb.embed(a, 64)); });
    var seedSent = sents[0] || query;
    var seedToks = L.tokenize(seedSent).slice(0, 2);
    if (!seedToks.length) seedToks = L.tokenize(query).slice(0, 2);

    var genOpts = { temperature: opts.temperature == null ? 0.8 : opts.temperature, topK: opts.topK2 || 8, maxTokens: opts.maxTokens || 60 };
    var gen = L.generate(model, seedToks, genOpts);

    return {
      generated: L.join(gen),
      seed: L.join(seedToks),
      trace: L.trace(model, seedToks, 5, genOpts),
      vocab: model.vocab,
      hits: res.hits, chunks: chunks,
      prompt: NSCode.rag.buildContext(res.hits, null, query)
    };
  }

  NSCode.askEngine = {
    DEFAULT_DOCS: DEFAULT_DOCS,
    getDocs: getDocs, setDocs: setDocs, resetDocs: resetDocs,
    buildChunks: buildChunks, ask: ask
  };
})(window.NSCode);

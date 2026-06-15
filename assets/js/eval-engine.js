/* NSCode Evaluation engine — offline, deterministic quality evaluation.
 * For RAG it computes REAL Precision@k / Recall@k against a small built-in
 * labeled dataset (corpus + relevance judgments), reusing NSCode.rag.retrieve.
 * Latency / cost / hallucinationRate are clearly-labeled deterministic ESTIMATES
 * (no LLM, no network). The UI surfaces which numbers are real vs estimated. */
(function (NSCode) {
  'use strict';
  var R = NSCode.rag;

  /* ~10 short documents on mixed topics; index = doc id. */
  var CORPUS = [
    'RAG（検索拡張生成）は外部知識を検索してプロンプトに注入し、回答の事実性を高める手法です。',                       // 0 RAG
    'Reranking reorders retrieved chunks. MMR balances relevance against diversity to reduce redundancy.',          // 1 RAG/rerank
    'Vector embeddings map text into a numeric space where similar meanings have similar vectors.',                 // 2 embeddings
    'Cosine similarity measures the angle between two embedding vectors; 1 means identical direction.',             // 3 embeddings
    'Photosynthesis lets plants convert sunlight, water and carbon dioxide into glucose and oxygen.',              // 4 biology
    '光合成では植物が太陽光と水と二酸化炭素から糖と酸素を作り出します。',                                                 // 5 biology (JP)
    'The mitochondria is the organelle that produces ATP, the energy currency of the cell.',                        // 6 biology
    'A transformer model uses self-attention to weigh the importance of tokens in a sequence.',                     // 7 ML
    'Gradient descent iteratively updates model weights to minimize a loss function.',                              // 8 ML
    'Tokenization splits raw text into smaller units called tokens before a model can process it.'                  // 9 NLP
  ];

  /* ~5 labeled queries with the doc ids judged relevant. */
  var QUERIES = [
    { query: 'How does reranking with MMR work in retrieval augmented generation?', relevantIds: [0, 1] },
    { query: 'What are vector embeddings and how is cosine similarity used?',        relevantIds: [2, 3] },
    { query: '光合成とは何ですか',                                                    relevantIds: [4, 5] },
    { query: 'How do transformer models train with gradient descent?',              relevantIds: [7, 8] },
    { query: 'tokenization of text into tokens',                                    relevantIds: [9] }
  ];

  /* Sample answer/context pairs for the hallucination ESTIMATE. The first answer
   * is grounded; the second injects an unsupported claim. */
  var HAL_SAMPLES = [
    {
      context: CORPUS[0] + ' ' + CORPUS[1],
      answer: 'RAGは外部知識を検索してプロンプトに注入し、事実性を高めます。Rerankingは関連性と多様性を両立します。'
    },
    {
      context: CORPUS[2] + ' ' + CORPUS[3],
      answer: 'Embeddings map text into vectors and cosine similarity compares them. The system also guarantees 99.99% accuracy via quantum teleportation.'
    }
  ];

  function asChunks(corpus) {
    return corpus.map(function (text, i) { return { id: i, text: text }; });
  }

  function intersectionCount(a, b) {
    var set = {}, n = 0;
    a.forEach(function (x) { set[x] = 1; });
    b.forEach(function (x) { if (set[x]) n++; });
    return n;
  }

  /* REAL metrics: Precision@k = |retrieved ∩ relevant| / |retrieved|,
   *               Recall@k    = |retrieved ∩ relevant| / |relevant|. */
  function evaluateRAG(opts) {
    opts = opts || {};
    var topK = Math.max(1, opts.topK || 3);
    var chunks = asChunks(CORPUS);

    var perQuery = QUERIES.map(function (q) {
      var res = R.retrieve(q.query, chunks, { topK: topK, threshold: 0 });
      var retrievedIds = res.hits.map(function (h) { return h.chunk.id; });
      var hit = intersectionCount(retrievedIds, q.relevantIds);
      var precision = retrievedIds.length ? hit / retrievedIds.length : 0;
      var recall = q.relevantIds.length ? hit / q.relevantIds.length : 0;
      return {
        query: q.query,
        precision: precision,
        recall: recall,
        retrievedIds: retrievedIds,
        relevantIds: q.relevantIds.slice()
      };
    });

    var n = perQuery.length || 1;
    var macroPrecision = perQuery.reduce(function (s, r) { return s + r.precision; }, 0) / n;
    var macroRecall = perQuery.reduce(function (s, r) { return s + r.recall; }, 0) / n;
    var f1 = (macroPrecision + macroRecall) ? 2 * macroPrecision * macroRecall / (macroPrecision + macroRecall) : 0;

    var est = estimates(topK, CORPUS.length);

    return {
      target: 'RAG',
      perQuery: perQuery,
      macroPrecision: macroPrecision,
      macroRecall: macroRecall,
      f1: f1,
      latencyMs: est.latencyMs,
      costUsd: est.costUsd,
      hallucinationRate: hallucinationRate()
    };
  }

  /* ESTIMATE: hallucination fraction — runs the real overlap heuristic on the
   * sample pairs, but reports it as an estimate since the answers are canned. */
  function hallucinationRate() {
    var flagged = 0, total = 0;
    HAL_SAMPLES.forEach(function (s) {
      var rows = R.analyzeHallucination(s.answer, s.context);
      rows.forEach(function (r) { total++; if (r.flagged) flagged++; });
    });
    return total ? flagged / total : 0;
  }

  /* ESTIMATE: deterministic latency/cost derived from topK and corpus size.
   * No real timing — purely a formula so results are reproducible. */
  function estimates(topK, corpusSize) {
    var latencyMs = 40 + corpusSize * 6 + topK * 12;            // index scan + per-hit assembly
    var promptTokens = corpusSize * 18 + topK * 24 + 32;        // rough token estimate
    var completionTokens = topK * 16 + 48;
    // illustrative price points ($/1K tokens): in 0.003, out 0.015
    var costUsd = (promptTokens / 1000) * 0.003 + (completionTokens / 1000) * 0.015;
    return { latencyMs: latencyMs, costUsd: costUsd, promptTokens: promptTokens, completionTokens: completionTokens };
  }

  /* Illustrative (placeholder) metrics for targets without a real harness yet.
   * Deterministic per target so the UI is stable; clearly labeled as estimates. */
  function estimateTarget(target, topK) {
    topK = Math.max(1, topK || 3);
    var seed = { Agent: 0.78, Prompt: 0.85, Tool: 0.81 }[target] || 0.8;
    var est = estimates(topK, CORPUS.length);
    var precision = seed;
    var recall = Math.max(0, Math.min(1, seed - 0.06));
    var f1 = (precision + recall) ? 2 * precision * recall / (precision + recall) : 0;
    return {
      target: target,
      estimated: true,
      perQuery: [],
      macroPrecision: precision,
      macroRecall: recall,
      f1: f1,
      latencyMs: est.latencyMs + 60,
      costUsd: est.costUsd * 1.5,
      hallucinationRate: hallucinationRate()
    };
  }

  NSCode.evaluation = {
    corpus: CORPUS,
    queries: QUERIES,
    halSamples: HAL_SAMPLES,
    evaluateRAG: evaluateRAG,
    estimateTarget: estimateTarget,
    estimates: estimates,
    hallucinationRate: hallucinationRate
  };
})(window.NSCode);

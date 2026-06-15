/* NSCode Memory engine — runs fully offline (no LLM / no backend).
 * compress(): heuristic extractive summary over conversation turns using
 *   NSCode.research.summarize (frequency-scored sentence selection).
 * recall(): REAL cosine similarity over hashing-trick embeddings
 *   (NSCode.embeddings) — deterministic, but LEXICAL (not learned/neural). */
(function (NSCode) {
  'use strict';

  var R = NSCode.research, EMB = NSCode.embeddings;

  /* Compress an array of conversation turns ({role, text}) into a short
   * extractive summary. Returns before/after char counts and reduction ratio. */
  function compress(turns, nSentences) {
    turns = turns || [];
    var texts = turns.map(function (t) { return (t && t.text) || ''; })
      .filter(function (s) { return s.length; });
    var joined = texts.join(' ');
    var n = nSentences || 3;
    var sents = R.summarize(joined, n); // array of sentences
    var summary = sents.join(' ');
    var beforeChars = joined.length;
    var afterChars = summary.length;
    var ratio = beforeChars ? (1 - afterChars / beforeChars) : 0;
    if (ratio < 0) ratio = 0;
    return {
      summary: summary,
      sentences: sents,
      beforeChars: beforeChars,
      afterChars: afterChars,
      ratio: ratio
    };
  }

  /* Rank memory items by cosine similarity of embeddings to the query.
   * items: array of strings OR {text} objects. Returns [{item, text, score}]. */
  function recall(query, items, k) {
    items = items || [];
    var qvec = EMB.embed(String(query || ''), 64);
    var ranked = items.map(function (it) {
      var text = (typeof it === 'string') ? it : ((it && it.text) || '');
      var score = EMB.cosine(qvec, EMB.embed(text, 64));
      return { item: it, text: text, score: score };
    });
    ranked.sort(function (a, b) { return b.score - a.score; });
    if (typeof k === 'number' && k > 0) ranked = ranked.slice(0, k);
    return ranked;
  }

  NSCode.memory = { compress: compress, recall: recall };
})(window.NSCode);

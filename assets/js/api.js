/* NSCode API layer (see docs/05). Skeleton implementation backed by
 * NSCode.store (localStorage). Swap these methods for fetch() to go live —
 * keep the signatures identical. */
(function (NSCode) {
  'use strict';
  var store = NSCode.store;

  NSCode.api = {
    /* papers: metadata + offline summary/keywords (full text is not persisted
     * to stay within localStorage quota — see docs/04). */
    listPapers: function () { return store.get('papers', []); },
    savePaper: function (p) {
      var list = store.get('papers', []);
      p = Object.assign({ id: 'paper_' + Date.now(), uploaded_at: new Date().toISOString() }, p);
      list.unshift(p); store.set('papers', list.slice(0, 20));
      return p;
    },

    labState: function (route, state) {
      if (typeof state === 'undefined') return store.get('lab.' + route, null);
      store.set('lab.' + route, state); return state;
    },

    /* Generation endpoints: stubbed until backend is wired (docs/05 §4). */
    runLLM: function () { return Promise.resolve({ output: '(stub) backend 未接続', usage: {}, latency_ms: 0 }); },
    tokenize: function (text) { return Promise.resolve({ tokens: String(text || '').split(/(\s+)/).filter(Boolean), ids: [] }); }
  };
})(window.NSCode);

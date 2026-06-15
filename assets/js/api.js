/* NSCode API layer (see docs/05). Skeleton implementation backed by
 * NSCode.store (localStorage). Swap these methods for fetch() to go live —
 * keep the signatures identical. */
(function (NSCode) {
  'use strict';
  var store = NSCode.store;

  NSCode.api = {
    /* progress: { [topicId]: { status, percent } } */
    getProgress: function () { return store.get('progress', {}); },
    putProgress: function (topicId, data) {
      var p = store.get('progress', {});
      p[topicId] = Object.assign({ status: 'in_progress', percent: 0 }, p[topicId], data);
      store.set('progress', p);
      return p[topicId];
    },

    listArtifacts: function () { return store.get('artifacts', []); },
    createArtifact: function (a) {
      var list = store.get('artifacts', []);
      a = Object.assign({ id: 'art_' + Date.now(), created_at: new Date().toISOString() }, a);
      list.push(a); store.set('artifacts', list);
      return a;
    },

    listChallenges: function () { return store.get('challenges', {}); },
    submitChallenge: function (id, artifactId) {
      var c = store.get('challenges', {});
      c[id] = { status: 'submitted', artifact: artifactId, score: null };
      store.set('challenges', c);
      return c[id];
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

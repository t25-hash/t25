/* Academy (ACAD) — 理論学習: カテゴリ → トピック */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;

  var CATALOG = {
    llm: { name: 'LLM', topics: ['Token', 'Tokenizer', 'Vocabulary', 'Embedding', 'Transformer', 'Attention', 'Decoder', 'Reasoning', 'Inference', 'Temperature', 'TopK', 'TopP'] },
    prompt: { name: 'Prompt Engineering', topics: ['Zero Shot', 'Few Shot', 'CoT', 'ReAct', 'Reflection', 'Self Critique'] },
    embedding: { name: 'Embedding', topics: ['Vector', 'Cos Similarity', 'Distance', 'Semantic Search'] },
    rag: { name: 'RAG', topics: ['Chunk', 'Embedding', 'Retrieval', 'ReRank', 'Context Injection'] },
    mcp: { name: 'MCP', topics: ['Client', 'Server', 'Protocol', 'Tool Exposure'] },
    agent: { name: 'Agent', topics: ['Planning', 'Action', 'Observation', 'Reflection', 'Retry'] },
    'multi-agent': { name: 'Multi-Agent', topics: ['Manager', 'Worker', 'Coordinator', 'Consensus'] }
  };
  // expose so other modules / plugins can extend
  NSCode.academyCatalog = CATALOG;

  function slug(s) { return s.toLowerCase().replace(/\s+/g, '-'); }

  NSCode.registerView({
    route: '#/academy', module: 'academy', title: 'Academy',
    render: function () {
      var cards = Object.keys(CATALOG).map(function (id) {
        var c = CATALOG[id];
        return C.Card({ title: c.name, badge: c.topics.length + ' topics',
          body: c.topics.slice(0, 4).join(' · ') + ' …', href: '#/academy/' + id });
      }).join('');
      return C.PageHeader({ title: 'Academy', purpose: '理論学習' }) +
        C.Grid(cards, 3);
    }
  });

  NSCode.registerView({
    route: '#/academy/:category', module: 'academy', title: 'Academy',
    render: function (ctx) {
      var c = CATALOG[ctx.params.category];
      if (!c) return C.PageHeader({ title: 'Academy', purpose: '理論学習' }) +
        C.EmptyState({ icon: '🔍', message: 'カテゴリが見つかりません。' });
      var cards = c.topics.map(function (t) {
        return C.Card({ title: t, href: '#/academy/' + ctx.params.category + '/' + slug(t) });
      }).join('');
      return C.PageHeader({ title: c.name, purpose: '学習トピック一覧',
        breadcrumb: ['Academy', c.name] }) + C.Grid(cards, 4);
    }
  });

  NSCode.registerView({
    route: '#/academy/:category/:topic', module: 'academy', title: 'Academy',
    render: function (ctx) {
      var c = CATALOG[ctx.params.category];
      var name = ctx.params.topic.replace(/-/g, ' ');
      return C.PageHeader({ title: name, purpose: (c ? c.name : '') + ' のトピック',
        breadcrumb: ['Academy', c ? c.name : ctx.params.category, name] }) +
        C.Panel({ title: '理論', body: C.EmptyState({ icon: '📘', message: '解説本文・図解が入ります（雛形）。' }) }) +
        C.Panel({ title: '関連 Lab で試す', hint: '見る → 触る → 試す',
          body: C.Grid(
            C.Card({ title: 'Embedding Lab', href: '#/embedding/token' }) +
            C.Card({ title: 'RAG Lab', href: '#/rag/chunk' }) +
            C.Card({ title: 'Agent Lab', href: '#/agent/loop' }), 3) });
    }
  });
})(window.NSCode);

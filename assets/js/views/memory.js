/* Memory Lab (MEM) — Memory理解 */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;
  var tabs = [
    { id: 'viewer', label: 'Memory Viewer', route: '#/memory/viewer' },
    { id: 'compression', label: 'Compression', route: '#/memory/compression' },
    { id: 'summary', label: 'Summary', route: '#/memory/summary' },
    { id: 'recall', label: 'Recall', route: '#/memory/recall' }
  ];
  var kinds = [
    C.Card({ title: 'Short Memory', body: '会話履歴' }),
    C.Card({ title: 'Long Memory', body: '永続保存' }),
    C.Card({ title: 'Semantic Memory', body: '知識' }),
    C.Card({ title: 'Episodic Memory', body: '経験' })
  ].join('');

  NSCode.registerLab({
    module: 'memory', title: 'Memory Lab', purpose: 'Memory理解', tabs: tabs,
    screens: {
      '#/memory/viewer': { title: 'Memory Viewer', purpose: '4種のメモリを確認', panels: [
        { title: 'Memory 種別', body: C.Grid(kinds, 4) }
      ] },
      '#/memory/compression': { title: 'Compression Viewer', purpose: '圧縮過程', panels: [
        { title: '圧縮', empty: '長い履歴を圧縮する過程を表示。' }
      ] },
      '#/memory/summary': { title: 'Summary Viewer', purpose: '要約結果', panels: [
        { title: '要約', empty: '会話/文書の要約を表示。' }
      ] },
      '#/memory/recall': { title: 'Recall Viewer', purpose: '想起結果', panels: [
        { title: '想起', empty: 'クエリに対する想起結果を表示。' }
      ] }
    }
  });
})(window.NSCode);

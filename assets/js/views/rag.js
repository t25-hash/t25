/* RAG Lab (RAG) — RAG内部理解（パイプライン順） */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;
  var tabs = [
    { id: 'chunk', label: 'Chunk', route: '#/rag/chunk' },
    { id: 'retrieval', label: 'Retrieval', route: '#/rag/retrieval' },
    { id: 'rerank', label: 'ReRank', route: '#/rag/rerank' },
    { id: 'context', label: 'Context Builder', route: '#/rag/context' },
    { id: 'hallucination', label: 'Hallucination', route: '#/rag/hallucination' }
  ];
  NSCode.registerLab({
    module: 'rag', title: 'RAG Lab', purpose: 'RAG内部理解', tabs: tabs,
    screens: {
      '#/rag/chunk': { title: 'Chunk Simulator', purpose: 'チャンク分割パラメータの影響を体験', panels: [
        { title: '設定', body: C.Controls([
            { label: 'Chunk Size', control: '<input class="ns-range" type="range" min="64" max="2048" step="64" value="512">' },
            { label: 'Overlap', control: '<input class="ns-range" type="range" min="0" max="512" step="16" value="64">' },
            { label: 'Separator', control: '<input class="ns-input" value="\\n\\n">' }
          ]) },
        { title: 'チャンク結果', empty: '分割されたチャンクをハイライト表示。' }
      ] },
      '#/rag/retrieval': { title: 'Retrieval Simulator', purpose: '検索パラメータの調整', panels: [
        { title: '設定', body: C.Controls([
            { label: 'TopK', control: '<input class="ns-range" type="range" min="1" max="20" value="5">' },
            { label: 'Threshold', control: '<input class="ns-range" type="range" min="0" max="1" step="0.05" value="0.5">' },
            { label: 'MMR', control: '<input type="checkbox" checked>' }
          ]) },
        { title: '検索結果', empty: '上位ヒットとスコアを表示。' }
      ] },
      '#/rag/rerank': { title: 'ReRanking Simulator', purpose: '再ランキングの効果を比較', panels: [
        { title: 'Before / After', empty: '再ランキング前後の順位を並列比較。' }
      ] },
      '#/rag/context': { title: 'Context Builder', purpose: '検索結果からプロンプトを構築', panels: [
        { title: '検索結果', empty: '注入される文脈を確認。' },
        { title: '最終プロンプト', empty: '組み立てられたプロンプトを表示。' }
      ] },
      '#/rag/hallucination': { title: 'Hallucination Viewer', purpose: '誤回答の解析', panels: [
        { title: '誤回答解析', empty: '文脈に無い主張をフラグ表示。' }
      ] }
    }
  });
})(window.NSCode);

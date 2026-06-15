/* Embedding Lab (EMB) — Embedding理解 */
(function (NSCode) {
  'use strict';
  var tabs = [
    { id: 'token', label: 'Token Visualizer', route: '#/embedding/token' },
    { id: 'vector', label: 'Embedding Viewer', route: '#/embedding/vector' },
    { id: 'similarity', label: 'Similarity Viewer', route: '#/embedding/similarity' },
    { id: 'cluster', label: 'Cluster Viewer', route: '#/embedding/cluster' }
  ];
  NSCode.registerLab({
    module: 'embedding', title: 'Embedding Lab', purpose: 'Embedding理解', tabs: tabs,
    screens: {
      '#/embedding/token': { title: 'Token Visualizer', purpose: '入力文 → Token分解 → Token ID', panels: [
        { title: '入力文', body: '<textarea class="ns-input" rows="2" placeholder="文を入力..."></textarea>' },
        { title: 'Token 分解', empty: 'トークン境界を可視化します。' },
        { title: 'Token ID', empty: '各トークンの ID を表示します。' }
      ] },
      '#/embedding/vector': { title: 'Embedding Viewer', purpose: 'ベクトル / 次元数 / モデル', panels: [
        { title: 'ベクトル', empty: '埋め込みベクトルの数値を表示。' },
        { title: 'メタ情報', empty: '次元数・モデル名を表示。' }
      ] },
      '#/embedding/similarity': { title: 'Similarity Viewer', purpose: '類似度の比較', panels: [
        { title: 'Cos Similarity', empty: 'コサイン類似度。' },
        { title: 'Euclidean', empty: 'ユークリッド距離。' },
        { title: 'Dot Product', empty: '内積。' }
      ] },
      '#/embedding/cluster': { title: 'Cluster Viewer', purpose: '次元削減による可視化', panels: [
        { title: '2D / 3D 表示', empty: 'PCA / UMAP による散布図。' }
      ] }
    }
  });
})(window.NSCode);

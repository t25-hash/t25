/* SCR-DASH-01 Dashboard — 学習状況の可視化 */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;

  NSCode.registerView({
    route: '#/dashboard', module: 'dashboard', title: 'Dashboard',
    render: function () {
      var progress = NSCode.api.getProgress();
      var areas = [
        { id: 'llm', label: 'LLM' }, { id: 'prompt', label: 'Prompt' },
        { id: 'embedding', label: 'Embedding' }, { id: 'rag', label: 'RAG' },
        { id: 'agent', label: 'Agent' }, { id: 'multi', label: 'Multi-Agent' }
      ];
      var bars = areas.map(function (a) {
        var pct = (progress[a.id] && progress[a.id].percent) || 0;
        return C.ProgressBar({ label: a.label, percent: pct });
      }).join('');

      var artifacts = NSCode.api.listArtifacts();
      var artBody = artifacts.length
        ? C.Table(['名前', '種別', '作成'], artifacts.map(function (a) {
            return [a.name || '(無題)', a.kind || '-', (a.created_at || '').slice(0, 10)];
          }))
        : C.EmptyState({ icon: '📦', message: 'まだ成果物がありません。', hint: 'Build Lab で作成すると、ここに一覧表示されます。' });

      return C.PageHeader({ title: 'Dashboard', purpose: '学習状況の可視化' }) +
        C.Panel({ title: '🔎 Ask (RAG) — 文書に基づいて質問', hint: '実際に動く RAG（検索=TF-IDF / 回答=抽出型）。詳細・文書追加は Ask ページへ',
          body:
            '<div class="ns-qa-bar"><input id="dashQ" class="ns-input" placeholder="例: チャンクサイズが大きすぎるとどうなる？">' +
            '<button id="dashAsk" class="ns-btn">質問</button>' +
            '<a class="ns-btn ns-btn--ghost" href="#/ask">Ask ページ →</a></div>' +
            '<div id="dashAns"></div>' }) +
        C.Panel({ title: '学習進捗', body: '<div class="ns-grid" style="--cols:3">' + bars + '</div>' }) +
        '<div class="ns-grid" style="--cols:2">' +
          C.Panel({ title: '現在学習中', body: C.EmptyState({ icon: '📖', message: '学習を開始すると進捗がここに表示されます。', hint: 'Academy から始めましょう。' }) }) +
          C.Panel({ title: '推奨次ステップ', body: C.Grid(
            C.Card({ title: 'Ask (RAG) を使う', body: '自分の文書で質問する', href: '#/ask' }) +
            C.Card({ title: 'RAG の内部を見る', body: 'Chunk → Retrieval → ReRank', href: '#/rag/chunk' }), 2) }) +
        '</div>' +
        C.Panel({ title: '成果物一覧', body: artBody });
    },
    onMount: function () {
      var A = NSCode.askEngine, C2 = NSCode.C;
      var q = document.getElementById('dashQ'), btn = document.getElementById('dashAsk'), out = document.getElementById('dashAns');
      if (!q || !btn || !out) return;
      function run() {
        var res = A.ask(q.value.trim(), { topK: 3 });
        if (!res) { out.innerHTML = C2.EmptyState({ icon: '🔎', message: '質問を入力してください（既定のサンプル文書で動きます）。' }); return; }
        out.innerHTML = res.answer.length
          ? '<div class="ns-qa-answer"><b>回答:</b><ul>' + res.answer.map(function (a) {
              return '<li>' + C2.esc(a.s) + ' <span class="ns-tag">' + C2.esc(a.src) + '</span></li>';
            }).join('') + '</ul></div>'
          : '<p class="ns-empty__hint">関連箇所が見つかりませんでした。</p>';
      }
      btn.addEventListener('click', run);
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    }
  });
})(window.NSCode);

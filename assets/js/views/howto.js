/* How To Answer — explains how Ask (RAG) builds an answer, and how an LLM works.
 * Educational, static, clean. No tabs. */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;

  function steps(items) {
    return '<ol class="ns-howto">' + items.map(function (it, i) {
      return '<li class="ns-howto__item"><span class="ns-step__no">' + (i + 1) + '</span>' +
        '<div class="ns-howto__body"><b>' + C.esc(it.t) + '</b><p>' + C.esc(it.d) + '</p></div></li>';
    }).join('') + '</ol>';
  }

  var ASK_STEPS = [
    { t: '文書を小さく分割する（チャンク）', d: '長い文書のままでは検索が粗くなるため、段落くらいの「チャンク」に分けます。少し重ねて（オーバーラップ）境界の文脈を保ちます。' },
    { t: '各チャンクを数値化して索引する', d: '文を数値ベクトルに変換し、「意味の近さ」を計算できるようにします。NSCode は語彙ベース（TF-IDF / ハッシュ埋め込み）で行います。' },
    { t: '質問と照合して関連チャンクを探す（検索）', d: '質問も同じように数値化し、コサイン類似度が高いチャンクを上位 K 件だけ取り出します。これが「Retrieval」。' },
    { t: '重複を避けて要点文を選ぶ（MMR）', d: '取り出したチャンクの中から、質問に関連が高く、かつ互いに内容が重複しない文を選抜します。最も関連の高い文を先頭にします。' },
    { t: '文脈で学習して回答を生成', d: '検索した文脈で、ブラウザ内の極小LLM（n-gram・赤ちゃん級）を学習させ、次トークン予測で回答を“生成”します（API不要）。出典も併せて表示。' }
  ];

  var LLM_STEPS = [
    { t: 'トークン化', d: '文を「トークン」（単語や部分語の断片）に分け、それぞれに ID を割り当てます。モデルは文字でなくトークン列を扱います。' },
    { t: '埋め込み（ベクトル化）', d: '各トークン ID を高次元の数値ベクトルへ変換します。意味的に近い語はベクトル空間でも近くに配置されます。' },
    { t: 'Transformer / 自己注意', d: '各トークンが文中の他のどのトークンをどれだけ参照するかを重み付け（アテンション）し、文脈を統合します。' },
    { t: '次トークン予測', d: '文脈から「次に来る確率が高いトークン」を計算し、1 つずつ生成して文を伸ばします（自己回帰）。' },
    { t: 'サンプリング（温度 / TopK / TopP）', d: '確率分布から実際に 1 つを選びます。温度が高いほど多様で創造的、低いほど決定的で安全になります。' }
  ];

  function render() {
    return C.PageHeader({ title: 'How To Answer', purpose: 'Ask（RAG）の回答の作り方と、LLM の仕組み' }) +
      C.Panel({ title: 'Ask はどう答えを作るか（RAG の流れ）', hint: '文書 → 検索 → 選抜 → 回答',
        body: steps(ASK_STEPS) +
          '<p class="ns-empty__hint">ポイント: NSCode の Ask は「検索」も「生成」も本物です。ただし生成は<b>極小の n-gram 言語モデル（赤ちゃん級・ニューラルでない・API不要）</b>。次トークン予測の仕組みは同じで、規模だけが小さい、という教育用です。</p>' }) +
      C.Panel({ title: 'LLM はどういう仕組みか', hint: 'トークン → 埋め込み → Transformer → 次トークン予測',
        body: steps(LLM_STEPS) +
          '<p class="ns-empty__hint">LLM は「次に来るトークンを予測する」ことを繰り返して文章を作ります。RAG は、その予測の前に<b>関連文書を文脈として渡す</b>ことで、事実に基づいた回答を促す手法です。' }) +
      C.Panel({ title: 'NSCode（今）と 本物の LLM-RAG の違い',
        body: C.Table(['工程', 'NSCode（今）', '本物の LLM-RAG'], [
          ['検索 (Retrieval)', 'TF-IDF コサイン（語彙ベース・実動）', 'ニューラル埋め込みによる意味検索'],
          ['生成 (Generation)', '極小 n-gram LM が次トークン予測（赤ちゃん級）', '巨大ニューラル LM が次トークン予測'],
          ['動作環境', 'ブラウザ内・オフライン・無料・API不要', 'モデル API（バックエンド）が必要']
        ]) +
          '<p class="ns-empty__hint">違いは主に「規模」：仕組み（トークン→確率→サンプリング→自己回帰）は同じで、NSCode はそれを丸ごとブラウザ内で動かしています。</p>' }) +
      C.Panel({ title: '関連ページ',
        body: C.Grid(
          C.Card({ title: 'Ask (RAG) を使う', body: '実際に文書で質問する', href: '#/ask' }) +
          C.Card({ title: 'RAG Lab で内部を見る', body: 'チャンク〜検索〜再ランク', href: '#/rag' }) +
          C.Card({ title: 'Embedding Lab', body: 'ベクトル化と類似度', href: '#/embedding' }) +
          C.Card({ title: 'Academy / LLM', body: 'トークン〜Transformer', href: '#/academy/llm' }), 2) });
  }

  NSCode.registerView({ route: '#/howto', module: 'howto', title: 'How To Answer', render: render });
})(window.NSCode);

/* 文法コンパイラ（Grammar Agent）— SML（意味スロット）を自然な日本語へ変換する
 * 最終変換層を試すページ。意味は変えず、助詞補完・活用・語順・敬語・時制・句読点を適用。 */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, G = NSCode.grammar;
  function el(id) { return document.getElementById(id); }

  var EX1 = 'subject: 私\ntime: 昨日\nplace: 学校\nobject: 本\naction: 読む\ntense: past\npoliteness: polite';
  var EX2 = 'subject: この装置\nobject: 蒸気\naction: 高い\nadjective: 高い\ntense: past\npoliteness: polite';
  var EX3 = '私は 昨日 学校 本 読む 過去 丁寧';

  var ABOUT =
    '<p class="ns-lesson">SML は<b>意味</b>の表現であって日本語そのものではありません。このエージェントは意味を保ったまま日本語文法へ<b>コンパイル</b>する最終変換層（Grammar Compiler Layer）として動きます。<b>意味の追加・削除・推測はしません。</b></p>' +
    '<pre class="ns-code">SML → 意味抽出 → 文法ルール → 助詞補完 → 活用 → 語順最適化 → 自然さ評価 → 文</pre>' +
    '<p class="ns-empty__hint">助詞: 場所=で / 方向=へ・に / 対象=を / 所有=の / 共同=と / 手段=で / 比較=より　｜　語順: 主語 → 時間 → 場所 → 目的語 → 述語</p>';

  NSCode.registerView({
    route: '#/grammar', module: 'grammar', title: 'Grammar-agent',
    render: function () {
      return C.PageHeader({ title: '📝 Grammar-agent', purpose: 'SML（意味スロット）を、意味を変えずに自然で正しい日本語へ変換する日本語文法修正エージェント（端末内・API不要）' }) +
        C.Panel({ title: 'このエージェントについて', body: ABOUT }) +
        C.Panel({ title: '入力（SML）', hint: '"key: value" 行、またはラベル列。slot 例: subject / time / place / object / action / adjective / tense(past|present) / politeness(plain|polite) / negative',
          body:
            '<textarea id="gmIn" class="ns-input" rows="8" spellcheck="false">' + C.esc(EX1) + '</textarea>' +
            '<div class="ns-actions">' +
              '<button id="gmRun" class="ns-btn">日本語へ変換</button>' +
              '<button id="gmAsk" class="ns-btn ns-btn--ghost">🔗 直近Askの回答を変換</button>' +
              '<button id="gmEx1" class="ns-btn ns-btn--ghost">例: 動詞</button>' +
              '<button id="gmEx2" class="ns-btn ns-btn--ghost">例: 形容詞</button>' +
              '<button id="gmEx3" class="ns-btn ns-btn--ghost">例: ラベル列</button>' +
            '</div>' }) +
        C.Panel({ title: '出力', body: '<div id="gmOut"></div>' });
    },
    onMount: function () {
      el('gmRun').addEventListener('click', run);
      el('gmEx1').addEventListener('click', function () { el('gmIn').value = EX1; run(); });
      el('gmEx2').addEventListener('click', function () { el('gmIn').value = EX2; run(); });
      el('gmEx3').addEventListener('click', function () { el('gmIn').value = EX3; run(); });
      // 🔗 連動: 直近 Ask の回答の SML（意味スロット）を入力に流し込んで実際に変換
      el('gmAsk').addEventListener('click', function () {
        var r = NSCode.lastRun && NSCode.lastRun.get();
        var s = r && r.sml && r.sml.length ? r.sml[0].sml : null;
        if (!s) { el('gmOut').innerHTML = '<p class="ns-empty__hint">直近の Ask 回答がありません。<a href="#/ask">Ask</a> か <a href="#/howto">How To</a> で質問してください。</p>'; return; }
        var lines = Object.keys(s).filter(function (k) { return s[k]; }).map(function (k) { return k + ': ' + s[k]; }).join('\n');
        el('gmIn').value = lines || (r.normalized || r.generated || ''); run();
      });
      run();
    }
  });

  function run() {
    var out = el('gmOut'); if (!out) return;
    var src = el('gmIn').value.trim();
    if (!src) { out.innerHTML = C.EmptyState({ icon: '📝', message: 'SML を入力してください。' }); return; }
    var r = G.compile(src);
    if (!r.sentence) { out.innerHTML = '<p class="ns-empty__hint">変換できる述語/語が見つかりませんでした。</p>'; return; }
    var changes = r.changes.length
      ? '<ul class="ns-mem-facts">' + r.changes.map(function (c) { return '<li>' + C.esc(c) + '</li>'; }).join('') + '</ul>'
      : '<p class="ns-empty__hint">変更なし</p>';
    out.innerHTML =
      '<div class="ns-qa-answer"><div class="ns-qa-answer__label">sentence</div>' +
        '<p class="ns-qa-answer__lead">' + C.esc(r.sentence) + '</p></div>' +
      C.Table(['項目', '値'], [
        ['grammar', C.esc(r.grammar)],
        ['naturalness', r.naturalness.toFixed(2)],
        ['confidence', r.confidence.toFixed(2)]
      ]) +
      '<div class="ns-panel__sub" style="margin-top:10px"><b>changes</b>' + changes + '</div>' +
      '<p class="ns-empty__hint">※ 意味は保持し、助詞・活用・語順・敬語・時制・句読点のみを正規化しています（追加・削除なし）。</p>';
  }
})(window.NSCode);

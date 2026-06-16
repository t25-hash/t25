/* PDF テキスト抽出 — drop a PDF, extract its text in-browser (pdf.js,
 * page-by-page), clean it (NFKC / page-number removal), then copy, download,
 * or send to Ask for learning. This is the app-side preprocessing step. */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, R = NSCode.research, A = NSCode.askEngine;
  function el(id) { return document.getElementById(id); }

  NSCode.registerView({
    route: '#/pdf', module: 'pdf', title: 'PDF抽出',
    render: function () {
      return C.PageHeader({ title: '📄 PDF テキスト抽出', purpose: 'PDF から本文テキストを端末内で抽出・クレンジングして、コピー / 保存 / Ask の学習に渡す' }) +
        C.Panel({ title: '1. PDF を選ぶ', hint: '端末内処理・外部送信なし。スキャン画像のみの PDF は文字が無いため抽出できません（OCR が必要）',
          body:
            '<div class="ns-actions">' +
              '<label class="ns-btn" style="cursor:pointer">PDF を選ぶ<input id="pf" type="file" accept=".pdf,application/pdf" hidden></label>' +
              '<button id="pclear" class="ns-btn ns-btn--ghost">クリア</button>' +
            '</div>' +
            '<div id="pprog" class="ns-empty__hint"></div>' }) +
        C.Panel({ title: '2. 抽出テキスト', hint: '全角半角統一・ページ番号除去を自動適用。手で編集してから渡せます',
          body:
            '<div id="pmeta" class="ns-empty__hint"></div>' +
            '<textarea id="ptext" class="ns-input" rows="14" placeholder="ここに抽出結果が表示されます…"></textarea>' +
            '<div class="ns-actions">' +
              '<button id="pcopy" class="ns-btn ns-btn--ghost">コピー</button>' +
              '<button id="pdl" class="ns-btn ns-btn--ghost">.txt 保存</button>' +
              '<button id="plearn" class="ns-btn">Ask に学習させる</button>' +
              '<span id="pmsg" class="ns-empty__hint"></span>' +
            '</div>' });
    },
    onMount: function () {
      el('pf').addEventListener('change', function () { if (this.files && this.files[0]) extract(this.files[0]); this.value = ''; });
      el('pclear').addEventListener('click', function () { el('ptext').value = ''; el('pmeta').textContent = ''; el('pprog').textContent = ''; setMsg(''); });
      el('pcopy').addEventListener('click', function () { var t = el('ptext').value; if (t && navigator.clipboard) navigator.clipboard.writeText(t); setMsg('コピーしました ✓'); });
      el('pdl').addEventListener('click', download);
      el('plearn').addEventListener('click', learn);
    }
  });

  function setMsg(m) { var s = el('pmsg'); if (s) s.textContent = m || ''; }

  function extract(file) {
    var prog = el('pprog'); prog.textContent = '読み込み中…（大きい PDF は時間がかかります）';
    R.parse(file, function (n, total) { prog.textContent = '解析中… ' + n + ' / ' + total + ' ページ'; })
      .then(function (res) {
        var clean = A.cleanText(res.fullText || '');
        el('ptext').value = clean;
        el('pmeta').textContent = (res.numPages || 0) + ' ページ ／ ' + clean.length.toLocaleString() + ' 字' +
          (clean.length < 50 ? '（テキストがほとんど取れません：スキャン画像 PDF の可能性。OCR が必要です）' : '');
        prog.textContent = '抽出完了。';
      })
      .catch(function (e) { prog.textContent = '抽出エラー: ' + (e && e.message ? e.message : e) + '（ファイルが大きすぎる/メモリ不足の可能性）'; });
  }

  function download() {
    var t = el('ptext').value; if (!t) { setMsg('テキストがありません。'); return; }
    var blob = new Blob([t], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'extracted.txt'; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    setMsg('保存しました ✓');
  }

  function learn() {
    var t = A.cleanText(el('ptext').value); if (!t) { setMsg('テキストがありません。'); return; }
    var docs = A.getDocs(); docs.push({ name: 'pdf' + (docs.length + 1), text: t }); A.setDocs(docs);
    if (NSCode.neuralLab) NSCode.neuralLab.ensure();
    setMsg('Ask に学習させました（' + t.length.toLocaleString() + ' 字）。Ask ページで質問できます。');
  }
})(window.NSCode);

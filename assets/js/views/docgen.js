/* Doc 生成 — prompt -> Excel(.xlsx) / Word(.doc) / Markdown(.md) / CSV.
 * Deterministic interpreter (table / headings / bullets); real downloadable files. */
(function (NSCode) {
  'use strict';
  var C = NSCode.C, D = NSCode.docgen;

  var EXAMPLES = [
    '売上表をexcelで作って。列は 商品, 単価, 数量, 金額。5行。',
    'プロジェクト計画表。列は タスク, 担当, 期限, 状態。4行。',
    '# 議事録\n- 開始 10:00\n- 議題: RAG導入\n- 決定: 来週までに試作'
  ];
  var DEFAULT_PROMPT = EXAMPLES[0];

  var state = Object.assign({ prompt: DEFAULT_PROMPT }, NSCode.api.labState('#/generate') || {});
  function persist() { NSCode.api.labState('#/generate', state); }
  function el(id) { return document.getElementById(id); }

  NSCode.registerView({
    route: '#/generate', module: 'generate', title: 'Doc 生成',
    render: function () {
      return C.PageHeader({ title: '📝 Doc 生成', purpose: 'プロンプトから Excel / Word / Markdown を生成してダウンロード' }) +
        C.Panel({ title: 'プロンプト', hint: '解釈は決定論的（表＝「列: a,b,c」「N行」/ 見出し＝# / 箇条書き＝- ）',
          body:
            '<textarea id="dgPrompt" class="ns-input" rows="5">' + C.esc(state.prompt) + '</textarea>' +
            '<div class="ns-actions" id="dgEx"></div>' +
            '<div class="ns-actions"><button id="dgGen" class="ns-btn">生成 / プレビュー</button></div>' }) +
        C.Panel({ title: '解釈結果（プレビュー）', body: '<div id="dgPrev"></div>' }) +
        C.Panel({ title: 'ダウンロード', hint: 'Excel=実 .xlsx / Word=.doc(HTML) / Markdown=.md / CSV',
          body: '<div class="ns-actions">' +
            '<button id="dgXlsx" class="ns-btn">Excel (.xlsx)</button>' +
            '<button id="dgDoc" class="ns-btn">Word (.doc)</button>' +
            '<button id="dgMd" class="ns-btn ns-btn--ghost">Markdown (.md)</button>' +
            '<button id="dgCsv" class="ns-btn ns-btn--ghost">CSV (.csv)</button>' +
            '<span id="dgMsg" class="ns-empty__hint"></span></div>' });
    },
    onMount: function () {
      el('dgEx').innerHTML = EXAMPLES.map(function (e, i) {
        return '<button class="ns-btn ns-btn--ghost dg-ex" data-i="' + i + '">例' + (i + 1) + '</button>';
      }).join('');
      Array.prototype.forEach.call(document.querySelectorAll('.dg-ex'), function (b) {
        b.addEventListener('click', function () { state.prompt = EXAMPLES[+b.getAttribute('data-i')]; el('dgPrompt').value = state.prompt; persist(); preview(); });
      });
      el('dgPrompt').addEventListener('input', function () { state.prompt = el('dgPrompt').value; persist(); });
      el('dgGen').addEventListener('click', preview);
      el('dgMd').addEventListener('click', function () { var d = cur(); D.downloadText(D.markdown(d), D.safeName(d.title) + '.md', 'text/markdown;charset=utf-8'); msg('Markdown を保存しました'); });
      el('dgCsv').addEventListener('click', function () { var d = cur(); D.downloadText('﻿' + D.csv(d), D.safeName(d.title) + '.csv', 'text/csv;charset=utf-8'); msg('CSV を保存しました'); });
      el('dgDoc').addEventListener('click', function () { var d = cur(); D.downloadText(D.htmlDoc(d), D.safeName(d.title) + '.doc', 'application/msword'); msg('Word(.doc) を保存しました'); });
      el('dgXlsx').addEventListener('click', function () {
        var d = cur(); msg('Excel を生成中…');
        D.xlsxBlob(d).then(function (blob) { D.downloadBlob(blob, D.safeName(d.title) + '.xlsx'); msg('Excel(.xlsx) を保存しました'); })
          .catch(function (e) { msg('エラー: ' + e.message); });
      });
      preview();
    }
  });

  function cur() { return D.interpret(state.prompt); }
  function msg(t) { var m = el('dgMsg'); if (m) m.textContent = t || ''; }

  function preview() {
    var out = el('dgPrev'); if (!out) return;
    var d = cur();
    var html = '<div class="ns-grid" style="--cols:2">' +
      C.Metric({ label: '判定フォーマット', value: d.format }) +
      C.Metric({ label: 'タイトル', value: d.title }) + '</div>';
    if (d.table) {
      html += '<p class="ns-empty__hint">表: ' + d.table.headers.length + ' 列 × ' + d.table.rows.length + ' 行' + (d.table.sample ? '（サンプル値）' : '') + '</p>' +
        C.Table(d.table.headers, d.table.rows.map(function (r) { var o = r.slice(0, d.table.headers.length); while (o.length < d.table.headers.length) o.push(''); return o; }));
    }
    if (d.blocks.length) {
      html += '<p class="ns-empty__hint">本文ブロック: ' + d.blocks.length + '</p><div class="dg-blocks">' +
        d.blocks.map(function (b) {
          if (b.type === 'heading') return '<div class="dg-h">' + new Array(b.level + 1).join('#') + ' ' + C.esc(b.text) + '</div>';
          if (b.type === 'bullet') return '<div class="dg-b">• ' + C.esc(b.text) + '</div>';
          return '<div class="dg-p">' + C.esc(b.text) + '</div>';
        }).join('') + '</div>';
    }
    out.innerHTML = html;
  }
})(window.NSCode);

/* NSCode docgen engine — prompt -> Excel(.xlsx) / Word(.doc) / Markdown(.md).
 * The interpreter is DETERMINISTIC (no LLM): it extracts a table (markdown table,
 * CSV-like lines, or "列: a,b,c / N行"), headings (#), and bullets (-/・/*).
 * Output files are REAL: .xlsx via vendored SheetJS (lazy-loaded), .md as text,
 * .doc as Word-compatible HTML. Richer NL parsing would use the backend (docs/05). */
(function (NSCode) {
  'use strict';

  var XLSX_SRC = 'assets/vendor/xlsx/xlsx.full.min.js';
  var xlsxPromise = null;
  function ensureXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxPromise) return xlsxPromise;
    xlsxPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = XLSX_SRC;
      s.onload = function () { resolve(window.XLSX); };
      s.onerror = function () { xlsxPromise = null; reject(new Error('SheetJS の読み込みに失敗しました')); };
      document.head.appendChild(s);
    });
    return xlsxPromise;
  }

  function splitList(s) {
    return s.split(/[,、，・\t]|\s{2,}/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function detectFormat(text) {
    var t = text.toLowerCase();
    if (/excel|エクセル|xlsx|スプレッドシート|表計算|csv/.test(t)) return 'excel';
    if (/word|ワード|docx|\.doc|文書|レポート|議事録/.test(t)) return 'word';
    if (/markdown|マークダウン|\bmd\b/.test(t)) return 'md';
    if (/表|テーブル|table/.test(t)) return 'excel';
    return 'md';
  }

  /* prompt -> structured doc */
  function interpret(prompt) {
    var lines = String(prompt).replace(/\r/g, '').split('\n');
    var nonEmpty = lines.map(function (l) { return l.trim(); }).filter(Boolean);
    var title = '';
    // title: leading "# ..." or 「...」 or "...を作って/作成"
    for (var i = 0; i < nonEmpty.length; i++) {
      var m;
      if ((m = nonEmpty[i].match(/^#\s*(.+)$/))) { title = m[1]; break; }
      if ((m = nonEmpty[i].match(/[「『](.+?)[」』]/))) { title = m[1]; break; }
      if ((m = nonEmpty[i].match(/^(.{1,40}?)\s*(?:を|の)?\s*(?:作って|作成|生成|ください)/))) { title = m[1]; break; }
    }
    if (!title) title = (nonEmpty[0] || 'Untitled').slice(0, 40);
    // strip trailing format words (e.g. "売上表をexcelで" -> "売上表")
    title = title.replace(/\s*(?:を|の|で)?\s*(excel|エクセル|word|ワード|markdown|マークダウン|md|csv|スプレッドシート|表計算)(?:形式|ファイル|で|に)?\s*$/i, '').trim() || title;

    var table = parseMarkdownTable(lines) || parseCsv(lines) || parseColumnsSpec(prompt);

    // blocks (headings / bullets / paragraphs) excluding table-ish lines
    var blocks = [];
    lines.forEach(function (raw) {
      var l = raw.trim();
      if (!l) return;
      if (/^\|.*\|$/.test(l)) return; // skip md table rows
      var hm = l.match(/^(#{1,4})\s*(.+)$/);
      if (hm) { blocks.push({ type: 'heading', level: hm[1].length, text: hm[2] }); return; }
      var bm = l.match(/^[-*・]\s*(.+)$/);
      if (bm) { blocks.push({ type: 'bullet', text: bm[1] }); return; }
      blocks.push({ type: 'p', text: l });
    });

    return { format: detectFormat(prompt), title: title, table: table, blocks: blocks, raw: prompt };
  }

  function parseMarkdownTable(lines) {
    var rows = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (/^\|.*\|$/.test(l)) rows.push(l);
    }
    if (rows.length < 2) return null;
    var cells = rows.map(function (r) {
      return r.replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
    });
    // drop separator row (---)
    var body = cells.filter(function (c) { return !c.every(function (x) { return /^:?-{2,}:?$/.test(x) || x === ''; }); });
    if (body.length < 1) return null;
    return { headers: body[0], rows: body.slice(1) };
  }

  function parseCsv(lines) {
    var data = lines.map(function (l) { return l.trim(); }).filter(Boolean)
      .filter(function (l) { return l.indexOf(',') >= 0 || l.indexOf('\t') >= 0; });
    if (data.length < 2) return null;
    var rows = data.map(function (l) { return l.split(/[,\t]/).map(function (c) { return c.trim(); }); });
    return { headers: rows[0], rows: rows.slice(1) };
  }

  function parseColumnsSpec(prompt) {
    var m = prompt.match(/(?:列|カラム|columns?|項目)\s*[:：はが]?\s*([^\n。.]+)/i);
    if (!m) return null;
    var headers = splitList(m[1]);
    if (headers.length < 1) return null;
    var rm = prompt.match(/(\d+)\s*(?:行|rows?|件)/i);
    var n = rm ? Math.max(1, Math.min(100, parseInt(rm[1], 10))) : 3;
    var rows = [];
    for (var r = 0; r < n; r++) {
      rows.push(headers.map(function (h, ci) { return h + '-' + (r + 1) + (ci === 0 ? '' : ''); }));
    }
    return { headers: headers, rows: rows, sample: true };
  }

  /* ---------- generators ---------- */
  function markdown(doc) {
    var out = ['# ' + doc.title, ''];
    if (doc.table) {
      out.push('| ' + doc.table.headers.join(' | ') + ' |');
      out.push('| ' + doc.table.headers.map(function () { return '---'; }).join(' | ') + ' |');
      doc.table.rows.forEach(function (r) { out.push('| ' + padRow(r, doc.table.headers.length).join(' | ') + ' |'); });
      out.push('');
    }
    doc.blocks.forEach(function (b) {
      if (b.type === 'heading') out.push('\n' + new Array(b.level + 1).join('#') + ' ' + b.text);
      else if (b.type === 'bullet') out.push('- ' + b.text);
      else out.push(b.text);
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Word-compatible HTML document (.doc)
  function htmlDoc(doc) {
    var body = '<h1>' + esc(doc.title) + '</h1>';
    if (doc.table) {
      body += '<table border="1" cellspacing="0" cellpadding="4"><thead><tr>' +
        doc.table.headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        doc.table.rows.map(function (r) {
          return '<tr>' + padRow(r, doc.table.headers.length).map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table>';
    }
    var bullets = [];
    function flush() { if (bullets.length) { body += '<ul>' + bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>'; bullets = []; } }
    doc.blocks.forEach(function (b) {
      if (b.type === 'bullet') { bullets.push(b.text); return; }
      flush();
      if (b.type === 'heading') body += '<h' + Math.min(b.level + 1, 6) + '>' + esc(b.text) + '</h' + Math.min(b.level + 1, 6) + '>';
      else body += '<p>' + esc(b.text) + '</p>';
    });
    flush();
    return '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">' +
      '<head><meta charset="utf-8"><title>' + esc(doc.title) + '</title></head><body>' + body + '</body></html>';
  }

  function csv(doc) {
    if (!doc.table) return doc.blocks.map(function (b) { return '"' + String(b.text).replace(/"/g, '""') + '"'; }).join('\n');
    var lines = [doc.table.headers].concat(doc.table.rows.map(function (r) { return padRow(r, doc.table.headers.length); }));
    return lines.map(function (row) { return row.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
  }

  function padRow(r, n) { var out = r.slice(0, n); while (out.length < n) out.push(''); return out; }

  // Build an aoa (array of arrays) for the spreadsheet
  function toAoa(doc) {
    if (doc.table) return [doc.table.headers].concat(doc.table.rows.map(function (r) { return padRow(r, doc.table.headers.length); }));
    var aoa = [[doc.title]];
    doc.blocks.forEach(function (b) { aoa.push([(b.type === 'bullet' ? '• ' : '') + b.text]); });
    return aoa;
  }

  function xlsxBlob(doc) {
    return ensureXlsx().then(function (XLSX) {
      var ws = XLSX.utils.aoa_to_sheet(toAoa(doc));
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      var arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      return new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    });
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }
  function downloadText(text, name, mime) { downloadBlob(new Blob([text], { type: mime || 'text/plain;charset=utf-8' }), name); }
  function safeName(s) { return (String(s || 'document').replace(/[^\w\-一-鿿぀-ヿ]+/g, '_').slice(0, 40) || 'document'); }

  NSCode.docgen = {
    interpret: interpret, detectFormat: detectFormat,
    markdown: markdown, htmlDoc: htmlDoc, csv: csv, toAoa: toAoa,
    ensureXlsx: ensureXlsx, xlsxBlob: xlsxBlob,
    downloadBlob: downloadBlob, downloadText: downloadText, safeName: safeName, esc: esc
  };
})(window.NSCode);

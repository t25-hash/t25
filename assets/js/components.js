/* NSCode shared UI components (see docs/03). Each returns an HTML string. */
(function (NSCode) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var C = {
    esc: esc,

    PageHeader: function (o) {
      o = o || {};
      var crumb = o.breadcrumb ? '<nav class="ns-crumb">' + o.breadcrumb.map(esc).join(' / ') + '</nav>' : '';
      return '<header class="ns-page-header">' + crumb +
        '<h1 class="ns-page-title">' + esc(o.title) + '</h1>' +
        (o.purpose ? '<p class="ns-page-purpose">' + esc(o.purpose) + '</p>' : '') +
        '</header>';
    },

    Tabs: function (items, activeRoute) {
      if (!items || !items.length) return '';
      return '<nav class="ns-tabs">' + items.map(function (it) {
        var active = it.route === activeRoute ? ' is-active' : '';
        return '<a class="ns-tab' + active + '" href="' + esc(it.route) + '">' + esc(it.label) + '</a>';
      }).join('') + '</nav>';
    },

    Panel: function (o) {
      o = o || {};
      return '<section class="ns-panel">' +
        '<div class="ns-panel__head"><h3 class="ns-panel__title">' + esc(o.title) + '</h3>' +
        (o.hint ? '<span class="ns-panel__hint">' + esc(o.hint) + '</span>' : '') + '</div>' +
        '<div class="ns-panel__body">' + (o.body || '') + '</div>' +
        '</section>';
    },

    Card: function (o) {
      o = o || {};
      var href = o.href ? ' href="' + esc(o.href) + '"' : '';
      var tag = o.href ? 'a' : 'div';
      return '<' + tag + ' class="ns-card"' + href + '>' +
        (o.badge ? '<span class="ns-badge">' + esc(o.badge) + '</span>' : '') +
        '<h3 class="ns-card__title">' + esc(o.title) + '</h3>' +
        (o.body ? '<div class="ns-card__body">' + o.body + '</div>' : '') +
        '</' + tag + '>';
    },

    Grid: function (cardsHtml, cols) {
      return '<div class="ns-grid" style="--cols:' + (cols || 3) + '">' + cardsHtml + '</div>';
    },

    ProgressBar: function (o) {
      o = o || {};
      var pct = Math.max(0, Math.min(100, o.percent || 0));
      return '<div class="ns-metric">' +
        '<div class="ns-metric__row"><span>' + esc(o.label) + '</span><span>' + pct + '%</span></div>' +
        '<div class="ns-progress"><div class="ns-progress__fill" style="width:' + pct + '%"></div></div>' +
        '</div>';
    },

    Metric: function (o) {
      o = o || {};
      return '<div class="ns-stat"><div class="ns-stat__value">' + esc(o.value) +
        (o.unit ? '<span class="ns-stat__unit">' + esc(o.unit) + '</span>' : '') + '</div>' +
        '<div class="ns-stat__label">' + esc(o.label) + '</div></div>';
    },

    EmptyState: function (o) {
      o = o || {};
      return '<div class="ns-empty"><div class="ns-empty__icon">' + (o.icon || '🧪') + '</div>' +
        '<p class="ns-empty__msg">' + esc(o.message || 'この機能は雛形です。設計に沿って実装予定。') + '</p>' +
        (o.hint ? '<p class="ns-empty__hint">' + esc(o.hint) + '</p>' : '') + '</div>';
    },

    Controls: function (rows) {
      // rows: [{label, control}]  control is raw HTML (select/slider placeholder)
      return '<div class="ns-controls">' + (rows || []).map(function (r) {
        return '<label class="ns-control"><span>' + esc(r.label) + '</span>' + (r.control || '') + '</label>';
      }).join('') + '</div>';
    },

    CodeBlock: function (o) {
      o = o || {};
      return '<pre class="ns-code" data-lang="' + esc(o.lang || '') + '"><code>' + esc(o.code || '') + '</code></pre>';
    },

    Table: function (headers, rows) {
      var head = '<tr>' + headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>';
      var body = rows.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
      }).join('');
      return '<div class="ns-table-wrap"><table class="ns-table"><thead>' + head +
        '</thead><tbody>' + body + '</tbody></table></div>';
    }
  };

  NSCode.C = C;
})(window.NSCode);

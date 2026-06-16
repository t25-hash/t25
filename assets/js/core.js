/* NSCode core: namespace, view registry, hash router, store.
 * No build step, no ES modules — works from file:// directly. */
(function (window) {
  'use strict';

  var views = {};        // route -> view definition
  var paramRoutes = [];  // routes containing :params

  var NSCode = {
    version: '1.0.0',
    views: views,

    /* ---- View registry (Module/Plugin contract, see docs/03) ---- */
    registerView: function (def) {
      if (!def || !def.route) throw new Error('registerView: route required');
      views[def.route] = def;
      if (def.route.indexOf('/:') !== -1 || def.route.indexOf(':') !== -1) {
        paramRoutes.push(def);
      }
      return def;
    },

    use: function (plugin) {
      if (!plugin) return;
      (plugin.nav || []).forEach(function (item) { NSCode.nav.push(item); });
      (plugin.views || []).forEach(function (v) { NSCode.registerView(v); });
    },

    /* ---- Routing ---- */
    nav: [], // populated by nav.js

    navigate: function (route) {
      if (window.location.hash !== route) window.location.hash = route;
      else NSCode.renderCurrent();
    },

    resolve: function (hash) {
      var route = hash || '#/ask';
      var qIndex = route.indexOf('?');
      var query = {};
      if (qIndex !== -1) {
        route.slice(qIndex + 1).split('&').forEach(function (pair) {
          if (!pair) return;
          var kv = pair.split('=');
          query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
        });
        route = route.slice(0, qIndex);
      }
      // exact match
      if (views[route]) return { view: views[route], params: {}, query: query };
      // param match (#/a/:id)
      for (var i = 0; i < paramRoutes.length; i++) {
        var def = paramRoutes[i];
        var params = matchParams(def.route, route);
        if (params) return { view: def, params: params, query: query };
      }
      return { view: views['#/404'], params: {}, query: query, notFound: true, attempted: route };
    },

    renderCurrent: function () {
      var mount = document.getElementById('view');
      if (!mount) return;
      var match = NSCode.resolve(window.location.hash);
      var view = match.view;
      var ctx = { params: match.params, query: match.query, mount: mount, attempted: match.attempted };
      var html = view && view.render ? view.render(ctx) : '<p>View not found.</p>';
      mount.innerHTML = typeof html === 'string' ? html : '';
      if (typeof html !== 'string' && html instanceof Node) mount.appendChild(html);
      // inject the page explanation (under the title) — data lives in NSCode.pageNotes
      var note = view && view.module && NSCode.pageNotes ? NSCode.pageNotes[view.module] : null;
      var hdr = note ? mount.querySelector('.ns-page-header') : null;
      if (hdr) { var ab = document.createElement('div'); ab.className = 'ns-about'; ab.innerHTML = note; hdr.appendChild(ab); }
      if (view && view.onMount) view.onMount(ctx);
      mount.scrollTop = 0;
      window.dispatchEvent(new CustomEvent('nscode:navigated', { detail: match }));
      document.title = (view && view.title ? view.title + ' · ' : '') + 'Ask the baby';
    },

    /* ---- Store: localStorage-backed key/value (see docs/04 mapping) ---- */
    store: {
      get: function (key, fallback) {
        try {
          var raw = window.localStorage.getItem('nscode.' + key);
          return raw == null ? fallback : JSON.parse(raw);
        } catch (e) { return fallback; }
      },
      set: function (key, value) {
        try { window.localStorage.setItem('nscode.' + key, JSON.stringify(value)); }
        catch (e) { /* ignore quota/private-mode errors */ }
      }
    }
  };

  function matchParams(pattern, actual) {
    var pp = pattern.split('/');
    var ap = actual.split('/');
    if (pp.length !== ap.length) return null;
    var params = {};
    for (var i = 0; i < pp.length; i++) {
      if (pp[i].charAt(0) === ':') params[pp[i].slice(1)] = decodeURIComponent(ap[i]);
      else if (pp[i] !== ap[i]) return null;
    }
    return params;
  }

  window.NSCode = NSCode;
})(window);

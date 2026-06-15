/* NSCode bootstrap: build shell, wire events, start router. Loaded last. */
(function (NSCode) {
  'use strict';

  function buildSidebar() {
    var groups = [];
    var byGroup = {};
    NSCode.nav.forEach(function (item) {
      if (!byGroup[item.group]) { byGroup[item.group] = []; groups.push(item.group); }
      byGroup[item.group].push(item);
    });
    return groups.map(function (g) {
      var links = byGroup[g].map(function (item) {
        return '<a class="ns-navlink" href="' + item.route + '" data-route="' + item.route + '">' +
          item.label + '</a>';
      }).join('');
      return '<div class="ns-navgroup"><div class="ns-navgroup__title">' + g + '</div>' + links + '</div>';
    }).join('');
  }

  function highlightNav() {
    var hash = window.location.hash || '#/dashboard';
    var links = document.querySelectorAll('.ns-navlink');
    links.forEach(function (a) {
      var route = a.getAttribute('data-route');
      // match by module prefix so sub-routes keep their nav item active
      var base = route.split('?')[0];
      var moduleSeg = base.split('/')[1];
      var active = hash.indexOf('#/' + moduleSeg) === 0;
      a.classList.toggle('is-active', active);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    NSCode.store.set('theme', theme);
    var btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀' : '☾';
  }

  function closeDrawer() { document.body.classList.remove('nav-open'); }

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('sidebar-nav').innerHTML = buildSidebar();

    applyTheme(NSCode.store.get('theme', 'dark'));

    document.getElementById('themeToggle').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });

    document.getElementById('menuToggle').addEventListener('click', function () {
      document.body.classList.toggle('nav-open');
    });
    document.getElementById('scrim').addEventListener('click', closeDrawer);

    // close mobile drawer after navigation
    window.addEventListener('hashchange', function () { NSCode.renderCurrent(); highlightNav(); closeDrawer(); });
    window.addEventListener('nscode:navigated', highlightNav);

    NSCode.renderCurrent();
    highlightNav();
  });
})(window.NSCode);

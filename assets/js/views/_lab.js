/* Helper: register a tabbed Lab module from a compact definition.
 * Each sub-view renders PageHeader + Tabs + its panels (placeholders). */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;

  // def: { module, title, purpose, tabs:[{id,label,route}], screens:{ route: {title, purpose, panels:[{title,hint,body}]} } }
  NSCode.registerLab = function (def) {
    Object.keys(def.screens).forEach(function (route) {
      var s = def.screens[route];
      NSCode.registerView({
        route: route, module: def.module, title: s.title || def.title,
        render: function () {
          var panels = (s.panels || []).map(function (p) {
            return C.Panel({ title: p.title, hint: p.hint,
              body: p.body || C.EmptyState({ message: p.empty || (p.title + ' の表示領域（雛形）。') }) });
          }).join('');
          return C.PageHeader({
              title: s.title || def.title,
              purpose: s.purpose || def.purpose,
              breadcrumb: [def.title, s.title].filter(Boolean)
            }) +
            C.Tabs(def.tabs, route) +
            panels;
        }
      });
    });
  };
})(window.NSCode);

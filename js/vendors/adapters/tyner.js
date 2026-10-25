/* Common Roots vendor adapter: Tyner Pond Farm. One cart link per order group (the Tyner lines that arrive on the same delivery day). */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var Reg = (NODE ? require('../registry.js') : root.CRVendorRegistry).registry;
  var Farm = NODE ? require('../farm.js') : root.CRFarmCore;
  /** ctx = { route: result of CRFarm.route (curRoute), farm: window.CR_FARM }. Same selection rule the cart had inline before the adapters existed. */
  function groupUrl(g, ctx) {
    if (!ctx.route || !ctx.route.tyner) return null;
    var its = g.lines.map(function (l) { return l.item; });
    var ls = ctx.route.tyner.lines.filter(function (l) { return its.indexOf(l.ingredient) >= 0 || (l.ingredients || []).some(function (i) { return its.indexOf(i) >= 0; }); });
    return Farm.tynerUrlFor(ls.length ? ls : ctx.route.tyner.lines, ctx.farm);
  }
  var adapter = { id: 'tyner', label: 'Tyner Pond Farm', kind: 'cart-link', flag: null, groupUrl: groupUrl };
  Reg.register(adapter);
  if (NODE) module.exports = adapter; else root.CRVendorTyner = adapter;
})(typeof window !== 'undefined' ? window : globalThis);

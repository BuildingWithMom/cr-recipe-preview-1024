/* Common Roots: Walmart "add to cart" link builder. Pure logic (works in Node and the browser) + small UI wiring.
/* Facade over vendors/walmart.js (logic) and ui/walmart-ui.js (DOM wiring): same API as before the split. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var CRWalmartCore = NODE ? require('./vendors/walmart.js') : root.CRWalmartCore;
  var CRWalmartUI = NODE ? {} : root.CRWalmartUI;   // DOM wiring: browser only
  var api = Object.assign({}, CRWalmartCore, CRWalmartUI);
  if (NODE) module.exports = api; else root.CRWalmart = api;
})(typeof window !== 'undefined' ? window : globalThis);

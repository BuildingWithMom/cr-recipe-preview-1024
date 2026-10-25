/* Common Roots vendor adapter: Walmart. The cart link is built for the whole list by vendors/walmart.js (buildCart), not per order group, so groupUrl is null. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var Reg = (NODE ? require('../registry.js') : root.CRVendorRegistry).registry;
  var adapter = { id: 'walmart', label: 'Walmart', kind: 'cart-link', flag: null, groupUrl: function () { return null; } };
  Reg.register(adapter);
  if (NODE) module.exports = adapter; else root.CRVendorWalmart = adapter;
})(typeof window !== 'undefined' ? window : globalThis);

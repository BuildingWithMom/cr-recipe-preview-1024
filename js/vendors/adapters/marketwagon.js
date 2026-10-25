/* Common Roots vendor adapter: Market Wagon. Vendor and product pages exist but there is NO add-to-cart link, so the cart shows a checklist and groupUrl is null. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var Reg = (NODE ? require('../registry.js') : root.CRVendorRegistry).registry;
  var adapter = { id: 'market', label: 'Market Wagon', kind: 'checklist', flag: null, groupUrl: function () { return null; } };
  Reg.register(adapter);
  if (NODE) module.exports = adapter; else root.CRVendorMarketWagon = adapter;
})(typeof window !== 'undefined' ? window : globalThis);

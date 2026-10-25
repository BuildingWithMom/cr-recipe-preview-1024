/* Common Roots vendor adapter: Kroger (PLACEHOLDER, off behind the "kroger" flag). No Kroger code, data or API call exists yet.
 * Before building it, read docs/ADDING_A_VENDOR.md ("Kroger terms"): no cached product database, no cross-retailer price comparison,
 * no "Kroger" in the app name, and nobody is contacted without the owner's approval. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var Reg = (NODE ? require('../registry.js') : root.CRVendorRegistry).registry;
  var adapter = { id: 'kroger', label: 'Kroger', kind: 'placeholder', flag: 'kroger', groupUrl: function () { return null; } };
  Reg.register(adapter);
  if (NODE) module.exports = adapter; else root.CRVendorKroger = adapter;
})(typeof window !== 'undefined' ? window : globalThis);

/* Common Roots: pure logic (scaling, fractions, merging). Facade over logic/scale.js, logic/swaps.js, logic/merge.js. Works in browser and Node. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var CRScale = NODE ? require('./logic/scale.js') : root.CRScale;
  var CRSwaps = NODE ? require('./logic/swaps.js') : root.CRSwaps;
  var CRMerge = NODE ? require('./logic/merge.js') : root.CRMerge;
  var api = Object.assign({}, CRScale, CRSwaps, CRMerge);
  if (NODE) module.exports = api; else root.CRLib = api;
})(typeof window !== 'undefined' ? window : globalThis);

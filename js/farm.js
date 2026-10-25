/* Common Roots: "Where to buy" routing. Pure logic (Node and browser) + card rendering for the plan page.
/* Facade over vendors/farm.js (routing) and ui/farm-ui.js (cards): same API as before the split. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var CRFarmCore = NODE ? require('./vendors/farm.js') : root.CRFarmCore;
  var CRFarmUI = NODE ? {} : root.CRFarmUI;   // cards need the DOM: browser only
  var api = Object.assign({}, CRFarmCore, CRFarmUI);
  if (NODE) module.exports = api; else root.CRFarm = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* Common Roots: browser bootstrap. Picks the page module for the current page and publishes the small window.CR API used by js/weekui.js.
 * No backend: everything is stored in localStorage on this device. Page code lives in pages/*.js, shared state in core/state.js. */
(function () {
  'use strict';
  var S = window.CRState, page = S.page;
  var track = S.track, store = S.store, swaps = S.swaps, factorOf = S.factorOf, setFactor = S.setFactor, getPlan = S.getPlan, setPlan = S.setPlan;
  var updateBadge = S.updateBadge, servingsLabel = S.servingsLabel, manualChanges = S.manualChanges, flowState = S.flowState;
  var initSignup = window.CRPageStats.initSignup;

  updateBadge(); initSignup();
  if (page === 'home') window.CRPageHome.initHome();
  else if (page === 'recipe') window.CRPageRecipe.initRecipe();
  else if (page === 'plan' || page === 'week') window.CRPagePlan.initPlan();
  else if (page === 'stats') window.CRPageStats.initStats();
  window.CR = Object.assign(window.CR || {}, { track: track, store: store,
    // used by js/weekui.js (My week, My Kitchen)
    swaps: swaps, factorOf: factorOf, setFactor: setFactor, getPlan: getPlan, setPlan: setPlan, updateBadge: updateBadge, servingsLabel: servingsLabel,
    manualChanges: manualChanges, flowState: flowState });
})();

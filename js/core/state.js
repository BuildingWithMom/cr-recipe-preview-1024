/* Common Roots: app state kept in this browser (plan, servings, swaps, Walmart tier, source, have-it list) and the derived shopping rows. Storage keys (cr.*) are a public contract, see docs/DATA_CONTRACT.md. */
(function () {
  'use strict';
  var store = window.CRStorage.store, track = window.CRTelemetry.track;
  var L = window.CRLib, RECIPES = window.CR_RECIPES;
  var byId = {}; RECIPES.forEach(function (r) { byId[r.id] = r; });

  /* manual swaps the shopper defined (saved on this device): register them before anything reads the swap table */
  try { L.setCustomSwaps(JSON.parse(window.localStorage.getItem('cr.customSwaps') || '{}')); } catch (e) {}
  /* ---------- state ---------- */
  function getPlan() { return store.get('cr.plan', []); }
  function setPlan(p) { store.set('cr.plan', p); updateBadge(); }
  function getFactors() { return store.get('cr.factors', {}); }
  function factorOf(id) { return getFactors()[id] || 1; }
  function setFactor(id, f) { var m = getFactors(); m[id] = f; store.set('cr.factors', m); }
  /* substitutions: choices are per item and apply to every recipe, the plan and the shopping list */
  var DEFAULT_AUTO_SWAP = false;   // default state of "Never use vegetable oil: swap automatically"
  function getSubs() { return store.get('cr.subs', {}); }
  function setSub(item, v) { var m = getSubs(); m[item] = v; store.set('cr.subs', m); }
  function getAuto() { return store.get('cr.autoswap', DEFAULT_AUTO_SWAP) === true; }
  function setAuto(on) {
    store.set('cr.autoswap', !!on);
    var m = getSubs(); Object.keys(L.SUBS).forEach(function (k) { if (L.SUBS[k].avoid) delete m[k]; }); store.set('cr.subs', m);
  }
  function swaps() { return L.effectiveSwaps(getSubs(), getAuto()); }
  /* Walmart tiers + where to buy (all stored on this device only) */
  function WM() { return window.CRWalmart; }
  function getTier() { var t = store.get('cr.tier', 'budget'); return WM().isTier(t) ? t : 'budget'; }
  function setTier(t) { store.set('cr.tier', t); }
  function getTierOver() { return store.get('cr.tierOver', {}); }
  function setTierOver(item, t) { var m = getTierOver(); if (t) m[item] = t; else delete m[item]; store.set('cr.tierOver', m); }
  function getSource() { return store.get('cr.source', 'walmart') === 'farm' ? 'farm' : 'walmart'; }
  function setSource(s) { store.set('cr.source', s === 'farm' ? 'farm' : 'walmart'); }
  function getHave() { return store.get('cr.have', {}); }
  function setHave(h) { store.set('cr.have', h); }
  function inPlan(id) { return getPlan().indexOf(id) >= 0; }
  function togglePlan(id) {
    var p = getPlan(), i = p.indexOf(id);
    if (i >= 0) p.splice(i, 1); else { p.push(id); track('add_to_plan', { id: id }); }
    setPlan(p);
  }
  function updateBadge() {
    var b = document.getElementById('plan-count');
    var n = getPlan().length; b.textContent = n; b.hidden = n === 0;
  }

  function servingsLabel(r, f) {
    if (r.servings) return 'Serves ' + L.fmtQty(r.servings * f).replace(/^0$/, '1');
    return 'Makes ' + r.yield + ' servings' + (f !== 1 ? ' \u00d7 ' + L.fmtQty(f) : '');
  }
  function selection() { return getPlan().map(function (id) { return { id: id, factor: factorOf(id) }; }); }
  /* flow state (order records, line statuses, pantry answers): only on pages that load js/flow.js */
  var _FS = null;
  function flowState() { if (_FS === null) _FS = window.CRFlow ? window.CRFlow.makeState(window.localStorage) : false; return _FS || null; }
  /** Manual swaps that are switched on right now: { 'ground turkey': { to, note, timeNote } }. The calendar card shows them. */
  function manualChanges() {
    var def = L.customSwapsDef(), sw = swaps(), out = {};
    Object.keys(def).forEach(function (item) { if (sw[item] === def[item].id) out[item] = { to: def[item].name, note: def[item].note || '', timeNote: def[item].timeNote || '' }; });
    return out;
  }
  /** Split the merged rows into: still to buy (need), ordered and waiting (ordered), and nothing to buy (got: have it / bought / bought elsewhere). */
  function visibleRows(sel) {
    var have = getHave(), rows = L.mergeSelection(RECIPES, sel, swaps()), FS = flowState();
    var pan = FS ? FS.pantry() : {}, done = FS ? FS.pantryDone() : false;
    var need = [], ordered = [], got = [];
    rows.forEach(function (r) {
      var st = FS ? FS.statusOf(r.item) : null, sv = FS ? FS.srcVendor(r.item) : null;
      if (st === 'bought') { r.gotWhy = 'bought'; got.push(r); return; }
      if (sv === 'elsewhere') { r.gotWhy = 'elsewhere'; r.elsewhere = FS.src()[r.item].where || ''; got.push(r); return; }
      if (sv === 'have' || have[r.item] || pan[r.item] === 'have' || (done && r.staple && pan[r.item] !== 'need')) { r.gotWhy = 'have'; got.push(r); return; }
      if (st === 'ordered') { r.orderInfo = FS.status()[r.item]; ordered.push(r); return; }
      r.tag = (st === 'oos' || st === 'missing') ? st : null; need.push(r);
    });
    return { need: need, ordered: ordered, got: got };
  }

  var page = window.CR_PAGE;

  window.CRState = { L: L, RECIPES: RECIPES, WM: WM, byId: byId, factorOf: factorOf, flowState: flowState, getAuto: getAuto, getFactors: getFactors, getHave: getHave, getPlan: getPlan, getSource: getSource, getTier: getTier, getTierOver: getTierOver, inPlan: inPlan, manualChanges: manualChanges, page: page, selection: selection, servingsLabel: servingsLabel, setAuto: setAuto, setFactor: setFactor, setHave: setHave, setPlan: setPlan, setSource: setSource, setSub: setSub, setTier: setTier, setTierOver: setTierOver, store: store, swaps: swaps, togglePlan: togglePlan, track: track, updateBadge: updateBadge, visibleRows: visibleRows };
})();

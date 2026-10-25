/* Common Roots: side-dish pairing suggestions (category rules only). Pure. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var CRWeekState = NODE ? require('./state.js') : root.CRWeekState;
  var allItems = CRWeekState.allItems;
  var CRFreshness = NODE ? require('./freshness.js') : root.CRFreshness;
  var SLOT_LABEL = CRFreshness.SLOT_LABEL, byIdOf = CRFreshness.byIdOf, hashStr = CRFreshness.hashStr, isCenter = CRFreshness.isCenter, slotOf = CRFreshness.slotOf;
  /* ---------- pairing (category rules only) ---------- */
  var MAIN_SUB_ORDER = ['Chicken', 'Beef', 'Pork', 'Fish'];
  /** Suggested pairing for a day. Rule: a main (or soup/breakfast dish) gets sides picked by recipe category only:
   *  vegetable side, rice/noodle/pasta side, salad (soups and breakfast get a salad and a vegetable side). A day with only sides/desserts gets up to 3 mains of different kinds.
   *  Nothing here claims flavors match. Returns {mode, suggestions:[{id, slot, label}], text}. */
  function suggestPairings(ctx, state, dayIdx) {
    var recipes = ctx.recipes, items = state.days[dayIdx].items, ids = items.map(function (x) { return x.id; });
    var inWeek = {}; allItems(state).forEach(function (it) { inWeek[it.id] = true; });
    var res = { mode: 'none', suggestions: [], text: '' };
    if (!items.length) return res;
    var recs = items.map(function (it) { return byIdOf(ctx)[it.id]; }).filter(Boolean);
    var center = recs.filter(isCenter);
    function pickFrom(cands, seed) {
      var fresh = cands.filter(function (r) { return !inWeek[r.id]; }), pool = fresh.length ? fresh : cands;
      return pool.length ? pool[hashStr(seed) % pool.length] : null;
    }
    if (center.length) {
      res.mode = 'sides';
      var lead = center[0], want = lead.category === 'Main dish' ? ['vegetable', 'starch', 'salad'] : ['salad', 'vegetable'];
      var have = {}; recs.forEach(function (r) { var s = slotOf(r); if (s) have[s] = true; });
      want.forEach(function (slot) {
        if (have[slot] || res.suggestions.length >= 3) return;
        var cands = recipes.filter(function (r) { return slotOf(r) === slot && ids.indexOf(r.id) < 0; });
        var r = pickFrom(cands, lead.id + '|' + slot); if (r) res.suggestions.push({ id: r.id, slot: slot, label: SLOT_LABEL[slot] });
      });
    } else {
      res.mode = 'mains';
      var start = hashStr(ids[0]), subs = MAIN_SUB_ORDER.slice(start % MAIN_SUB_ORDER.length).concat(MAIN_SUB_ORDER.slice(0, start % MAIN_SUB_ORDER.length));
      subs.forEach(function (sub) {
        if (res.suggestions.length >= 3) return;
        var cands = recipes.filter(function (r) { return r.category === 'Main dish' && r.sub === sub && ids.indexOf(r.id) < 0; });
        var r = pickFrom(cands, ids.join(',') + '|' + sub); if (r) res.suggestions.push({ id: r.id, slot: 'main', label: 'a ' + sub.toLowerCase() + ' main' });
      });
    }
    if (res.suggestions.length) {
      res.text = 'Suggested pairing: ' + res.suggestions.map(function (s) { return byIdOf(ctx)[s.id].title + ' (' + s.label + ')'; }).join(', ') + '. Chosen from recipe categories only, not from flavor matching.';
    }
    return res;
  }
  /** Servings multiplier for a suggested dish so it feeds about as many people as the day's first dish. */
  function matchFactor(ctx, state, dayIdx, id) {
    var items = state.days[dayIdx].items, r = byIdOf(ctx)[id];
    if (!items.length || !r || !r.servings) return 1;
    var lead = byIdOf(ctx)[items[0].id]; if (!lead || !lead.servings) return 1;
    var target = lead.servings * items[0].f, best = 1, err = 1e9;
    [0.5, 1, 1.5, 2, 3].forEach(function (f) { var e = Math.abs(r.servings * f - target); if (e < err - 1e-9) { err = e; best = f; } });
    return best;
  }

  var api = { matchFactor: matchFactor, suggestPairings: suggestPairings };
  if (NODE) module.exports = api; else root.CRPairing = api;
})(typeof window !== 'undefined' ? window : globalThis);

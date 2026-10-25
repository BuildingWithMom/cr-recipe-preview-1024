/* Common Roots: substitution framework (SUBS table, the shopper's own swaps, swap text). Tree nuts are never offered. Pure; Node + browser. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  /* ---------- substitution framework ----------
   * Conservative table of straightforward 1:1 swaps (same amount in, same amount out).
   * Keys are shopping-list item keys (the same keys used in each recipe's "m" entries).
   *  - avoid:   item people may want to avoid by default (powers the "never use" preference); first option is the default swap
   *  - match:   how the item appears in ingredient and method text
   *  - options: swap choices, first = default. Each: id (also the merge key), name (shown), aisle, staple, note (flavor/behavior)
   * Never add tree nuts as an option (family allergy). A test enforces this. */
  var SUBS = {
    'vegetable oil': { label: 'vegetable oil', avoid: true, match: /\b(?:vegetable|canola|salad) oil\b/i, options: [
      { id: 'avocado oil', name: 'avocado oil', aisle: 'Pantry & grains', staple: true,
        note: 'Mild flavor and a high smoke point, so it cooks like vegetable oil.' },
      { id: 'olive oil', name: 'olive oil', aisle: 'Pantry & grains', staple: true,
        note: 'Fruitier than vegetable oil. Fine for sautéing; in baking you may taste it.' }] },
    'sour cream': { label: 'sour cream', match: /\bsour cream\b/i, options: [
      { id: 'plain greek yogurt', name: 'plain Greek yogurt', aisle: 'Dairy & eggs', staple: false,
        note: 'Tangier and thicker. Stir it in off the heat and do not let it boil, or it can curdle.' }] },
    'chicken broth': { label: 'chicken broth', match: /\bchicken broth\b/i, options: [
      { id: 'vegetable broth', name: 'vegetable broth', aisle: 'Canned & jarred', staple: false,
        note: 'Lighter, slightly sweeter flavor.' }] }
  };
  var NUT_RE = /almond|walnut|pecan|cashew|pistachio|hazelnut|macadamia|brazil nut|pine nut|chestnut|praline|nut\b/i;

  /* ---------- manual swaps the shopper defines (saved on her device as cr.customSwaps; registered here at page load) ----------
   * { 'ground turkey': { to:'ground chicken', aisle?, note?, timeNote?, conv?:{perUnit:24, fam:'wt'}, textTo?, match?:'regex source' } }
   * A custom swap works exactly like a built-in one (shopping list, recipe text, calendar card) because it is added to SUBS as one more option
   * whose id is 'custom:<item>'. Tree-nut names are refused (family allergy), same rule as the built-in table. */
  var CUSTOM = {}, CUSTOM_BASE = {};
  function escRe(t) { return String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function customCheck(item, def) {
    if (!def || typeof def.to !== 'string') return 'Type what you are using instead.';
    var to = def.to.trim().toLowerCase();
    if (!to || to.length > 60) return 'Use a short name (up to 60 characters).';
    if (!/^[a-z0-9][a-z0-9 ,'()&\/\-]*$/.test(to)) return 'Use letters and numbers only.';
    if (NUT_RE.test(to)) return 'Common Roots keeps tree nuts out of swaps, so that name is not allowed.';
    if (to === item) return 'That is the same ingredient.';
    return '';
  }
  function setCustomSwaps(map) {
    Object.keys(CUSTOM).forEach(function (item) {
      var s = SUBS[item];   // always present: custom swaps are only recorded after their entry exists
      s.options = s.options.filter(function (o) { return !o.custom; });
      if (CUSTOM_BASE[item] === false) delete SUBS[item];
    });
    CUSTOM = {}; CUSTOM_BASE = {};
    Object.keys(map || {}).forEach(function (item) {
      var d = map[item]; if (customCheck(item, d)) return;
      var to = d.to.trim().toLowerCase();
      CUSTOM_BASE[item] = !!SUBS[item];
      if (!SUBS[item]) SUBS[item] = { label: item, custom: true, match: d.match ? new RegExp(d.match, 'i') : new RegExp('\\b' + escRe(item) + 's?\\b', 'i'), options: [] };
      var opt = { id: 'custom:' + item, name: to, aisle: d.aisle || 'Other', staple: false, note: d.note || '', timeNote: d.timeNote || '', custom: true, conv: d.conv || null, textTo: d.textTo || null };
      SUBS[item].options.push(opt);
      CUSTOM[item] = opt;
    });
  }
  function customSwapsDef() { return CUSTOM; }
  function subOptions(item) { var s = SUBS[item]; return s ? s.options : []; }
  function subOption(item, optId) {
    var o = subOptions(item); for (var i = 0; i < o.length; i++) if (o[i].id === optId) return o[i]; return null;
  }
  /** Effective swaps {item: optionId}. explicit = saved choices ({item: id | 'orig'}); auto = "never use" preference on. */
  function effectiveSwaps(explicit, auto) {
    var out = {}; explicit = explicit || {};
    Object.keys(SUBS).forEach(function (item) {
      var c = explicit[item];
      if (c === 'orig') return;
      if (c && subOption(item, c)) { out[item] = c; return; }
      if (auto && SUBS[item].avoid) out[item] = SUBS[item].options[0].id;
    });
    return out;
  }
  /** Replace swapped item names in free text (ingredient line or method step). Single pass, so a swap never re-swaps. */
  function swapText(text, swaps) {
    var hits = [];
    Object.keys(swaps || {}).forEach(function (item) {
      var s = SUBS[item], o = s && subOption(item, swaps[item]); if (!o) return;
      var re = new RegExp(s.match.source, 'gi'), m;
      while ((m = re.exec(text)) !== null) hits.push({ i: m.index, len: m[0].length, to: o.textTo || o.name, src: m[0] });
    });
    hits.sort(function (a, b) { return a.i - b.i; });
    var out = '', pos = 0;
    hits.forEach(function (h) {
      if (h.i < pos) return;
      var to = /^[A-Z]/.test(h.src) ? h.to.charAt(0).toUpperCase() + h.to.slice(1) : h.to;
      out += text.slice(pos, h.i) + to; pos = h.i + h.len;
    });
    return out + text.slice(pos);
  }
  /** The wording an ingredient line used for a swappable item (e.g. "canola oil"), or null. */
  function originalWording(text, item) {
    var s = SUBS[item]; if (!s) return null; var m = text.match(s.match); return m ? m[0].toLowerCase() : null;
  }
  /** One merge entry after applying a swap (quantity and unit family are unchanged: swaps are 1:1). */
  function swapEntry(e, optId) {
    var o = subOption(e.item, optId); if (!o) return e;
    var n = {}; Object.keys(e).forEach(function (k) { n[k] = e[k]; });
    n.item = o.custom ? o.name : o.id; n.name = o.name; n.plural = undefined; n.aisle = o.aisle; n.staple = o.staple; n.swappedFrom = e.item;
    if (o.conv && o.conv.fam === 'wt' && o.conv.perUnit > 0) { n.fam = 'wt'; n.qty = (e.qty || 0) * o.conv.perUnit; n.cu = undefined; n.size = undefined; n.noqty = undefined; }
    return n;
  }
  /** The entries of an ingredient line with swaps applied. */
  function effectiveEntries(ing, swaps) {
    return ing.m.map(function (e) { return swaps && swaps[e.item] ? swapEntry(e, swaps[e.item]) : e; });
  }
  /** The first swappable item on an ingredient line, or null. */
  function swappableItem(ing) {
    for (var i = 0; i < ing.m.length; i++) if (SUBS[ing.m[i].item]) return ing.m[i].item;
    return null;
  }
  /** Which swappable items appear in which recipes (for reporting). */
  function swapIndex(recipes) {
    var out = {};
    recipes.forEach(function (r) { r.ingredients.forEach(function (ing) { ing.m.forEach(function (e) {
      if (SUBS[e.item]) { (out[e.item] = out[e.item] || []); if (out[e.item].indexOf(r.id) < 0) out[e.item].push(r.id); } }); }); });
    return out;
  }

  var api = { NUT_RE: NUT_RE, SUBS: SUBS, customCheck: customCheck, customSwapsDef: customSwapsDef, effectiveEntries: effectiveEntries, effectiveSwaps: effectiveSwaps, originalWording: originalWording, setCustomSwaps: setCustomSwaps, subOption: subOption, subOptions: subOptions, swapEntry: swapEntry, swapIndex: swapIndex, swapText: swapText, swappableItem: swappableItem };
  if (NODE) module.exports = api; else root.CRSwaps = api;
})(typeof window !== 'undefined' ? window : globalThis);

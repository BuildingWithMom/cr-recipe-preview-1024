/* Common Roots: Walmart "add to cart" link builder. Pure logic (works in Node and the browser) + small UI wiring.
 *
 * Link format: https://affil.walmart.com/cart/addToCart?items=ID|qty,ID|qty   (US item ids; adds to the cart, never replaces it)
 * Data: window.CR_WALMART_MAP (site/data/walmart_map.js, generated from data/walmart_map.json).
 *
 * Package-size logic: each map entry has per_pack = how much ONE package holds, in the same canonical units the
 * merged shopping-list rows use: vol = teaspoons, wt = ounces, or a count unit (each, clove, stalk, slice, can).
 * Packages to buy = ceil(amount needed / per_pack). Several list rows can point at one product (e.g. onion by the cup
 * and onion by the each), so fractions are added up per item id before rounding. Rounding ignores a <=3% overshoot.
 * An entry is only used when status === 'VERIFIED' and it has a numeric id. Everything else is returned as "unmapped"
 * so the page can show it as a manual list. Nothing is ever guessed. */
(function (root) {
  'use strict';
  var CONFIG = {
    enabled: true,                 // show the button
    commissionDisclosure: false,   // keep false until Common Roots has actually joined Walmart's affiliate program
    base: 'https://affil.walmart.com/cart/addToCart?items=',
    maxUrlChars: 3500,             // split into several links beyond this (community reports ~3,800 chars as the practical limit)
    ignoreItems: ['water'],        // not purchases
    previewNote: 'Preview: we have not click-tested this Walmart link end to end yet, so check the cart that opens.'
  };
  var TOL = 0.03;

  function isId(x) { return /^\d{4,}$/.test(String(x == null ? '' : x)); }
  function usable(e) { return !!e && e.status === 'VERIFIED' && isId(e.item_id); }

  /** The per_pack key that applies to a merged list row: 'vol' | 'wt' | count unit (each, clove, stalk, slice, can) | 'none'. */
  function rowKey(row) {
    if (row.fam === 'vol') return 'vol';
    if (row.fam === 'wt') return 'wt';
    if (row.fam === 'none') return 'none';
    return row.cu || 'each';      // fam is 'ct:<unit>'
  }
  /** Fraction of one package that this row uses, or null when the product has no matching per_pack figure. */
  function packFraction(row, entry) {
    var k = rowKey(row);
    if (k === 'none') return 0.05;                       // "as needed / a dash": any single package covers it
    var pp = entry && entry.per_pack ? entry.per_pack[k] : null;
    if (!(pp > 0)) return null;
    return (row.qty || 0) / pp;
  }
  /** Whole packages for a fractional need (min 1). */
  function ceilPacks(frac) { var n = Math.ceil(frac - TOL); return n < 1 ? 1 : n; }

  /** Index a map array by ingredient (merge key of the shopping list). */
  function indexMap(map) { var ix = {}; (map || []).forEach(function (e) { if (e && e.ingredient) ix[e.ingredient] = e; }); return ix; }
  function countVerified(map) { return (map || []).filter(usable).length; }

  /**
   * rows: merged shopping-list rows still to buy (CRLib.mergeSelection(...) minus the "have it" rows).
   * Returns { mode, items:[{id,qty,ingredient,name,size}], urls:[...], url, unmapped:[{label,amount,reason}], ignored:[...] }.
   * mode: 'coming_soon' (no verified item anywhere in the map), 'none_mapped' (map has items, but none for this list),
   *       'link' (at least one item will be added).
   */
  function buildCart(rows, map, cfg) {
    cfg = cfg || CONFIG;
    var ix = indexMap(map), out = { mode: 'link', items: [], urls: [], url: null, unmapped: [], ignored: [] };
    if (!countVerified(map)) out.mode = 'coming_soon';
    var byId = {}, order = [];
    (rows || []).forEach(function (r) {
      var label = r.label || r.name || r.item, amount = r.amount || '';
      if ((cfg.ignoreItems || []).indexOf(r.item) >= 0) { out.ignored.push(label); return; }
      var e = ix[r.item];
      if (!e) { out.unmapped.push({ label: label, amount: amount, reason: 'no Walmart match yet' }); return; }
      if (!usable(e)) { out.unmapped.push({ label: label, amount: amount, reason: 'no verified Walmart item yet' }); return; }
      var f = packFraction(r, e);
      if (f === null) f = 1;                              // no per_pack figure for this unit: assume one package, flagged below
      var rec = byId[e.item_id];
      if (!rec) { rec = byId[e.item_id] = { id: String(e.item_id), frac: 0, ingredient: e.ingredient, name: e.product_name, size: e.package_size, assumed: false }; order.push(e.item_id); }
      if (packFraction(r, e) === null) rec.assumed = true;
      rec.frac += f;
    });
    order.forEach(function (id) {
      var rec = byId[id]; out.items.push({ id: rec.id, qty: ceilPacks(rec.frac), ingredient: rec.ingredient, name: rec.name, size: rec.size, assumed: rec.assumed });
    });
    if (out.mode !== 'coming_soon' && !out.items.length) out.mode = 'none_mapped';
    // build one or more links, each under the character limit
    var cur = [], len = cfg.base.length;
    out.items.forEach(function (it) {
      var piece = it.id + '|' + it.qty, add = piece.length + (cur.length ? 1 : 0);
      if (cur.length && len + add > cfg.maxUrlChars) { out.urls.push(cfg.base + cur.join(',')); cur = []; len = cfg.base.length; add = piece.length; }
      cur.push(piece); len += add;
    });
    if (cur.length) out.urls.push(cfg.base + cur.join(','));
    out.url = out.urls[0] || null;
    return out;
  }

  /** The disclosure line shown beside the button. */
  function disclosureText(cfg) {
    cfg = cfg || CONFIG;
    var t = 'Opens Walmart with these items added; check items and quantities before checkout.';
    if (cfg.commissionDisclosure) t += ' Common Roots may earn a commission if we join Walmart\u2019s affiliate program.';
    return t;
  }

  /* ---------- browser wiring (called from app.js on the plan page) ---------- */
  function wire(o) {
    var doc = root.document; if (!doc || !o || !o.button) return;
    var btn = o.button, note = o.note, disc = o.disclosure;
    var map = root.CR_WALMART_MAP || [];
    if (!CONFIG.enabled) { btn.hidden = true; if (disc) disc.hidden = true; return; }
    if (disc) disc.textContent = disclosureText();
    if (!countVerified(map)) btn.textContent = 'Add to Walmart cart (coming soon)';
    function show(lines, list) {
      note.hidden = false; note.innerHTML = '';
      lines.forEach(function (t) { var p = doc.createElement('p'); p.textContent = t; note.appendChild(p); });
      if (list && list.length) {
        var h = doc.createElement('p'); h.className = 'small'; h.textContent = 'Not added \u2014 pick these up yourself or search for them at Walmart:'; note.appendChild(h);
        var ul = doc.createElement('ul'); ul.className = 'unmapped';
        list.forEach(function (u) { var li = doc.createElement('li'); li.textContent = (u.label.charAt(0).toUpperCase() + u.label.slice(1)) + (u.amount ? ' \u2014 ' + u.amount : ''); ul.appendChild(li); });
        note.appendChild(ul);
      }
    }
    btn.addEventListener('click', function () {
      var rows = o.getRows();
      if (!rows.length) { if (o.toast) o.toast('Pick a recipe first.'); return; }
      map = root.CR_WALMART_MAP || [];
      var res = buildCart(rows, map);
      if (o.track) o.track('walmart_click', { mode: res.mode, items: res.items.length, unmapped: res.unmapped.length });
      if (res.mode === 'coming_soon') { show(['Walmart cart link coming soon: we are still matching ingredients to Walmart items, so this button does not add anything yet.'], null); return; }
      if (res.mode === 'none_mapped') { show(['None of the items on this list have a Walmart match yet.'], res.unmapped); return; }
      var lines = ['Opening Walmart with ' + res.items.length + ' item' + (res.items.length === 1 ? '' : 's') + ' added (' + res.items.map(function (i) { return i.qty + '\u00d7 ' + i.name; }).join('; ') + ').'];
      if (res.urls.length > 1) lines.push('Your list is long, so it is split across ' + res.urls.length + ' Walmart links. Allow pop-ups to open them all.');
      if (res.items.some(function (i) { return i.assumed; })) lines.push('A few quantities are best guesses (marked in the notes of the match table); double-check them in your cart.');
      lines.push(CONFIG.previewNote);
      show(lines, res.unmapped);
      res.urls.forEach(function (u) { try { root.open(u, '_blank', 'noopener'); } catch (e) {} });
    });
  }

  var api = { CONFIG: CONFIG, buildCart: buildCart, packFraction: packFraction, ceilPacks: ceilPacks, rowKey: rowKey, usable: usable,
              indexMap: indexMap, countVerified: countVerified, disclosureText: disclosureText, wire: wire };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CRWalmart = api;
})(typeof window !== 'undefined' ? window : globalThis);

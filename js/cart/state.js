/* Common Roots: the shopper's cart bookkeeping on this device (where each line is bought, orders placed, arrivals, pantry, household, custom swaps) plus honest price totals. Pure; storage is passed in. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var CRLeadTimes = NODE ? require('../vendors/lead-times.js') : root.CRLeadTimes;
  var KEYS = CRLeadTimes.KEYS, SOURCE_CHOICES = CRLeadTimes.SOURCE_CHOICES, normalizeCfg = CRLeadTimes.normalizeCfg;
  var CRStorageM = NODE ? require('../core/storage.js') : root.CRStorage;
  var rd = CRStorageM.rd, wr = CRStorageM.wr, isObj = CRStorageM.isObj;
  /* ---------- money honesty ---------- */
  function parsePrice(p) { if (p == null || p === '') return null; var m = /(\d+(?:\.\d+)?)/.exec(String(p)); return m ? Number(m[1]) : null; }
  /** lines = [{ price, qty }] for every line that will be bought (Walmart items, Tyner lines, Market Wagon lines with price null, unmapped lines with price null). */
  function priceStats(lines) {
    var total = 0, priced = 0;
    (lines || []).forEach(function (l) { var p = parsePrice(l.price); if (p != null) { priced++; total += p * (l.qty || 1); } });
    total = Math.round(total * 100) / 100;
    var m = (lines || []).length;
    return { priced: priced, lines: m, unpriced: m - priced, total: total,
      text: priced ? 'About $' + total.toFixed(2) + ' for the ' + priced + ' priced line' + (priced === 1 ? '' : 's') + '. ' + priced + ' of ' + m + ' lines have a price' + (m > priced ? ', so the real total will be higher' : '') + '.' : '0 of ' + m + ' lines have a price, so there is no total yet.' };
  }
  /** Quarter-pack text, e.g. 0.5 -> "1/2". */
  function fracText(x) { var q = Math.round(x * 4) / 4, w = Math.floor(q), r = q - w, f = r === 0.25 ? '1/4' : r === 0.5 ? '1/2' : r === 0.75 ? '3/4' : ''; return (w ? w + (f ? ' ' : '') : '') + f || '0'; }
  /** Label for a rounded-up package: what is bought, what is used, what is left. item = a CRWalmart.buildCart item with frac. */
  function leftoverNote(item) {
    if (!item || item.assumed || !(item.frac > 0) || !(item.qty >= 1)) return '';
    var left = item.qty - item.frac;
    if (left < 0.26) return '';
    if (item.frac < 0.125) return 'Buys ' + item.qty + ' (' + item.size + '): the recipes use only a small part of it, so most of the pack is left over.';
    return 'Buys ' + item.qty + ' (' + item.size + '): the recipes use about ' + fracText(item.frac) + ' of a pack' + (item.qty > 1 ? ' in total' : '') + ', so about ' + fracText(left) + ' pack' + (left > 1.01 ? 's' : '') + ' left over.';
  }

  /* ---------- the shopper's bookkeeping ---------- */
  function makeState(storage) {
    var S = {
      cfg: function () { return normalizeCfg(rd(storage, KEYS.cfg, {})); },
      setCfg: function (c) { return wr(storage, KEYS.cfg, normalizeCfg(c)); },
      src: function () { var m = rd(storage, KEYS.src, {}), o = {}; if (!isObj(m)) return o; Object.keys(m).forEach(function (k) { if (SOURCE_CHOICES.indexOf(m[k]) >= 0 || (isObj(m[k]) && m[k].v === 'elsewhere')) o[k] = m[k]; }); return o; },
      setSrc: function (item, v, where) { var m = S.src(); if (!v) delete m[item]; else m[item] = v === 'elsewhere' && where ? { v: 'elsewhere', where: String(where).slice(0, 60) } : v; return wr(storage, KEYS.src, m); },
      srcVendor: function (item) { var v = S.src()[item]; return isObj(v) ? v.v : (v || null); },
      status: function () { var m = rd(storage, KEYS.status, {}); return isObj(m) ? m : {}; },
      setStatus: function (item, s, extra) { var m = S.status(); if (!s) delete m[item]; else m[item] = Object.assign({ s: s, at: Date.now() }, extra || {}); return wr(storage, KEYS.status, m); },
      statusOf: function (item) { var x = S.status()[item]; return x && x.s ? x.s : null; },
      orders: function () { var m = rd(storage, KEYS.orders, {}); return isObj(m) ? m : {}; },
      /** Record "I placed this order" for a group { vendor, arrive, orderBy, lines:[{item,label}] }. Lines in `missing` stay to-buy with status 'oos'. */
      placeOrder: function (g, missing) {
        var os = S.orders(), n = 1, id; while (os[(id = g.vendor + '|' + (g.arrive || 'undated') + '|' + n)]) n++;
        var miss = missing || [], items = g.lines.map(function (l) { return l.item; }).filter(function (i) { return miss.indexOf(i) < 0; });
        os[id] = { id: id, vendor: g.vendor, arrive: g.arrive || null, placedAt: Date.now(), items: items, labels: g.lines.filter(function (l) { return items.indexOf(l.item) >= 0; }).map(function (l) { return l.label; }), received: false };
        wr(storage, KEYS.orders, os);
        items.forEach(function (i) { S.setStatus(i, 'ordered', { order: id, arrive: g.arrive || null, vendor: g.vendor }); });
        miss.forEach(function (i) { S.setStatus(i, 'oos', { vendor: g.vendor }); });
        return os[id];
      },
      /** "Did everything land?": items in `got` become bought; the rest of the order goes back to to-buy (status 'missing'). */
      receiveOrder: function (id, got) {
        var os = S.orders(), o = os[id]; if (!o) return false;
        o.received = true; o.receivedAt = Date.now(); o.got = got.slice();
        o.items.forEach(function (i) { if (got.indexOf(i) >= 0) S.setStatus(i, 'bought', { order: id, vendor: o.vendor }); else S.setStatus(i, 'missing', { order: id, vendor: o.vendor }); });
        return wr(storage, KEYS.orders, os);
      },
      cancelOrder: function (id) {
        var os = S.orders(), o = os[id]; if (!o) return false;
        o.items.forEach(function (i) { var st = S.status()[i]; if (st && st.order === id) S.setStatus(i, null); });
        delete os[id]; return wr(storage, KEYS.orders, os);
      },
      pantry: function () { var m = rd(storage, KEYS.pantry, {}); return isObj(m) ? m : {}; },     // { item: 'have' | 'need' }
      setPantry: function (item, v) { var m = S.pantry(); if (!v) delete m[item]; else m[item] = v === 'need' ? 'need' : 'have'; return wr(storage, KEYS.pantry, m); },
      pantryDone: function () { return rd(storage, KEYS.pantryDone, false) === true; },
      setPantryDone: function (b) { return wr(storage, KEYS.pantryDone, !!b); },
      household: function () { var n = Number(rd(storage, KEYS.household, 0)); return n >= 1 && n <= 24 ? Math.round(n) : 0; },      // 0 = recipes as written
      setHousehold: function (n) { n = Number(n); return wr(storage, KEYS.household, n >= 1 && n <= 24 ? Math.round(n) : 0); },
      custom: function () { var m = rd(storage, KEYS.custom, {}); return isObj(m) ? m : {}; },
      setCustom: function (item, def) { var m = S.custom(); if (!def) delete m[item]; else m[item] = def; return wr(storage, KEYS.custom, m); }
    };
    return S;
  }
  /** Orders whose delivery day has arrived and that the shopper has not closed out. */
  function dueArrivals(orders, now) {
    return Object.keys(orders || {}).map(function (k) { return orders[k]; }).filter(function (o) { return !o.received && o.arrive && o.arrive <= now.date; });
  }

  /* ---------- manual-swap presets (shown as quick picks; anything else is free text and carries the quantity 1:1) ---------- */
  var SWAP_PRESETS = {
    'ground turkey': [{ to: 'ground chicken', note: '' }],
    'roasted chicken': [{
      to: 'chicken breast', conv: { fam: 'wt', perUnit: 24 },
      match: '(?:[\\d\\s&/.\u00bc-\u00be\u2150-\u215e]+(?:\\(\\d+\\s*lbs?\\)\\s*)?)?\\b(?:roasted|rotisserie) chickens?\\b', textTo: 'chicken breasts, cooked and shredded (instead of rotisserie chicken; amount is on your shopping list)',
      note: 'Cook the chicken breasts first (simmer or bake until cooked through), shred them, then follow the recipe. Adjust the cooking time yourself.',
      basis: 'About 24 oz of raw boneless breast per rotisserie chicken: a rotisserie chicken gives roughly 3 to 4 cups of shredded meat and 1 lb of raw breast about 2 to 3 cups (from our substitutes notes); we use the low end of both so you do not run short.' }]
  };
  function presetsFor(item) { return SWAP_PRESETS[item] || []; }

  var api = { SWAP_PRESETS: SWAP_PRESETS, dueArrivals: dueArrivals, fracText: fracText, leftoverNote: leftoverNote, makeState: makeState, parsePrice: parsePrice, presetsFor: presetsFor, priceStats: priceStats };
  if (NODE) module.exports = api; else root.CRCartState = api;
})(typeof window !== 'undefined' ? window : globalThis);

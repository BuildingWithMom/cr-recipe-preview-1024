/* Common Roots: "Where to buy" routing (Tyner Pond Farm, Market Wagon farms, Walmart fallback). Pure logic (Node + browser). */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var W = NODE ? require('./walmart.js') : root.CRWalmart;
  var CART_BASE = 'https://tynerpondfarm.com/cart/';
  function route(rows, o) {
    o = o || {};
    var farm = o.farm || root.CR_FARM || null, mode = o.mode === 'farm' && farm ? 'farm' : 'walmart';
    var res = { mode: mode, overrides: o.overrides || {}, walmartRows: [], tyner: { lines: [], url: null, subtotal: 0, freeMin: null, remaining: null }, market: { lines: [] }, farms: {}, options: [], fallbacks: [] };
    var ov = o.overrides || {}, hasOv = Object.keys(ov).length > 0;     // overrides: { ingredient: 'walmart' | 'tyner' | 'market' } (the shopper's Where menu, or an automatic reroute)
    if (mode !== 'farm' && !hasOv) { res.walmartRows = (rows || []).slice(); return res; }
    var ty = Object.assign({ items: {}, extras: {}, not_covered: {} }, farm && farm.tyner), mw = Object.assign({ farms: [], routes: {} }, farm && farm.marketwagon);   // missing parts mean "nothing listed"
    var fById = {}; mw.farms.forEach(function (f) { fById[f.id] = f; res.farms[f.id] = { id: f.id, name: f.name, place: f.place, url: f.url, lines: [] }; });
    var byVar = {}, order = [];
    (rows || []).forEach(function (r) {
      var label = r.label || r.name || r.item, want = ov[r.item] || (mode === 'farm' ? 'auto' : 'walmart');
      var ti = ty.items[r.item], rt = mw.routes[r.item] || [];
      if (want !== 'tyner' && want !== 'market' && want !== 'auto') { res.walmartRows.push(r); return; }   // 'walmart' (or anything unknown) stays at Walmart
      if (want === 'tyner') {
        ti = ti || ty.extras[r.item];
        if (!ti) { res.fallbacks.push({ ingredient: r.item, label: label, amount: r.amount || '', reason: 'Tyner Pond Farm does not list this in our Oct 24, 2026 copy of their product list, so it stays at Walmart.' }); res.walmartRows.push(r); return; }
      } else if (want === 'market') {
        if (!(rt.length && fById[rt[0]])) { res.fallbacks.push({ ingredient: r.item, label: label, amount: r.amount || '', reason: 'Neither default Market Wagon farm lists this, so it stays at Walmart.' }); res.walmartRows.push(r); return; }
        ti = null;
      }
      if (ti && (want === 'tyner' || want === 'auto')) {
        if (ti.in_stock_at_snapshot && /^\d{6,}$/.test(String(ti.variant_id))) {
          var f = W.packFraction(r, ti), rec = byVar[ti.variant_id];
          if (!rec) { rec = byVar[ti.variant_id] = { ingredient: r.item, label: label, variant_id: String(ti.variant_id), title: ti.title, variant_title: ti.variant_title, price: ti.price_usd,
            url: ti.url, note: ti.note, frac: 0, assumed: false, amounts: [] }; order.push(ti.variant_id); }
          if (f === null) { f = 1; rec.assumed = true; }
          rec.frac += f; rec.amounts.push(r.amount || '');
          return;
        }
        res.fallbacks.push({ ingredient: r.item, label: label, amount: r.amount || '', reason: 'Tyner Pond Farm was out of stock for this in our Oct 24, 2026 copy of their product list, so it goes to Walmart.' });
        res.walmartRows.push(r); return;
      }
      if (want === 'auto' && ty.not_covered[r.item]) {
        res.fallbacks.push({ ingredient: r.item, label: label, amount: r.amount || '', reason: ty.not_covered[r.item] });
        res.walmartRows.push(r); return;
      }
      if (rt.length && fById[rt[0]]) {
        var f0 = fById[rt[0]], it0 = f0.items[r.item];
        var ln = { ingredient: r.item, label: label, amount: r.amount || '', farm: f0.id, farmName: f0.name, name: it0.name, note: it0.note || '', url: f0.url,
                   alsoAt: rt.slice(1).filter(function (id) { return fById[id]; }).map(function (id) { return { farm: id, farmName: fById[id].name, name: fById[id].items[r.item].name }; }) };
        res.farms[f0.id].lines.push(ln); res.market.lines.push(ln);
        return;
      }
      res.walmartRows.push(r);
    });
    mw.farms.forEach(function (f) {
      Object.keys(f.options).forEach(function (ing) {
        var shown = (rows || []).filter(function (r) { return r.item === ing; })[0]; if (!shown) return;
        res.options.push({ ingredient: ing, label: shown.label || shown.name || ing, amount: shown.amount || '', farm: f.id, farmName: f.name, name: f.options[ing].name, note: f.options[ing].note, url: f.url });
      });
    });
    order.forEach(function (v) {
      var rec = byVar[v], qty = W.ceilPacks(rec.frac);
      res.tyner.lines.push({ ingredient: rec.ingredient, label: rec.label, variant_id: rec.variant_id, qty: qty, title: rec.title, variant_title: rec.variant_title, price: rec.price,
        line: Math.round(qty * rec.price * 100) / 100, url: rec.url, note: rec.note, assumed: rec.assumed, amount: rec.amounts.join(' + ') });
    });
    if (res.tyner.lines.length || res.market.lines.length) res.mode = 'farm';
    if (res.tyner.lines.length) {
      res.tyner.url = (ty.cart_base || CART_BASE) + res.tyner.lines.map(function (l) { return l.variant_id + ':' + l.qty; }).join(',');
      res.tyner.subtotal = Math.round(res.tyner.lines.reduce(function (s, l) { return s + l.line; }, 0) * 100) / 100;
      res.tyner.freeMin = ty.free_delivery_min_usd || null;
      res.tyner.remaining = res.tyner.freeMin ? Math.max(0, Math.round((res.tyner.freeMin - res.tyner.subtotal) * 100) / 100) : null;
    }
    return res;
  }

  /** Which vendor a list row goes to, for the little tag on each row: {vendor:'tyner'|'market'|'walmart', coverage?, reason?} */
  function vendorOf(routed, item) {
    var i;
    for (i = 0; i < routed.tyner.lines.length; i++) if (routed.tyner.lines[i].ingredient === item) return { vendor: 'tyner', line: routed.tyner.lines[i] };
    for (i = 0; i < routed.market.lines.length; i++) if (routed.market.lines[i].ingredient === item) return { vendor: 'market', line: routed.market.lines[i] };
    for (i = 0; i < routed.fallbacks.length; i++) if (routed.fallbacks[i].ingredient === item) return { vendor: 'walmart', reason: routed.fallbacks[i].reason };
    return { vendor: 'walmart' };
  }

  /** One Tyner cart link for a subset of the routed Tyner lines (an order group: the lines that arrive on the same delivery day). */
  function tynerUrlFor(lines, farm) {
    farm = farm || root.CR_FARM || {}; var base = (farm.tyner && farm.tyner.cart_base) || CART_BASE;
    return lines && lines.length ? base + lines.map(function (l) { return l.variant_id + ':' + l.qty; }).join(',') : null;
  }

  var api = { route: route, tynerUrlFor: tynerUrlFor, vendorOf: vendorOf };
  if (NODE) module.exports = api; else root.CRFarmCore = api;
})(typeof window !== 'undefined' ? window : globalThis);

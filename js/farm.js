/* Common Roots: "Where to buy" routing. Pure logic (Node and browser) + card rendering for the plan page.
 *
 * Modes: 'walmart' (default: everything goes to Walmart) and 'farm' ("Farm fresh where possible").
 * Farm mode, per merged list row:
 *   - Tyner Pond Farm (meat): only when the ingredient has a Tyner variant id in site/data/farm_sources.js AND that variant was in stock in the
 *     saved Oct 24, 2026 copy of their public product list. The cart link is https://tynerpondfarm.com/cart/<variantId>:<qty>,...
 *   - Market Wagon (eggs, dairy, some produce): a tap-through checklist (no cart link or API exists), with a 'listed' / 'possible' label.
 *   - everything else, and anything out of stock or not covered, falls back to Walmart.
 * Nothing is ever claimed as a partnership; the vendors are named as places to buy only. */
(function (root) {
  'use strict';
  var W = root.CRWalmart || (typeof require !== 'undefined' ? require('./walmart.js') : null);
  var MIN_FRAC_NOTE = 0.05;

  function route(rows, o) {
    o = o || {};
    var farm = o.farm || root.CR_FARM || null, mode = o.mode === 'farm' && farm ? 'farm' : 'walmart';
    var res = { mode: mode, walmartRows: [], tyner: { lines: [], url: null, subtotal: 0, freeMin: null, remaining: null }, market: { lines: [] }, fallbacks: [] };
    if (mode !== 'farm') { res.walmartRows = (rows || []).slice(); return res; }
    var ty = farm.tyner || { items: {}, not_covered: {} }, mw = farm.marketwagon || { items: {} };
    var byVar = {}, order = [];
    (rows || []).forEach(function (r) {
      var label = r.label || r.name || r.item, ti = ty.items && ty.items[r.item], mi = mw.items && mw.items[r.item];
      if (ti) {
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
      if (ty.not_covered && ty.not_covered[r.item]) {
        res.fallbacks.push({ ingredient: r.item, label: label, amount: r.amount || '', reason: ty.not_covered[r.item] });
        res.walmartRows.push(r); return;
      }
      if (mi) {
        res.market.lines.push({ ingredient: r.item, label: label, amount: r.amount || '', coverage: mi.coverage, page: mi.page, url: mi.url, note: mi.note });
        return;
      }
      res.walmartRows.push(r);
    });
    order.forEach(function (v) {
      var rec = byVar[v], qty = W.ceilPacks(rec.frac);
      res.tyner.lines.push({ ingredient: rec.ingredient, label: rec.label, variant_id: rec.variant_id, qty: qty, title: rec.title, variant_title: rec.variant_title, price: rec.price,
        line: Math.round(qty * rec.price * 100) / 100, url: rec.url, note: rec.note, assumed: rec.assumed, amount: rec.amounts.join(' + ') });
    });
    if (res.tyner.lines.length) {
      res.tyner.url = (ty.cart_base || 'https://tynerpondfarm.com/cart/') + res.tyner.lines.map(function (l) { return l.variant_id + ':' + l.qty; }).join(',');
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

  function money(n) { return '$' + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, ''); }

  /** Renders the three cards into `container`. Returns the element inside the Walmart card where the Walmart controls should be placed. */
  function renderCards(container, routed, o) {
    var doc = root.document; if (!doc || !container) return null;
    o = o || {}; var farm = o.farm || root.CR_FARM || {};
    container.innerHTML = '';
    if (routed.mode !== 'farm') { container.hidden = true; return null; }
    container.hidden = false;
    function el(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
    function link(href, text, cls) { var a = el('a', cls, text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; }
    var ty = farm.tyner || {}, mw = farm.marketwagon || {};

    /* Tyner */
    var c1 = el('section', 'src-card tyner'); c1.setAttribute('data-card', 'tyner');
    c1.appendChild(el('h3', '', 'Tyner Pond Farm \u2014 meat'));
    c1.appendChild(el('p', 'small', 'A farm in central Indiana that lists Westfield for delivery. Common Roots has no partnership with them; we just build a link to their public shop.'));
    if (routed.tyner.lines.length) {
      var ul = el('ul', 'src-lines');
      routed.tyner.lines.forEach(function (l) {
        var li = el('li', '', l.qty + ' \u00d7 ' + l.title + (l.variant_title && l.variant_title !== 'Default Title' ? ' (' + l.variant_title + ')' : '') + ' \u2014 about ' + money(l.price) + ' each');
        li.appendChild(el('span', 'small src-for', ' for ' + l.label + ' (' + l.amount + ')' + (l.assumed ? '; quantity is a best guess' : '')));
        ul.appendChild(li);
      });
      c1.appendChild(ul);
      c1.appendChild(link(routed.tyner.url, 'Add to Tyner cart', 'btn dark small tyner-btn'));
      var prog = el('div', 'src-prog');
      var pr = doc.createElement('progress'); pr.max = routed.tyner.freeMin || 63; pr.value = Math.min(routed.tyner.subtotal, pr.max); pr.setAttribute('aria-label', 'Progress toward free delivery');
      prog.appendChild(pr);
      prog.appendChild(el('span', 'small', ' About ' + money(routed.tyner.subtotal) + ' of the ' + money(routed.tyner.freeMin || 63) + ' free-delivery minimum' +
        (routed.tyner.remaining > 0 ? ' (about ' + money(routed.tyner.remaining) + ' to go)' : ' (reached)') + ' \u2014 per their site, check at checkout.'));
      c1.appendChild(prog);
    } else {
      c1.appendChild(el('p', '', 'Nothing on this list is a Tyner pick right now (it needs meat from the recipes you chose).'));
    }
    c1.appendChild(el('p', 'small', 'Prices and stock come from a copy of their public product list saved ' + ((ty.snapshot && ty.snapshot.fetched) || 'Oct 24, 2026') + '; they may have changed. Items are mostly frozen. ' +
      'Their site asks automated agents to identify themselves; this page does not read their site, it only links to it. Confirm everything at their checkout.'));
    if (routed.fallbacks.length) {
      var fb = el('div', 'small src-fb'); fb.appendChild(el('strong', '', 'Moved to Walmart instead:'));
      var fl = el('ul'); routed.fallbacks.forEach(function (f) { fl.appendChild(el('li', '', L_cap(f.label) + ' \u2014 ' + f.reason)); }); fb.appendChild(fl); c1.appendChild(fb);
    }
    container.appendChild(c1);

    /* Market Wagon */
    var c2 = el('section', 'src-card market'); c2.setAttribute('data-card', 'market');
    c2.appendChild(el('h3', '', 'Market Wagon \u2014 eggs, dairy and some produce'));
    c2.appendChild(el('p', 'small', 'An online farmers market with many local vendors. Common Roots has no partnership with them. There is no cart link or order API, so tap through and add each item yourself.'));
    c2.appendChild(el('p', 'note-line', 'Delivery to ' + (mw.zip || '46074') + ': order by ' + (mw.order_by || 'Wednesday 1:00 AM') + ' for ' + (mw.delivery_day || 'Thursday') + ' delivery \u2014 to confirm.'));
    if (routed.market.lines.length) {
      var ml = el('ul', 'src-checklist');
      routed.market.lines.forEach(function (l, i) {
        var li = el('li'), lab = el('label'), cb = doc.createElement('input'); cb.type = 'checkbox'; cb.setAttribute('aria-label', 'Added ' + l.label + ' to my Market Wagon order');
        lab.appendChild(cb); lab.appendChild(el('span', 'mw-name', ' ' + L_cap(l.label) + ' \u2014 ' + l.amount)); li.appendChild(lab);
        li.appendChild(el('span', 'pill ' + (l.coverage === 'listed' ? 'ok' : 'maybe'), l.coverage === 'listed' ? 'listed on their page' : 'possible, confirm'));
        li.appendChild(el('div', 'small', l.note + ' '));
        li.lastChild.appendChild(link(l.url, 'Open the page to search'));
        ml.appendChild(li);
      });
      c2.appendChild(ml);
    } else { c2.appendChild(el('p', '', 'Nothing on this list is a Market Wagon pick right now.')); }
    c2.appendChild(el('p', 'small', (mw.not_covered_note || '') + ' Those stay at Walmart. Vendors, stock and prices change weekly.'));
    container.appendChild(c2);

    /* Walmart */
    var c3 = el('section', 'src-card walmart'); c3.setAttribute('data-card', 'walmart');
    c3.appendChild(el('h3', '', 'Walmart \u2014 everything else'));
    c3.appendChild(el('p', 'small', routed.walmartRows.filter(function (r) { return r.item !== 'water'; }).length + ' items: pantry, produce and anything the farms do not cover or had out of stock.'));
    var slot = el('div', 'walmart-slot'); c3.appendChild(slot);
    container.appendChild(c3);
    return slot;
  }
  function L_cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  var api = { route: route, vendorOf: vendorOf, renderCards: renderCards, money: money };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CRFarm = api;
})(typeof window !== 'undefined' ? window : globalThis);

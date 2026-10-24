/* Common Roots: "Where to buy" routing. Pure logic (Node and browser) + card rendering for the plan page.
 *
 * Modes: 'walmart' (default: everything goes to Walmart) and 'farm' ("Farm fresh where possible").
 * Farm mode, per merged list row:
 *   - Tyner Pond Farm (meat): only when the ingredient has a Tyner variant id in site/data/farm_sources.js AND that variant was in stock in the
 *     saved Oct 24, 2026 copy of their public product list. The cart link is https://tynerpondfarm.com/cart/<variantId>:<qty>,...
 *   - Market Wagon, two default farms (Shrock Family Farm, Priest Family Farm): each ingredient the farm's own listing names goes to the farm that lists it
 *     (data.routes gives the order when both do); a 'look for this exact name' checklist and ONE link to page 1 of the farm's vendor collection (no cart link,
 *     no per-product urls, no prices exist/are shown).
 *   - everything else, and anything out of stock or not covered, falls back to Walmart.
 * Nothing is ever claimed as a partnership; the vendors are named as places to buy only. */
(function (root) {
  'use strict';
  var W = root.CRWalmart || (typeof require !== 'undefined' ? require('./walmart.js') : null);
  var MIN_FRAC_NOTE = 0.05;

  function route(rows, o) {
    o = o || {};
    var farm = o.farm || root.CR_FARM || null, mode = o.mode === 'farm' && farm ? 'farm' : 'walmart';
    var res = { mode: mode, walmartRows: [], tyner: { lines: [], url: null, subtotal: 0, freeMin: null, remaining: null }, market: { lines: [] }, farms: {}, options: [], fallbacks: [] };
    if (mode !== 'farm') { res.walmartRows = (rows || []).slice(); return res; }
    var ty = farm.tyner || { items: {}, not_covered: {} }, mw = farm.marketwagon || { farms: [], routes: {} };
    var fById = {}; (mw.farms || []).forEach(function (f) { fById[f.id] = f; res.farms[f.id] = { id: f.id, name: f.name, place: f.place, url: f.url, lines: [] }; });
    var byVar = {}, order = [];
    (rows || []).forEach(function (r) {
      var label = r.label || r.name || r.item, ti = ty.items && ty.items[r.item], rt = (mw.routes && mw.routes[r.item]) || [];
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
      if (rt.length && fById[rt[0]]) {
        var f0 = fById[rt[0]], it0 = f0.items[r.item];
        var ln = { ingredient: r.item, label: label, amount: r.amount || '', farm: f0.id, farmName: f0.name, name: it0.name, note: it0.note || '', url: f0.url,
                   alsoAt: rt.slice(1).filter(function (id) { return fById[id]; }).map(function (id) { return { farm: id, farmName: fById[id].name, name: fById[id].items[r.item].name }; }) };
        res.farms[f0.id].lines.push(ln); res.market.lines.push(ln);
        return;
      }
      res.walmartRows.push(r);
    });
    (mw.farms || []).forEach(function (f) {
      Object.keys(f.options || {}).forEach(function (ing) {
        var shown = (rows || []).filter(function (r) { return r.item === ing; })[0]; if (!shown) return;
        res.options.push({ ingredient: ing, label: shown.label || shown.name || ing, amount: shown.amount || '', farm: f.id, farmName: f.name, name: f.options[ing].name, note: f.options[ing].note, url: f.url });
      });
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
    routed.options.filter(function (o) { return o.farmName; }).forEach(function (o) {
      c1.appendChild(el('p', 'small', 'Chicken breast: ' + o.farmName + ' (on Market Wagon) is an option too, with a family-size pack of about 1.2 to 1.5 lb. See its card below.'));
    });
    c1.appendChild(el('p', 'small', 'Prices and stock come from a copy of their public product list saved ' + ((ty.snapshot && ty.snapshot.fetched) || 'Oct 24, 2026') + '; they may have changed. Items are mostly frozen. ' +
      'Their site asks automated agents to identify themselves; this page does not read their site, it only links to it. Confirm everything at their checkout.'));
    if (routed.fallbacks.length) {
      var fb = el('div', 'small src-fb'); fb.appendChild(el('strong', '', 'Moved to Walmart instead:'));
      var fl = el('ul'); routed.fallbacks.forEach(function (f) { fl.appendChild(el('li', '', L_cap(f.label) + ' \u2014 ' + f.reason)); }); fb.appendChild(fl); c1.appendChild(fb);
    }
    container.appendChild(c1);

    /* Market Wagon: two default farms, one card each (no prices, no per-product links, page 1 of the vendor collection only) */
    (mw.farms || []).forEach(function (f) {
      var fl = routed.farms[f.id] || { lines: [] };
      var c = el('section', 'src-card market farm-' + f.id); c.setAttribute('data-card', 'farm-' + f.id);
      c.appendChild(el('h3', '', f.name + ' \u2014 ' + f.place));
      c.appendChild(el('p', 'small', 'Sells through Market Wagon, an online farmers market. Common Roots has no partnership with ' + f.name + ' or Market Wagon. There is no cart link, so open their page and add each item yourself.'));
      c.appendChild(el('p', 'note-line', 'Delivery to ' + (mw.zip || '46074') + ': ' + (mw.delivery_note || '')));
      c.appendChild(link(f.url, 'Open ' + f.name + ' on Market Wagon', 'btn dark small mw-btn'));
      c.appendChild(el('p', 'small', 'Opens the first page of their shop. Product cards open in a pop-up there, so find each item by the exact name below.'));
      if (fl.lines.length) {
        var ml = el('ul', 'src-checklist');
        fl.lines.forEach(function (l) {
          var li = el('li'), lab = el('label'), cb = doc.createElement('input'); cb.type = 'checkbox'; cb.setAttribute('aria-label', 'Added ' + l.label + ' from ' + f.name + ' to my Market Wagon order');
          lab.appendChild(cb); lab.appendChild(el('span', 'mw-name', ' ' + L_cap(l.label) + ' \u2014 ' + l.amount)); li.appendChild(lab);
          var look = el('div', 'small mw-look'); look.appendChild(doc.createTextNode('Look for this exact name: ')); look.appendChild(el('strong', 'mw-exact', '\u201c' + l.name + '\u201d')); li.appendChild(look);
          if (l.note) li.appendChild(el('div', 'small', l.note));
          if (l.alsoAt.length) li.appendChild(el('div', 'small', 'Also listed by ' + l.alsoAt.map(function (a) { return a.farmName + ' as \u201c' + a.name + '\u201d'; }).join(', ') + '.'));
          ml.appendChild(li);
        });
        c.appendChild(ml);
      } else { c.appendChild(el('p', '', 'Nothing on this list is a ' + f.name + ' pick right now.')); }
      var opts = routed.options.filter(function (o) { return o.farm === f.id; });
      opts.forEach(function (o) {
        var d = el('div', 'small src-opt'); d.appendChild(el('strong', '', 'Option for ' + o.label + ' (instead of Tyner Pond Farm): '));
        d.appendChild(doc.createTextNode('look for \u201c' + o.name + '\u201d. ' + o.note)); c.appendChild(d);
      });
      if (f.potted_note) c.appendChild(el('p', 'small', f.potted_note));
      if (f.sold_out_note) c.appendChild(el('p', 'small', f.sold_out_note));
      c.appendChild(el('p', 'small', 'Also sells (not on your checklist): ' + f.also_sells + ' Their stock changes, so confirm items and the delivery date at checkout. Prices are not shown here because they change.'));
      container.appendChild(c);
    });
    if (!(mw.farms || []).length) container.appendChild(el('section', 'src-card market'));

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

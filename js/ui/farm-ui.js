/* Common Roots: the three source cards on the plan page. Browser only (needs the DOM). */
(function (root) {
  'use strict';
  function money(n) { return '$' + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, ''); }

  /** Renders the three cards into `container`. Returns the element inside the Walmart card where the Walmart controls should be placed. */
  function renderCards(container, routed) {
    var doc = root.document, farm = root.CR_FARM;
    container.innerHTML = '';
    if (routed.mode !== 'farm') { container.hidden = true; return null; }
    container.hidden = false;
    function el(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
    function link(href, text, cls) { var a = el('a', cls, text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; }
    var ty = farm.tyner, mw = farm.marketwagon;

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
      var pr = doc.createElement('progress'); pr.max = routed.tyner.freeMin; pr.value = Math.min(routed.tyner.subtotal, pr.max); pr.setAttribute('aria-label', 'Progress toward free delivery');
      prog.appendChild(pr);
      prog.appendChild(el('span', 'small', ' About ' + money(routed.tyner.subtotal) + ' of the ' + money(routed.tyner.freeMin) + ' free-delivery minimum' +
        (routed.tyner.remaining > 0 ? ' (about ' + money(routed.tyner.remaining) + ' to go)' : ' (reached)') + ' \u2014 per their site, check at checkout. ' + ty.free_delivery_min_conflict));
      c1.appendChild(prog);
    } else {
      c1.appendChild(el('p', '', 'Nothing on this list is a Tyner pick right now (it needs meat from the recipes you chose).'));
    }
    routed.options.filter(function (o) { return o.farmName; }).forEach(function (o) {
      c1.appendChild(el('p', 'small', 'Chicken breast: ' + o.farmName + ' (on Market Wagon) is an option too, with a family-size pack of about 1.2 to 1.5 lb. See its card below.'));
    });
    c1.appendChild(el('p', 'small', 'Prices and stock come from a copy of their public product list saved ' + ty.snapshot.fetched + '; they may have changed. Items are mostly frozen. ' +
      'Their site asks automated agents to identify themselves; this page does not read their site, it only links to it. Confirm everything at their checkout.'));
    if (routed.fallbacks.length) {
      var fb = el('div', 'small src-fb'); fb.appendChild(el('strong', '', 'Moved to Walmart instead:'));
      var fl = el('ul'); routed.fallbacks.forEach(function (f) { fl.appendChild(el('li', '', L_cap(f.label) + ' \u2014 ' + f.reason)); }); fb.appendChild(fl); c1.appendChild(fb);
    }
    container.appendChild(c1);

    /* Market Wagon: two default farms, one card each (no prices, no per-product links, page 1 of the vendor collection only) */
    mw.farms.forEach(function (f) {
      var fl = routed.farms[f.id];
      var c = el('section', 'src-card market farm-' + f.id); c.setAttribute('data-card', 'farm-' + f.id);
      c.appendChild(el('h3', '', f.name + ' \u2014 ' + f.place));
      c.appendChild(el('p', 'small', 'Sells through Market Wagon, an online farmers market. Common Roots has no partnership with ' + f.name + ' or Market Wagon. There is no cart link, so open their page and add each item yourself.'));
      c.appendChild(el('p', 'note-line', 'Delivery to ' + mw.zip + ': ' + mw.delivery_note));
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

    /* Walmart */
    var c3 = el('section', 'src-card walmart'); c3.setAttribute('data-card', 'walmart');
    c3.appendChild(el('h3', '', 'Walmart \u2014 everything else'));
    c3.appendChild(el('p', 'small', routed.walmartRows.filter(function (r) { return r.item !== 'water'; }).length + ' items: pantry, produce and anything the farms do not cover or had out of stock.'));
    var slot = el('div', 'walmart-slot'); c3.appendChild(slot);
    container.appendChild(c3);
    return slot;
  }
  function L_cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  var api = { money: money, renderCards: renderCards };
  root.CRFarmUI = api;
})(window);

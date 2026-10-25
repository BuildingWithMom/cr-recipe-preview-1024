/* Common Roots: Walmart UI wiring (substitutes list, the Walmart checklist and Out of stock button). Browser only (needs the DOM). */
(function (root) {
  'use strict';
  var CRWalmartCore = root.CRWalmartCore;
  var CONFIG = CRWalmartCore.CONFIG, alternativesFor = CRWalmartCore.alternativesFor, buildCart = CRWalmartCore.buildCart, countVerified = CRWalmartCore.countVerified, disclosureText = CRWalmartCore.disclosureText, linksFor = CRWalmartCore.linksFor;
  function renderAlts(container, rows, alts, excludeIds) {
    var doc = root.document;
    alts = alts || root.CR_WALMART_ALTS;
    var list = alternativesFor(rows, alts, excludeIds);
    container.innerHTML = '';
    if (!list.length) { container.hidden = true; return; }
    container.hidden = false;
    var det = doc.createElement('details'); det.className = 'subs-box';
    var sum = doc.createElement('summary'); sum.textContent = 'Out of stock? Substitutes (' + list.length + ')'; det.appendChild(sum);
    var intro = doc.createElement('p'); intro.className = 'small';
    intro.textContent = 'If Walmart leaves something out of your cart or shows it as unavailable at your store, try one of these. We have not checked stock at your store.'; det.appendChild(intro);
    list.forEach(function (a) {
      var box = doc.createElement('div'); box.className = 'subs-item';
      var h = doc.createElement('h4'); h.textContent = a.label.charAt(0).toUpperCase() + a.label.slice(1) + (a.amount ? ' \u2014 ' + a.amount : ''); box.appendChild(h);
      var p1 = doc.createElement('p'); p1.className = 'small'; p1.textContent = a.why + ' ' + a.note; box.appendChild(p1);
      var ul = doc.createElement('ul');
      a.options.forEach(function (o) {
        var li = doc.createElement('li'), link = doc.createElement('a');
        link.href = o.url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = o.name; li.appendChild(link);
        var t = ' \u2014 ' + o.size + (o.qty ? '; you need about ' + o.qty : '') + (o.hint ? ' (' + o.hint + ')' : '');
        li.appendChild(doc.createTextNode(t)); ul.appendChild(li);
      });
      var ls = doc.createElement('li'), sl = doc.createElement('a'); sl.href = a.search_url; sl.target = '_blank'; sl.rel = 'noopener'; sl.textContent = 'Search Walmart for more options';
      ls.appendChild(sl); ul.appendChild(ls);
      box.appendChild(ul); det.appendChild(box);
    });
    container.appendChild(det);
  }

  /** The disclosure line shown beside the button. */
  /* ---------- browser wiring (called from app.js on the plan page) ----------
   * Click "Add to Walmart cart" -> a short checklist of the chosen items (qty, name, size, approximate price). Each row has a Swap dropdown (the
   * item's backups and other tier picks) and an "Out of stock for me" button. Only the button inside the checklist opens Walmart, using the items
   * as they stand then. Stock memory lives in localStorage only (see makeStockStore). */
  function cap1(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function optLabel(op) {
    var kind = op.kind === 'backup' ? 'backup' : (op.tier === 'base' ? 'standard pick' : cap1(op.tier) + ' pick');
    return op.name + (op.size && op.name.toLowerCase().indexOf(String(op.size).toLowerCase()) < 0 ? ' \u2014 ' + op.size : '') + (op.price ? ', about $' + op.price + '*' : '') + ' (' + kind + ')' + (op.out ? ' \u2014 marked out of stock' : '');
  }
  function wire(o) {
    var doc = root.document;
    var btn = o.button, note = o.note, disc = o.disclosure, box = o.check;
    var map = root.CR_WALMART_MAP;
    var stock = o.stock;
    var opened = {}, status = '', undo = null, open = false;
    disc.textContent = disclosureText();
    if (!countVerified(map)) btn.textContent = 'Add to Walmart cart (coming soon)';
    function show(lines, list) {
      note.hidden = false; note.innerHTML = '';
      lines.forEach(function (t) { var p = doc.createElement('p'); p.textContent = t; note.appendChild(p); });
      if (list && list.length) {
        var h = doc.createElement('p'); h.className = 'small'; h.textContent = 'Not added \u2014 pick these up yourself or search for them at Walmart:'; note.appendChild(h);
        var ul = doc.createElement('ul'); ul.className = 'unmapped';
        list.forEach(function (u) { var li = doc.createElement('li'); li.textContent = (u.label.charAt(0).toUpperCase() + u.label.slice(1)) + (u.amount ? ' \u2014 ' + u.amount : '') + (u.allOut ? ' (every option marked out of stock for you)' : ''); ul.appendChild(li); });
        note.appendChild(ul);
      }
    }
    function cfgNow() {
      return Object.assign({}, CONFIG, { tiers: root.CR_WALMART_TIERS, tier: o.getTier(), tierOverrides: o.getOverrides(),
        backups: root.CR_WALMART_BACKUPS, oos: stock.oos(), swaps: stock.swaps() });
    }
    function cartNow() { map = root.CR_WALMART_MAP; return buildCart(o.getRows(), map, cfgNow()); }
    function el(tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function changed() { render(); o.onStockChange(); }

    function markOut(item) {
      if (!stock.mark(item.id, item.name)) return;
      undo = { id: item.id, name: item.name };
      var after = cartNow(), nxt = null;
      after.items.forEach(function (it) { if (it.swappedFrom && String(it.swappedFrom.item_id) === String(item.id)) nxt = it; });
      var gone = item.ingredients.filter(function (g) { return after.allOut.indexOf(g) >= 0; });
      status = '\u201c' + item.name + '\u201d is marked out of stock for you.' + (nxt ? ' Switched to \u201c' + nxt.name + '\u201d.' : '') + (gone.length ? ' No in-stock options are left for ' + gone.join(', ') + '.' : '');
      o.track('walmart_oos', { id: item.id });
      changed();
      var again = box.querySelector('[data-ing="' + (nxt ? nxt.ingredients[0] : '') + '"] .wm-oos');
      if (again) { again.disabled = true; setTimeout(function () { again.disabled = false; }, 500); }
    }
    function renderRow(item) {
      var li = el('li', 'wm-row'); li.setAttribute('data-ing', item.ingredients[0]); li.setAttribute('data-id', item.id);
      var main = el('div', 'wm-main');
      main.appendChild(el('span', 'wm-qty', item.qty + '\u00d7'));
      var nm = el('span', 'wm-name', ' ' + item.name); main.appendChild(nm);
      main.appendChild(el('div', 'small wm-size', item.size + (item.price ? ', about $' + item.price + '*' : '') + (item.assumed ? ' \u2014 quantity is a best guess' : '')));
      if (item.swappedFrom) main.appendChild(el('div', 'wm-flag oos', 'Swapped because you marked it out of stock (was: ' + item.swappedFrom.product_name + ')'));
      else if (item.userSwap) main.appendChild(el('div', 'wm-flag', 'Swapped by you'));
      if (item.fallback) main.appendChild(el('div', 'small wm-fb', 'No verified ' + cap1(item.requested) + ' option; using ' + cap1(item.tier) + '.'));
      li.appendChild(main);
      var ctl = el('div', 'wm-ctl');
      var sel = el('select', 'wm-swap'); sel.setAttribute('aria-label', 'Swap ' + item.ingredients.join(', '));
      item.options.forEach(function (op) {
        var oe = el('option', '', optLabel(op)); oe.value = op.id; if (op.out) oe.disabled = true; if (op.id === item.id) oe.selected = true; sel.appendChild(oe);
      });
      if (sel.options.length < 2) { sel.disabled = true; sel.title = 'No other verified options for this item'; }
      sel.addEventListener('change', function () { stock.setSwap(item.ingredients, sel.value); status = ''; undo = null; o.track('walmart_swap', { item: item.ingredients[0], to: sel.value }); changed(); });
      var lab = el('label', 'wm-swaplab small', 'Swap: '); lab.appendChild(sel); ctl.appendChild(lab);
      var oosb = el('button', 'btn ghost small wm-oos', 'Out of stock for me'); oosb.type = 'button';
      oosb.addEventListener('click', function () { markOut(item); });
      ctl.appendChild(oosb); li.appendChild(ctl);
      return li;
    }
    function render() {
      var res = cartNow(); box.innerHTML = '';
      if (!open || (res.mode !== 'link' && !res.allOut.length)) { box.hidden = true; return; }
      box.hidden = false;
      box.appendChild(el('h3', 'wm-h', 'Check your Walmart items (' + res.items.length + ')'));
      var warn = el('p', 'wm-cartwarn', ''); warn.appendChild(el('strong', '', 'Empty your Walmart cart first. ')); warn.appendChild(doc.createTextNode('This link ADDS to whatever is already in your Walmart cart. Items left from earlier tries will pile up and inflate the total.')); box.appendChild(warn);
      box.appendChild(el('p', 'small', 'We can\u2019t see stock at your store. Swap an item if you prefer another, or press \u201cOut of stock for me\u201d and we\u2019ll switch to the next backup and remember that on this device. Prices are approximate (public search results, Oct 24, 2026).'));
      var live = el('p', 'wm-status', status); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.hidden = !status;
      if (undo) { var ub = el('button', 'btn ghost small wm-undo', 'Undo'); ub.type = 'button'; ub.addEventListener('click', function () { stock.unmark(undo.id); status = 'Back in stock: \u201c' + undo.name + '\u201d.'; undo = null; changed(); }); live.appendChild(doc.createTextNode(' ')); live.appendChild(ub); }
      box.appendChild(live);
      var ul = el('ul', 'wm-rows');
      res.items.forEach(function (it) { ul.appendChild(renderRow(it)); });
      res.unmapped.filter(function (u) { return u.allOut; }).forEach(function (u) {
        var li = el('li', 'wm-row wm-allout'); li.setAttribute('data-ing', u.ingredient);
        var m = el('div', 'wm-main'); m.appendChild(el('strong', '', cap1(u.label) + (u.amount ? ' \u2014 ' + u.amount : '') + ': '));
        m.appendChild(doc.createTextNode('no in-stock options, buy locally or '));
        var fa = el('a', 'wm-farm', 'try farm fresh'); fa.href = '#source-box';
        fa.addEventListener('click', function (e) { e.preventDefault(); o.goFarm(); });
        m.appendChild(fa); m.appendChild(doc.createTextNode('. '));
        m.appendChild(el('span', 'small', 'All verified options for this item are marked out of stock for you.'));
        li.appendChild(m); ul.appendChild(li);
      });
      box.appendChild(ul);
      var foot = el('div', 'wm-foot');
      var fresh = res.items.filter(function (it) { return !opened[it.id]; });
      var ob = el('button', 'btn dark wm-open', ''); ob.type = 'button'; ob.id = 'wm-open';
      var any = Object.keys(opened).length > 0;
      if (!res.items.length) { ob.textContent = 'Nothing to add'; ob.disabled = true; }
      else if (any && !fresh.length) { ob.textContent = 'Already opened: nothing new to add'; ob.disabled = true; }
      else if (any) ob.textContent = 'Add ' + fresh.length + ' changed item' + (fresh.length === 1 ? '' : 's') + ' to Walmart';
      else ob.textContent = 'Open Walmart cart (' + res.items.length + ' item' + (res.items.length === 1 ? '' : 's') + ')';
      ob.addEventListener('click', function () { openCart(); });
      foot.appendChild(ob);
      var cb = el('button', 'btn ghost small wm-close', 'Close'); cb.type = 'button'; cb.addEventListener('click', function () { open = false; opened = {}; status = ''; undo = null; render(); }); foot.appendChild(cb);
      box.appendChild(foot);
      if (any) box.appendChild(el('p', 'small', 'Items already sent to Walmart can\u2019t be removed from here. If one was out of stock, delete it in your Walmart cart; only changed items are added again.'));
      var list = stock.list();
      var det = el('details', 'wm-oos-list'); if (list.length) det.open = false;
      det.appendChild(el('summary', '', 'Marked out of stock on this device (' + list.length + ')'));
      if (!list.length) det.appendChild(el('p', 'small', 'Nothing yet. Items you mark are skipped on every list until you reset.'));
      var ul2 = el('ul', 'wm-oos-items');
      list.forEach(function (it) {
        var li = el('li', '', it.name || ('Walmart item ' + it.id) + ' ');
        var bk = el('button', 'btn ghost small wm-back', 'Back in stock'); bk.type = 'button'; bk.setAttribute('data-id', it.id);
        bk.addEventListener('click', function () { stock.unmark(it.id); status = ''; undo = null; changed(); });
        li.appendChild(doc.createTextNode(' ')); li.appendChild(bk); ul2.appendChild(li);
      });
      det.appendChild(ul2);
      var rb = el('button', 'btn ghost small wm-reset', 'Reset out-of-stock list'); rb.type = 'button'; rb.disabled = !list.length;
      rb.addEventListener('click', function () { stock.reset(); status = 'Out-of-stock list cleared.'; undo = null; o.track('walmart_oos_reset', {}); changed(); });
      det.appendChild(rb); box.appendChild(det);
    }
    function openCart() {
      var res = cartNow(), fresh = res.items.filter(function (it) { return !opened[it.id]; });
      var urls = linksFor(fresh, CONFIG), again = Object.keys(opened).length > 0;
      var tl = cap1(res.tier);
      var lines = [(again ? 'Adding ' : 'Opening Walmart with ') + fresh.length + ' item' + (fresh.length === 1 ? '' : 's') + (again ? ' to Walmart' : '') + ' added (' + fresh.map(function (i) { return i.qty + '\u00d7 ' + i.name; }).join('; ') + ').'];
      lines.push('Picks are from the ' + tl + ' tier unless you changed an ingredient. Prices shown on the list are approximate, from public search results on Oct 24, 2026, not live; Walmart\u2019s price at your store is what counts.');
      var fb = fresh.filter(function (i) { return i.fallback; });
      if (fb.length) lines.push('No ' + tl + ' option has been verified for ' + fb.map(function (i) { return i.ingredient; }).join(', ') + ', so the nearest tier was used.');
      var sw = fresh.filter(function (i) { return i.swappedFrom; });
      if (sw.length) lines.push('Swapped because you marked them out of stock: ' + sw.map(function (i) { return i.swappedFrom.product_name + ' \u2192 ' + i.name; }).join('; ') + '.');
      if (urls.length > 1) lines.push('Your list is long, so it is split across ' + urls.length + ' Walmart links. Allow pop-ups to open them all.');
      if (fresh.some(function (i) { return i.assumed; })) lines.push('A few quantities are best guesses (marked in the notes of the match table); double-check them in your cart.');
      if (res.alternatives.length) lines.push('If anything is missing from your Walmart cart (' + res.alternatives.map(function (a) { return a.label; }).join(', ') + '), see "Out of stock? Substitutes" below.');
      lines.push(CONFIG.previewNote);
      show(lines, res.unmapped);
      fresh.forEach(function (it) { opened[it.id] = it.qty; });
      urls.forEach(function (u) { try { root.open(u, '_blank', 'noopener'); } catch (e) {} });
      o.track('walmart_open', { items: fresh.length });
      render();
    }
    btn.addEventListener('click', function () {
      var rows = o.getRows();
      if (!rows.length) { o.toast('Pick a recipe first.'); return; }
      var res = cartNow();
      o.track('walmart_click', { mode: res.mode, items: res.items.length, unmapped: res.unmapped.length });
      if (res.mode === 'coming_soon') { open = false; render(); show(['Walmart cart link coming soon: we are still matching ingredients to Walmart items, so this button does not add anything yet.'], null); return; }
      if (res.mode === 'none_mapped' && !res.allOut.length) { open = false; render(); show(['None of the items on this list have a Walmart match yet.'], res.unmapped); return; }
      note.hidden = true; note.innerHTML = ''; opened = {}; status = ''; undo = null; open = true; render();
      box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    /* the list changed under the checklist (tier, source or plan): keep an open checklist in step, but never open one by itself */
    return { refresh: function () { if (open) render(); } };
  }

  var api = { renderAlts: renderAlts, wire: wire };
  root.CRWalmartUI = api;
})(window);

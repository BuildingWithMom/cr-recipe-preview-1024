/* Common Roots: the one flow (Pick, Days, Cart): shopping list, vendor groups, pantry, swaps, order records. */
(function () {
  'use strict';
  var track = window.CRState.track, store = window.CRState.store;
  var CRStateM = window.CRState;
  var L = CRStateM.L, RECIPES = CRStateM.RECIPES, WM = CRStateM.WM, byId = CRStateM.byId, factorOf = CRStateM.factorOf, flowState = CRStateM.flowState, getFactors = CRStateM.getFactors, getHave = CRStateM.getHave, getPlan = CRStateM.getPlan, getSource = CRStateM.getSource, getTier = CRStateM.getTier, getTierOver = CRStateM.getTierOver, inPlan = CRStateM.inPlan, page = CRStateM.page, selection = CRStateM.selection, servingsLabel = CRStateM.servingsLabel, setFactor = CRStateM.setFactor, setHave = CRStateM.setHave, setPlan = CRStateM.setPlan, setSource = CRStateM.setSource, setSub = CRStateM.setSub, setTier = CRStateM.setTier, setTierOver = CRStateM.setTierOver, swaps = CRStateM.swaps, togglePlan = CRStateM.togglePlan, updateBadge = CRStateM.updateBadge, visibleRows = CRStateM.visibleRows;
  var CRDomM = window.CRDom;
  var copyText = CRDomM.copyText, el = CRDomM.el, toast = CRDomM.toast;
  var CRMotionM = window.CRMotion;
  var flip = CRMotionM.flip;
  var CRSubPrefM = window.CRSubPref;
  var renderSubPref = CRSubPrefM.renderSubPref;
  function initPlan() {
    var picker = document.getElementById('plan-picker'), out = document.getElementById('list-out');
    var haveWrap = document.getElementById('have-wrap'), haveOut = document.getElementById('have-out');
    var listRoot = document.querySelector('.plan-list');
    var Wk = window.CRWeek, F = window.CRFlow, FS = flowState();
    track('view_plan');
    var OPTS = [[0.5, '\u00bd\u00d7'], [1, '1\u00d7'], [1.5, '1\u00bd\u00d7'], [2, '2\u00d7'], [3, '3\u00d7']];
    var shownBanner = {}, cartSeen = false;
    var curPlan = null, curCart = null, curBadges = [];

    /* ---------- one plan: the picks (cr.plan) and the week (cr.week) are kept as the same set of recipes ---------- */
    function todayStr() { return Wk.localDateStr(new Date()); }
    function weekLoad() { return Wk.load(window.localStorage, RECIPES); }
    function weekSave(st) { if (!st.start && Wk.plannedCount(st)) st.start = Wk.weekStart(st, todayStr()); Wk.save(window.localStorage, st); }
    function weekIds(st) { var ids = []; Wk.allItems(st).forEach(function (it) { if (ids.indexOf(it.id) < 0) ids.push(it.id); }); return ids; }
    function weekFactors(st) { var sel = Wk.shoppingSelection(st); return sel.factors; }
    /** Additive and idempotent: nothing the shopper saved is dropped. Picks missing from the week wait in its "waiting for a day" list; planned recipes join the picks. */
    function syncAdopt() {
      var st = weekLoad(), plan = getPlan(), inWeek = {}, ch = false, pch = false;
      weekIds(st).forEach(function (id) { inWeek[id] = true; });
      plan.forEach(function (id) { if (!inWeek[id] && byId[id]) { Wk.addItem(st, id, 'pool', factorOf(id)); ch = true; inWeek[id] = true; } });
      var fac = weekFactors(st), f = store.get('cr.factors', {}), fch = false;
      Object.keys(inWeek).forEach(function (id) { if (plan.indexOf(id) < 0) { plan.push(id); pch = true; } if (fac[id] && Math.abs((f[id] || 1) - fac[id]) > 1e-9) { f[id] = fac[id]; fch = true; } });
      if (ch) weekSave(st); if (pch) setPlan(plan); if (fch) store.set('cr.factors', f);
    }
    /** After the week changes (days, servings, removals): the picks become exactly the week's recipes, at the week's servings. */
    function syncFromWeek() {
      var st = weekLoad(), ids = weekIds(st), fac = weekFactors(st), f = store.get('cr.factors', {});
      ids.forEach(function (id) { f[id] = fac[id]; }); store.set('cr.factors', f); setPlan(ids);
    }
    function pickAdd(id) {
      var plan = getPlan(); plan.push(id); track('add_to_plan', { id: id }); setPlan(plan);   // only called for a recipe that is not picked yet
      var r = byId[id], hh = FS.household(), fs = store.get('cr.factors', {});
      if (hh && r.servings && !fs[id]) setFactor(id, Math.round(hh / r.servings * 1000) / 1000);
      var st = weekLoad(); Wk.addItem(st, id, 'pool', factorOf(id)); weekSave(st); window.dispatchEvent(new CustomEvent('cr-week-changed'));   // picks and week are the same set, so it is not in the week yet
    }
    function pickRemove(id) {
      var plan = getPlan(); plan.splice(plan.indexOf(id), 1); setPlan(plan);   // only called for a picked recipe
      var st = weekLoad(); for (var d = 0; d < 7; d++) Wk.removeItem(st, d, id); Wk.removeItem(st, 'pool', id); weekSave(st); window.dispatchEvent(new CustomEvent('cr-week-changed'));
    }
    function pickFactor(id, f) {
      setFactor(id, f);
      var st = weekLoad(), its = Wk.allItems(st).filter(function (it) { return it.id === id; }); its.forEach(function (it) { it.f = Math.round(f / its.length * 1000) / 1000; }); weekSave(st); window.dispatchEvent(new CustomEvent('cr-week-changed'));
    }

    /* ---------- Walmart tier + where-to-buy controls ---------- */
    var curRoute = null, walmartHomes = null;
    var TIERSD = function () { return window.CR_WALMART_TIERS; };
    function baseIx() { return WM().indexMap(window.CR_WALMART_MAP); }
    var stock = WM().makeStockStore(window.localStorage), walmartUI;
    function walmartCfg() { return Object.assign({}, WM().CONFIG, { tiers: TIERSD(), tier: getTier(), tierOverrides: getTierOver(), backups: window.CR_WALMART_BACKUPS, oos: stock.oos(), swaps: stock.swaps() }); }
    function walmartRowsNow() { return curRoute ? curRoute.walmartRows : currentText().rows; }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    function renderBuyBoxes() {
      var tb = document.getElementById('tier-box'), sb = document.getElementById('source-box');
      tb.innerHTML = ''; sb.innerHTML = '';
      var cur = getTier();
      tb.appendChild(el('div', { class: 'buy-h' }, [el('strong', { text: 'Walmart picks: ' }), el('span', { class: 'small', text: 'choose one tier for the whole list, or change a single ingredient below.' })]));
      var seg = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Walmart tier' });
      WM().TIER_DEFS.forEach(function (d) {
        var id = 'tier-' + d.id, inp = el('input', { type: 'radio', name: 'tier', id: id, value: d.id }); inp.checked = d.id === cur;
        inp.addEventListener('change', function () { setTier(d.id); stock.clearSwaps(); track('tier_change', { tier: d.id }); flipList(null, false); renderBuyBoxes(); });
        seg.appendChild(inp); seg.appendChild(el('label', { for: id, text: d.label }));
      });
      tb.appendChild(seg);
      var ul = el('ul', { class: 'tier-defs small' });
      WM().TIER_DEFS.forEach(function (d) { ul.appendChild(el('li', {}, [el('strong', { text: d.label + ': ' }), d.blurb])); });
      tb.appendChild(ul);
      tb.appendChild(el('p', { class: 'small tier-foot', text: 'Many pantry items use the same pick in every tier. Prices are approximate, from public search results on Oct 24, 2026 (the tortellini ones, Oct 25) \u2014 not live, and not specific to your store. A missing price means we did not see one, and the cart total says how many lines have one.' }));
      var s = getSource();
      sb.appendChild(el('div', { class: 'buy-h' }, [el('strong', { text: 'Where to buy: ' })]));
      var seg2 = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Where to buy' });
      [['walmart', 'Walmart only'], ['farm', 'Farm fresh where possible']].forEach(function (o) {
        var id = 'src-' + o[0], inp = el('input', { type: 'radio', name: 'src', id: id, value: o[0] }); inp.checked = o[0] === s;
        inp.addEventListener('change', function () { setSource(o[0]); track('source_change', { source: o[0] }); flipList(null, false); renderBuyBoxes(); });
        seg2.appendChild(inp); seg2.appendChild(el('label', { for: id, text: o[1] }));
      });
      sb.appendChild(seg2);
      if (s === 'farm') sb.appendChild(el('p', { class: 'small', text: 'Meat goes to Tyner Pond Farm. Eggs and produce go to Shrock Family Farm or Priest Family Farm (both sell through Market Wagon) when one of them lists the item. Everything else, and anything out of stock, stays at Walmart. Common Roots has no partnership with any of them; they are named as places to buy only.' }));
    }
    function placeWalmartControls(slot) {
      var ids = ['btn-walmart', 'walmart-clear-warning', 'walmart-disclosure', 'walmart-check', 'walmart-note'];
      if (!walmartHomes) { walmartHomes = ids.map(function (id) { var n = document.getElementById(id), c = document.createComment(id); n.parentNode.insertBefore(c, n); return { id: id, marker: c }; }); }
      walmartHomes.forEach(function (h) {
        var n = document.getElementById(h.id);
        if (slot) slot.appendChild(n); else if (n.parentNode !== h.marker.parentNode || n.previousSibling !== h.marker) h.marker.parentNode.insertBefore(n, h.marker.nextSibling);
      });
    }
    function goFarm() { setSource('farm'); track('source_change', { source: 'farm', from: 'oos' }); flipList(null, false); renderBuyBoxes(); document.getElementById('source-box').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    function priceText(e) { return e && e.price_usd ? ', about $' + e.price_usd + '*' : ''; }
    /* the "what we'd buy" line under a list row */
    function pickLine(r, main) {
      var W = WM(), F = window.CRFarm;
      var v = curRoute && curRoute.mode === 'farm' ? F.vendorOf(curRoute, r.item) : { vendor: 'walmart' };
      if (v.vendor === 'tyner') {
        main.appendChild(el('div', { class: 'lpick small' }, [el('span', { class: 'vtag tyner', text: 'Tyner Pond Farm' }), ' ' + v.line.qty + ' \u00d7 ' + v.line.title.split(' \u2013 ')[0] + (v.line.variant_title !== 'Default Title' ? ' (' + v.line.variant_title + ')' : '') + ', about $' + v.line.price + ' each (their list, Oct 24)']));
        return;
      }
      if (v.vendor === 'market') {
        main.appendChild(el('div', { class: 'lpick small' }, [el('span', { class: 'vtag market', text: v.line.farmName }), ' look for \u201c' + v.line.name + '\u201d on Market Wagon; no price shown (stock and prices change)']));
        return;
      }
      var tiers = TIERSD(), bx = baseIx(), tch = W.tierChoices(r.item, tiers, bx);
      var res = W.resolveStock(r.item, getTierOver()[r.item] || getTier(), tiers, bx, { backups: window.CR_WALMART_BACKUPS, oos: stock.oos(), swap: stock.swaps()[r.item] });
      if (res && res.allOut) {
        var fl = el('a', { href: '#source-box', class: 'wm-farm', text: 'try farm fresh' });
        fl.addEventListener('click', function (ev) { ev.preventDefault(); goFarm(); });
        main.appendChild(el('div', { class: 'lpick small none' }, ['Walmart: no in-stock options (all marked out of stock for you), buy locally or ', fl, '.'])); return;
      }
      if (!res) { main.appendChild(el('div', { class: 'lpick small none', text: 'Walmart: no verified item yet \u2014 shown in the manual list.' })); return; }
      var e = res.entry, kids = [el('span', { class: 'vtag walmart', text: 'Walmart' }), ' ' + e.product_name + ' \u2014 ' + e.package_size + priceText(e)];
      if (res.swappedFrom) kids.push(el('span', { class: 'fbk', text: ' (swapped because you marked it out of stock: ' + res.swappedFrom.product_name + ')' }));
      else if (res.userSwap) kids.push(el('span', { class: 'fbk', text: ' (swapped by you)' }));
      var tn = res.tier === 'base' ? '' : cap(res.tier);
      if (res.fallback) kids.push(el('span', { class: 'fbk', text: ' (no ' + cap(res.requested) + ' option verified; using ' + tn + ')' }));
      else if (tch.distinctCount <= 1 && tiers && tiers.items[r.item]) kids.push(el('span', { class: 'fbk', text: ' (same pick in every tier)' }));
      if (v.reason) kids.push(el('div', { class: 'fbk', text: v.reason }));
      var d = el('div', { class: 'lpick small' }, kids);
      if (tch.distinctCount > 1) {
        var ov = getTierOver()[r.item] || '';
        var sel = el('select', { class: 'tierpick', 'aria-label': 'Tier for ' + r.label }); 
        sel.appendChild(el('option', { value: '', text: 'Tier: plan (' + cap(getTier()) + ')' }));
        W.TIER_DEFS.forEach(function (td) { var o = el('option', { value: td.id, text: td.label }); if (ov === td.id) o.selected = true; sel.appendChild(o); });
        sel.addEventListener('change', function () { setTierOver(r.item, sel.value); stock.clearSwaps([r.item]); track('tier_override', { item: r.item, tier: sel.value || 'plan' }); flipList(null, false); });
        d.appendChild(document.createTextNode(' ')); d.appendChild(sel);
      }
      main.appendChild(d);
    }


    /* ---------- servings per dinner (household) ---------- */
    var HH = [0, 2, 3, 4, 5, 6, 8, 10];
    function renderHousehold() {
      var box = document.getElementById('household-box'); box.innerHTML = '';
      box.hidden = false;
      var sel = el('select', { id: 'household-sel', 'aria-label': 'Servings per dinner' }), cur = FS.household();
      HH.forEach(function (n) { var o = el('option', { value: String(n), text: n ? 'Serves ' + n : 'Recipes as written' }); if (n === cur) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', function () {
        var n = Number(sel.value); FS.setHousehold(n); track('household', { n: n });
        if (n) getPlan().forEach(function (id) { var r = byId[id]; if (r.servings) pickFactor(id, Math.round(n / r.servings * 1000) / 1000); });
        buildPicker(); renderList();
        toast(n ? 'Every recipe with a serving count now serves about ' + n + '. Change a single recipe in the list below.' : 'Recipes stay at their own servings.');
      });
      box.appendChild(el('label', { for: 'household-sel' }, [el('strong', { text: 'Servings per dinner: ' }), sel]));
      box.appendChild(el('span', { class: 'small', text: ' Sets each recipe to about that many servings, so a 24-bar dessert or a 12-sandwich recipe does not buy a whole batch. Saved on this device. Pick a different amount for any one recipe below.' }));
    }

    /* ---------- picker ---------- */
    function factorLabel(r, o, f) { return o + (r.servings ? ' (serves ' + L.fmtQty(r.servings * f).replace(/^0$/, '1') + ')' : ''); }
    function buildPicker() {
      picker.innerHTML = '';
      RECIPES.forEach(function (r) {
        var id = r.id, on = inPlan(id);
        var cb = el('input', { type: 'checkbox', id: 'pick-' + id, 'aria-label': 'Include ' + r.title }); cb.checked = on;
        cb.addEventListener('change', function () {
          if (cb.checked) pickAdd(id); else pickRemove(id);
          renderList(); buildRowState(); buildPicker();
        });
        var sel = el('select', { 'aria-label': 'Servings for ' + r.title });
        var f = factorOf(id), found = false;
        OPTS.forEach(function (o) {
          var op = el('option', { value: String(o[0]), text: factorLabel(r, o[1], o[0]) }); if (Math.abs(o[0] - f) < 0.001) { op.selected = true; found = true; } sel.appendChild(op);
        });
        if (!found) { var c = el('option', { value: String(f), text: factorLabel(r, L.fmtQty(f) + '\u00d7', f) }); c.selected = true; sel.appendChild(c); }
        sel.addEventListener('change', function () { pickFactor(id, Number(sel.value)); track('scale_change', { id: id, f: Number(sel.value) }); renderList(); buildRowState(); });
        var row = el('div', { class: 'pick-row' + (on ? ' on' : ''), 'data-id': id }, [
          el('label', { class: 'pick-main', for: 'pick-' + id }, [cb, el('span', { class: 'pick-text' }, [el('span', { class: 'pick-title', text: r.title }),
            el('span', { class: 'pick-serv', text: servingsLabel(r, f) })])]), sel]);
        picker.appendChild(row);
      });
    }
    function buildRowState() {
      picker.querySelectorAll('.pick-row').forEach(function (row) {
        var id = row.getAttribute('data-id'), r = byId[id];
        row.classList.toggle('on', inPlan(id));
        row.querySelector('.pick-serv').textContent = servingsLabel(r, factorOf(id));
        row.querySelector('input').checked = inPlan(id);
      });
    }

    /* ---------- the plan: vendors, delivery days, deadlines ---------- */
    var soloCache = null;
    function soloItems(id) {
      if (!soloCache) soloCache = {};
      if (!soloCache[id]) soloCache[id] = L.mergeSelection(RECIPES, [{ id: id, factor: 1 }], swaps()).map(function (r) { return r.item; });
      return soloCache[id];
    }
    function dinnerInfo() {
      var st = weekLoad(), t = todayStr(), dinners = {}, days = [];
      for (var i = 0; i < 7; i++) {
        var d = st.days[i], date = Wk.dayDate(st, i, t), items = [];
        d.items.forEach(function (it) { soloItems(it.id).forEach(function (item) { if (items.indexOf(item) < 0) items.push(item); (dinners[item] = dinners[item] || []).push(date); }); });
        days.push({ date: date, items: items });
      }
      return { dinners: dinners, days: days };
    }
    function shelfOf(item) { var e = window.CR_FRESH.items[item]; return e ? e.min : null; }
    function userOverrides() {
      var o = {}; var m = FS.src();
      Object.keys(m).forEach(function (k) { var v = FS.srcVendor(k); if (v === 'walmart' || v === 'tyner' || v === 'market') o[k] = v; });
      return o;
    }
    function plLine(item) { for (var i = 0; i < curPlan.lines.length; i++) if (curPlan.lines[i].item === item) return curPlan.lines[i]; return null; }
    var VNAME = { walmart: 'Walmart', tyner: 'Tyner Pond Farm', market: 'Market Wagon' };

    /* ---------- list rows ---------- */
    function markHave(r, on) {
      var h = getHave(); if (on) h[r.item] = true; else delete h[r.item]; setHave(h);
      if (on) { FS.setPantry(r.item, null); }
      else {
        var sv = FS.srcVendor(r.item); if (sv === 'elsewhere' || sv === 'have') FS.setSrc(r.item, null);
        if (FS.statusOf(r.item) === 'bought') FS.setStatus(r.item, null);
        if (FS.pantryDone() && r.staple) FS.setPantry(r.item, 'need'); else FS.setPantry(r.item, null);
      }
      track('pantry_toggle', { item: r.item, have: on });
    }
    function whereSelect(r) {
      var farm = window.CR_FARM, ty = farm.tyner, mw = farm.marketwagon;
      var cur = FS.srcVendor(r.item) || '', autoV = (plLine(r.item) || {}).vendor || 'walmart';
      var sel = el('select', { class: 'where', 'aria-label': 'Where to buy ' + r.label });
      function opt(v, t) { var o = el('option', { value: v, text: t }); if (v === cur) o.selected = true; sel.appendChild(o); }
      opt('', 'Where: automatic (' + VNAME[autoV] + ')');
      opt('walmart', 'Walmart');
      if ((ty.items && ty.items[r.item]) || (ty.extras && ty.extras[r.item])) opt('tyner', 'Tyner Pond Farm');
      if (mw.routes && mw.routes[r.item]) opt('market', 'Market Wagon');
      opt('elsewhere', 'Bought elsewhere');
      opt('have', 'I have it');
      sel.addEventListener('change', function () { FS.setSrc(r.item, sel.value || null); track('reroute', { item: r.item, to: sel.value || 'auto' }); flipList(null, false); });
      return sel;
    }
    function swapEditor(r) {
      var from = (r.swappedFrom && r.swappedFrom.length) ? r.swappedFrom[0] : r.item, def = FS.custom()[from] || null;
      if (r.swappedFrom && r.swappedFrom.length && !def) return null;           // a built-in swap (like the oil one) has its own Undo
      var det = el('details', { class: 'mswap' }), presets = F.presetsFor(from);
      det.appendChild(el('summary', { text: def ? 'Your change: ' + def.to + ' (edit)' : 'Change this ingredient' }));
      function build() {
      var to = el('input', { type: 'text', class: 'ms-to', maxlength: '60', 'aria-label': 'Use this instead of ' + from, placeholder: 'What you are using instead, e.g. ground chicken' });
      var note = el('input', { type: 'text', class: 'ms-note', maxlength: '300', 'aria-label': 'How the method changes', placeholder: 'How the method changes (optional)' });
      var tn = el('input', { type: 'text', class: 'ms-time', maxlength: '120', 'aria-label': 'Cooking-time note', placeholder: 'Cooking-time note, e.g. add 20 minutes (optional)' });
      if (def) { to.value = def.to; note.value = def.note || ''; tn.value = def.timeNote || ''; }
      var err = el('p', { class: 'small ms-err', role: 'alert', hidden: 'hidden' });
      var pick = el('span', { class: 'ms-presets' });
      presets.forEach(function (p) { pick.appendChild(el('button', { type: 'button', class: 'chip ms-preset', text: 'Use ' + p.to, onclick: function () { to.value = p.to; note.value = p.note || ''; if (p.basis) err.textContent = ''; } })); });
      var save = el('button', { type: 'button', class: 'btn small ms-save', text: 'Save change', onclick: function () {
        var name = to.value.trim().toLowerCase(), d = { to: name, note: note.value.trim(), timeNote: tn.value.trim(), aisle: r.aisle };
        var p = presets.filter(function (x) { return x.to === name; })[0]; if (p) { if (p.conv) d.conv = p.conv; if (p.match) d.match = p.match; if (p.textTo) d.textTo = p.textTo; }
        var msg = L.customCheck(from, d); if (msg) { err.textContent = msg; err.hidden = false; return; }
        FS.setCustom(from, d); L.setCustomSwaps(FS.custom()); setSub(from, 'custom:' + from); soloCache = null; track('manual_swap', { item: from, to: name });
        flipList(null, false); window.dispatchEvent(new CustomEvent('cr-week-changed'));
      } });
      var kids = [el('p', { class: 'small', text: 'Swap ' + from + ' for something you chose. The amount carries over one to one' + (presets.some(function (x) { return x.conv; }) ? ' (the rotisserie chicken preset converts it to raw breast)' : '') + '. It shows in your recipe, your list and your calendar card.' }), pick, to, note, tn, err, save];
      if (def) kids.push(el('button', { type: 'button', class: 'btn ghost small ms-remove', text: 'Remove change', onclick: function () {
        FS.setCustom(from, null); L.setCustomSwaps(FS.custom()); setSub(from, 'orig'); soloCache = null; track('manual_swap_remove', { item: from }); flipList(null, false); window.dispatchEvent(new CustomEvent('cr-week-changed'));
      } }));
      kids.forEach(function (k) { det.appendChild(k); });
      }
      det.addEventListener('toggle', function () { if (det.open && !det.getAttribute('data-built')) { det.setAttribute('data-built', '1'); build(); } });   // built on first open: keeps the list light
      return det;
    }
    function renderRow(r, section) {
      var gotSection = section === 'got', fk = 'row-' + r.key;
      var cb = el('input', { type: 'checkbox', 'aria-label': 'I already have ' + r.label });
      cb.checked = gotSection;
      cb.addEventListener('change', function () { var on = cb.checked; markHave(r, on); flipList(fk, on); });
      var sub = [(r.staple ? el('span', { class: 'pill', text: 'pantry staple' }) : ''), 'For: ' + r.recipes.join(', ')];
      var kids = [
        el('label', { class: 'lcheck' }, [cb, el('span', { class: 'ihave', text: 'I have it' })]),
        el('div', { class: 'lmain' }, [
          el('div', { class: 'ltop' }, [el('span', { class: 'lname', text: L.capital(r.label) }),
            el('span', { class: 'lamt', text: r.amount + (r.optionalAll ? ' (optional)' : '') })]),
          (r.breakdown ? el('div', { class: 'lbreak small', text: r.breakdown }) : ''),
          (r.note ? el('div', { class: 'lbreak small', text: r.note }) : ''),
          el('div', { class: 'lsub' }, sub)])];
      var main = kids[1];
      if (section === 'need') pickLine(r, main);
      if (r.swappedFrom && r.swappedFrom.length) {
        var o = L.subOption(r.swappedFrom[0], swaps()[r.swappedFrom[0]]);
        main.appendChild(el('div', { class: 'swapnote small' }, [
          'Swapped from ' + r.swappedFrom.join(' and ') + '. ' + (o && o.note ? o.note + ' ' : '') + (o && o.timeNote ? 'Time: ' + o.timeNote + '. ' : ''),
          el('button', { class: 'linkbtn', type: 'button', text: 'Undo swap', onclick: function () {
            r.swappedFrom.forEach(function (f) { setSub(f, 'orig'); }); track('swap', { undo: r.swappedFrom.join(',') }); flipList(null, false);
            window.dispatchEvent(new CustomEvent('cr-week-changed'));
          } })]));
      } else if (L.SUBS[r.item] && section !== 'got' && L.subOptions(r.item).some(function (op) { return !op.custom; })) {
        var sel = el('select', { class: 'swap', 'aria-label': 'Swap ' + r.label + ' (applies to every recipe)' });
        sel.appendChild(el('option', { value: 'orig', text: 'Swap\u2026' }));
        L.subOptions(r.item).filter(function (op) { return !op.custom; }).forEach(function (op) { sel.appendChild(el('option', { value: op.id, text: L.capital(op.name) })); });
        sel.addEventListener('change', function () { setSub(r.item, sel.value); track('swap', { item: r.item, to: sel.value }); flipList(null, false); window.dispatchEvent(new CustomEvent('cr-week-changed')); });
        main.appendChild(sel);
      }
      var pl = plLine(r.item);
      if (section === 'need' && pl) {
        var bits = [];
        if (pl.rerouted) bits.push(el('div', { class: 'lflow small reroute', text: 'Moved to Walmart: ' + pl.rerouted.reason }));
        if (pl.late) bits.push(el('div', { class: 'lflow small late', text: 'Too late: ' + pl.reason + (pl.suggestDay ? ' Moving the dinner to ' + Wk.fmtDate(pl.suggestDay) + ' or later would work.' : '') + ' You can also buy it in a store or pick another source below.' }));
        else if (pl.arrive) bits.push(el('div', { class: 'lflow small' }, [el('span', { class: 'dbadge ' + pl.vendor, text: VNAME[pl.vendor] }), ' arrives ' + Wk.fmtDate(pl.arrive) + ' \u00b7 order by ' + F.fmtOrderBy(pl.orderBy) + (pl.orderBy.assumed ? '*' : '') + ' \u00b7 for ' + Wk.fmtDate(pl.neededBy)]));
        else bits.push(el('div', { class: 'lflow small muted', text: 'No dinner day yet, so no order deadline. Put its recipe on a day in step 2.' }));
        if (pl.waitWarn) bits.push(el('div', { class: 'lflow small warn', text: pl.waitWarn }));
        bits.forEach(function (b) { main.appendChild(b); });
      }
      if (r.tag) main.appendChild(el('div', { class: 'lflow small warn' }, [el('span', { class: 'pill warn', text: r.tag === 'missing' ? 'Missing from your last order' : 'Out of stock at your last order' }), ' Pick another source below, or try another Walmart option.']));
      if (section === 'need' && curCart) {
        var ci = curCart.items.filter(function (i) { return i.ingredients.indexOf(r.item) >= 0; })[0], ln = ci ? F.leftoverNote(ci) : '';
        if (ln) main.appendChild(el('div', { class: 'lflow small leftover', text: ln }));
      }
      if (gotSection && r.gotWhy === 'bought') main.appendChild(el('div', { class: 'lflow small', text: 'Marked bought (you told us it arrived).' }));
      if (gotSection && r.gotWhy === 'elsewhere') {
        var w = el('input', { type: 'text', class: 'where-name', maxlength: '60', 'aria-label': 'Where you bought ' + r.label, placeholder: 'Where? (optional)', value: r.elsewhere || '' });
        w.addEventListener('change', function () { FS.setSrc(r.item, 'elsewhere', w.value); });
        main.appendChild(el('div', { class: 'lflow small' }, ['Bought elsewhere. ', w]));
      }
      if (section === 'ordered' && r.orderInfo) main.appendChild(el('div', { class: 'lflow small' }, ['Ordered from ' + (VNAME[r.orderInfo.vendor] || r.orderInfo.vendor) + (r.orderInfo.arrive ? ', due ' + Wk.fmtDate(r.orderInfo.arrive) : '') + '.']));
      main.appendChild(el('div', { class: 'lctl' }, [whereSelect(r)]));
      var ed = (section !== 'got' || r.gotWhy !== 'have') ? swapEditor(r) : null; if (ed) main.appendChild(ed);
      return el('li', { class: 'lrow' + (gotSection ? ' got' : '') + (section === 'ordered' ? ' ordered' : ''), 'data-flip': fk }, kids);
    }
    function flipList(key, have) { flip(listRoot, renderList, { key: key, have: have }); }

    /* ---------- pantry check ---------- */
    function stapleRows() {
      var all = L.mergeSelection(RECIPES, selection(), swaps()); return all.filter(function (r) { return r.staple; });
    }
    function renderPantry() {
      var box = document.getElementById('pantry-box'); box.innerHTML = '';
      var rows = stapleRows(); if (!rows.length) { box.hidden = true; return; }
      box.hidden = false; var done = FS.pantryDone(), pan = FS.pantry();
      var checks = [];
      var ul = el('ul', { class: 'pantry-list' });
      rows.forEach(function (r) {
        var on = pan[r.item] !== 'need';
        var cb = el('input', { type: 'checkbox', 'aria-label': 'I have ' + r.label, 'data-item': r.item }); cb.checked = on; checks.push(cb);
        if (done) cb.addEventListener('change', function () { FS.setPantry(r.item, cb.checked ? 'have' : 'need'); track('pantry_item', { item: r.item, have: cb.checked }); flipList(null, false); });
        ul.appendChild(el('li', {}, [el('label', {}, [cb, ' ' + L.capital(r.label) + ' ', el('span', { class: 'small', text: '(' + r.amount + ')' })])]));
      });
      if (!done) {
        box.appendChild(el('h3', { text: 'Pantry check' }));
        box.appendChild(el('p', { class: 'small', text: 'These ' + rows.length + ' staples are in your recipes. Ticked means you already have it and it stays off your list. Untick anything you need to buy, then press Done. Until then they all count as items to buy in the total.' }));
        box.appendChild(ul);
        box.appendChild(el('button', { type: 'button', class: 'btn', id: 'pantry-done', text: 'Done: update my list', onclick: function () {
          checks.forEach(function (cb) { FS.setPantry(cb.getAttribute('data-item'), cb.checked ? 'have' : 'need'); });
          FS.setPantryDone(true); track('pantry_done', { have: checks.filter(function (c) { return c.checked; }).length, need: checks.filter(function (c) { return !c.checked; }).length }); flipList(null, false);
        } }));
      } else {
        var needN = rows.filter(function (r) { return pan[r.item] === 'need'; }).length;
        var det = el('details', { class: 'pantry-done' });
        det.appendChild(el('summary', { text: 'Pantry check done: ' + (rows.length - needN) + ' staples on hand, ' + needN + ' to buy (edit)' }));
        det.appendChild(ul);
        det.appendChild(el('button', { type: 'button', class: 'btn ghost small', id: 'pantry-redo', text: 'Start the pantry check again', onclick: function () { FS.setPantryDone(false); flipList(null, false); } }));
        box.appendChild(det);
      }
    }

    /* ---------- cart total: honest about what is priced ---------- */
    function renderTotal(vr) {
      var box = document.getElementById('total-box'); box.innerHTML = '';
      if (!curCart || !vr.need.length) { box.hidden = true; return; }
      box.hidden = false;
      var lines = [];
      curCart.items.forEach(function (i) { lines.push({ price: i.price, qty: i.qty }); });
      curCart.unmapped.forEach(function () { lines.push({ price: null }); });
      curRoute.tyner.lines.forEach(function (l) { lines.push({ price: l.price, qty: l.qty }); });
      curRoute.market.lines.forEach(function () { lines.push({ price: null }); });
      var s = F.priceStats(lines);
      box.appendChild(el('p', { class: 'total-line' }, [el('strong', { text: s.priced ? 'About $' + s.total.toFixed(2) : 'No total yet' }), ' \u00b7 ' + s.priced + ' of ' + s.lines + ' items priced']));
      var extra = [];
      if (s.unpriced) extra.push(s.unpriced + ' item' + (s.unpriced === 1 ? '' : 's') + ' ' + (s.unpriced === 1 ? 'has' : 'have') + ' no price here (Market Wagon lines and anything we could not match), so the real total is higher.');
      var sr = stapleRows(); if (sr.length && !FS.pantryDone()) extra.push('This counts all ' + sr.length + ' pantry staples. Finish the Pantry check to leave out what you already have.');
      extra.push('Prices are approximate, not live, and not for your store. Your cart at Walmart shows the real number.');
      box.appendChild(el('p', { class: 'small', text: extra.join(' ') }));
    }

    /* ---------- order groups: when to order, and "I placed this order" ---------- */
    var placingKey = null, landedId = null;
    function groupUrl(g) { return window.CRVendorRegistry.registry.get(g.vendor).groupUrl(g, { route: curRoute, farm: window.CR_FARM }); }
    function renderGroups() {
      var root = document.getElementById('order-groups'); root.innerHTML = '';
      var os = FS.orders(), open = Object.keys(os).map(function (k) { return os[k]; }).filter(function (o) { return !o.received; });
      var groups = curPlan ? curPlan.groups : [], now = F.nowOf();
      if (!groups.length && !open.length) { root.hidden = true; return; }
      root.hidden = false;
      root.appendChild(el('h3', { text: 'When to order' }));
      var late = curPlan ? curPlan.late : [];
      if (late.length) root.appendChild(el('p', { class: 'ogroup-late small', role: 'status', text: late.length + ' item' + (late.length === 1 ? ' is' : 's are') + ' too late to arrive by the dinner you put it on. They are marked below with the first day that would work.' }));
      groups.forEach(function (g) {
        var isShop = curPlan.shopOn && curPlan.shopOn.groupKey === g.key;
        var card = el('div', { class: 'ogroup ' + g.vendor + (isShop ? ' first' : ''), 'data-group': g.key }, []);
        card.appendChild(el('div', { class: 'ogroup-h' }, [el('span', { class: 'dbadge ' + g.vendor, text: g.name }),
          el('strong', { text: ' arrives ' + Wk.fmtDate(g.arrive) }), el('span', { class: 'small', text: ' \u00b7 order by ' + F.fmtOrderBy(g.orderBy) + (g.assumed ? '*' : '') })]));
        card.appendChild(el('div', { class: 'small', text: g.lines.length + ' item' + (g.lines.length === 1 ? '' : 's') + ': ' + g.lines.map(function (l) { return l.label; }).slice(0, 8).join(', ') + (g.lines.length > 8 ? ', and ' + (g.lines.length - 8) + ' more' : '') }));
        var spec = F.specFor(g.vendor, FS.cfg());
        if (g.assumed) card.appendChild(el('div', { class: 'small assumed', text: '* ' + spec.buffer.text }));
        else card.appendChild(el('div', { class: 'small assumed', text: (FS.cfg()[g.vendor] && FS.cfg()[g.vendor].cutoff) ? 'From your delivery settings.' : 'Their own cutoff, from their site. Confirm at checkout.' }));
        if (spec.minNote && g.vendor !== 'walmart') card.appendChild(el('div', { class: 'small assumed', text: spec.minNote }));
        var acts = el('div', { class: 'ogroup-acts' }, []);
        var url = groupUrl(g);
        if (g.vendor === 'walmart') acts.appendChild(el('button', { type: 'button', class: 'btn small', text: 'Open Walmart link', onclick: function () { document.getElementById('btn-walmart').click(); } }));
        else if (url) acts.appendChild(el('a', { class: 'btn small', href: url, target: '_blank', rel: 'noopener', text: 'Open Tyner cart' }));
        else acts.appendChild(el('button', { type: 'button', class: 'btn small', text: 'Open the Market Wagon checklist', onclick: function () { document.querySelector('#source-cards [data-card]').scrollIntoView({ behavior: 'smooth', block: 'start' }); } }));
        acts.appendChild(el('button', { type: 'button', class: 'btn ghost small placed-btn', text: 'I placed this order', onclick: function () { placingKey = placingKey === g.key ? null : g.key; renderGroups(); } }));
        card.appendChild(acts);
        if (placingKey === g.key) {
          var panel = el('div', { class: 'placing' }, [el('p', { class: 'small', text: 'Tick anything that was out of stock or not added. Those stay on your list as out of stock.' })]);
          var oosCbs = [];
          g.lines.forEach(function (l) {
            var c = el('input', { type: 'checkbox', 'aria-label': l.label + ' was out of stock' });
            oosCbs.push([c, l.item]); panel.appendChild(el('label', { class: 'small plabel' }, [c, ' ' + l.label + ' not available']));
          });
          panel.appendChild(el('button', { type: 'button', class: 'btn small confirm-placed', text: 'Yes, I placed it', onclick: function () {
            var miss = oosCbs.filter(function (x) { return x[0].checked; }).map(function (x) { return x[1]; });
            FS.placeOrder({ vendor: g.vendor, arrive: g.arrive, lines: g.lines }, miss); placingKey = null; track('order_placed', { vendor: g.vendor, lines: g.lines.length, oos: miss.length }); flipList(null, false);
          } }));
          card.appendChild(panel);
        }
        root.appendChild(card);
      });
      open.forEach(function (o) {
        var due = o.arrive && o.arrive <= now.date;
        var card = el('div', { class: 'ogroup placed ' + o.vendor + (due ? ' due' : ''), 'data-order': o.id }, []);
        card.appendChild(el('div', { class: 'ogroup-h' }, [el('span', { class: 'dbadge ' + o.vendor, text: VNAME[o.vendor] || o.vendor }),
          el('strong', { text: ' ordered' + (o.arrive ? ', due ' + Wk.fmtDate(o.arrive) : '') }), el('span', { class: 'small', text: ' \u00b7 ' + o.items.length + ' item' + (o.items.length === 1 ? '' : 's') })]));
        if (due) card.appendChild(el('p', { class: 'small due-msg', role: 'status', text: 'This order was due ' + (o.arrive === now.date ? 'today' : Wk.fmtDate(o.arrive)) + '. We cannot see your orders, so tell us: did it arrive?' }));
        var acts = el('div', { class: 'ogroup-acts' }, [
          el('button', { type: 'button', class: 'btn small landed-btn', text: 'It arrived: check it off', onclick: function () { landedId = landedId === o.id ? null : o.id; renderGroups(); } }),
          el('button', { type: 'button', class: 'btn ghost small', text: 'Cancel this order record', onclick: function () { FS.cancelOrder(o.id); track('order_cancel', { vendor: o.vendor }); flipList(null, false); } })]);
        card.appendChild(acts);
        if (landedId === o.id) {
          var p2 = el('div', { class: 'placing' }, [el('p', { class: 'small', text: 'Tick what actually arrived. Anything unticked goes back on your list as missing.' })]), gcb = [];
          o.items.forEach(function (it, i) { var c = el('input', { type: 'checkbox', 'aria-label': (o.labels[i] || it) + ' arrived' }); c.checked = true; gcb.push([c, it]); p2.appendChild(el('label', { class: 'small plabel' }, [c, ' ' + (o.labels[i] || it)])); });
          p2.appendChild(el('button', { type: 'button', class: 'btn small confirm-landed', text: 'Save', onclick: function () {
            var got = gcb.filter(function (x) { return x[0].checked; }).map(function (x) { return x[1]; });
            FS.receiveOrder(o.id, got); landedId = null; track('order_received', { vendor: o.vendor, got: got.length, of: o.items.length }); flipList(null, false);
          } }));
          card.appendChild(p2);
        }
        root.appendChild(card);
      });
    }

    /* ---------- "Shop on ..." banner + step bar ---------- */
    function renderBanner(vr) {
      var b = document.getElementById('shop-banner');
      var open = Object.keys(FS.orders()).map(function (k) { return FS.orders()[k]; }).filter(function (o) { return !o.received; });
      var due = F.dueArrivals(FS.orders(), F.nowOf());
      var msg = '', cls = 'shop-banner', bs = '';
      if (due.length) { msg = 'An order should have arrived (' + VNAME[due[0].vendor] + ', due ' + Wk.fmtDate(due[0].arrive) + '). Tell us what landed in the cart below.'; cls += ' due'; bs = 'arrival_due'; }
      else if (curPlan && curPlan.shopOn) {
        var s = curPlan.shopOn, g = curPlan.groups[0];
        msg = (s.today ? 'Order today: ' : 'Shop on ' + Wk.fmtDate(s.date) + ': ') + g.name + ' by ' + F.fmtOrderBy(s.orderBy) + (s.orderBy.assumed ? '*' : '') + ', for delivery ' + Wk.fmtDate(g.arrive) + '. The longest lead time sets this day.';
        if (s.today) cls += ' today';
        bs = s.today ? 'shop_today' : 'shop_later';
      } else if (curPlan && curPlan.late.length) { msg = 'Some items cannot arrive in time for the day they are on. See the cart below.'; cls += ' late'; bs = 'late'; }
      else if (curPlan && curPlan.undated.length && vr.need.length) { msg = 'Put your recipes on days to see when to order.'; bs = 'undated'; }
      else if (open.length) { bs = 'waiting'; msg = 'Orders placed. Waiting on ' + open.map(function (o) { return VNAME[o.vendor] + (o.arrive ? ' (' + Wk.fmtDate(o.arrive) + ')' : ''); }).join(' and ') + '.'; }
      if (!msg) { b.hidden = true; return; }
      if (!shownBanner[bs]) { shownBanner[bs] = true; track('order_by_banner_shown', { state: bs }); }
      b.hidden = false; b.className = cls; b.textContent = msg;
    }
    function renderStepBar(vr) {
      var n = getPlan().length, st = weekLoad();
      function set(id, t) { document.getElementById(id).textContent = t; }
      set('sb-pick', n ? n + ' picked' : 'none yet');
      var onDay = 0; st.days.forEach(function (d) { onDay += d.items.length; }); set('sb-days', n ? onDay + ' of ' + n + ' on a day' : '');
      set('sb-cart', vr.need.length + ' to buy');
    }

    /* ---------- delivery settings ---------- */
    function renderSettings() {
      var box = document.getElementById('deliv-box'); box.innerHTML = '';
      var cfg = FS.cfg(), DN = Wk.DAYS, ctrls = {};
      box.appendChild(el('p', { class: 'small', text: 'Tell us your real delivery days and order cutoffs. Defaults: Tyner Pond Tuesday and Thursday (from you), Market Wagon Thursday. Where a cutoff is unknown we use a labeled planning allowance and mark it with *.' }));
      ['tyner', 'market', 'walmart'].forEach(function (v) {
        var spec = F.specFor(v, cfg), fs = el('fieldset', { class: 'deliv-v ' + v }, [el('legend', { text: spec.name })]);
        if (v !== 'walmart') {
          var days = el('div', { class: 'deliv-days', role: 'group', 'aria-label': spec.short + ' delivery days' }), dcb = [];
          for (var i = 0; i < 7; i++) {
            (function (i) { var c = el('input', { type: 'checkbox', 'aria-label': DN[i] }); c.checked = spec.arriveDays.indexOf(i) >= 0; dcb.push([c, i]); days.appendChild(el('label', { class: 'small' }, [c, ' ' + DN[i].slice(0, 3) + ' '])); })(i);
          }
          fs.appendChild(days); ctrls[v] = { days: dcb };
        }
        var ck = spec.cutoff || spec.buffer, dsel = el('select', { 'aria-label': spec.short + ' days before delivery' }), tin = el('input', { type: 'time', 'aria-label': spec.short + ' cutoff time', value: ck.time });
        for (var d = 0; d <= 4; d++) { var o = el('option', { value: String(d), text: d === 0 ? 'same day' : d + ' day' + (d > 1 ? 's' : '') + ' before' }); if (d === ck.daysBefore) o.selected = true; dsel.appendChild(o); }
        fs.appendChild(el('label', { class: 'small' }, [spec.cutoffKnown ? 'Order cutoff: ' : 'Order by (planning allowance): ', dsel, ' at ', tin]));
        fs.appendChild(el('div', { class: 'small', text: spec.confidenceNote }));
        ctrls[v] = Object.assign(ctrls[v] || {}, { dsel: dsel, tin: tin }); box.appendChild(fs);
      });
      var msg = el('p', { class: 'small', role: 'status' });
      box.appendChild(el('button', { type: 'button', class: 'btn small', id: 'deliv-save', text: 'Save delivery settings', onclick: function () {
        var c = {}; ['tyner', 'market', 'walmart'].forEach(function (v) {
          var x = ctrls[v], o = {}; if (x.days) { o.days = x.days.filter(function (p) { return p[0].checked; }).map(function (p) { return p[1]; }); }
          o.cutoff = { daysBefore: Number(x.dsel.value), time: x.tin.value || '23:59' };
          if (v === 'walmart') { c.walmart = { cutoff: o.cutoff }; } else c[v] = o;
        });
        FS.setCfg(c); track('deliv_settings'); msg.textContent = 'Saved.'; flipList(null, false); window.dispatchEvent(new CustomEvent('cr-week-changed'));
      } }));
      box.appendChild(el('button', { type: 'button', class: 'btn ghost small', id: 'deliv-reset', text: 'Back to defaults', onclick: function () { FS.setCfg({}); flipList(null, false); renderSettings(); window.dispatchEvent(new CustomEvent('cr-week-changed')); } }));
      box.appendChild(msg);
    }

    /* ---------- the list ---------- */
    function renderList() {
      soloCache = null;
      var sel = selection(); out.innerHTML = '';
      if (!sel.length) {
        out.appendChild(el('p', { class: 'empty', text: 'No recipes picked yet. Tick a few above (or add them from the recipe pages).' })); haveWrap.hidden = true;
        document.getElementById('ordered-wrap').hidden = true; var sw0 = document.getElementById('walmart-subs'); sw0.innerHTML = ''; sw0.hidden = true;
        curRoute = null; curPlan = null; curCart = null; curBadges = []; placeWalmartControls(null);
        var sc0 = document.getElementById('source-cards'); sc0.innerHTML = ''; sc0.hidden = true;
        renderPantry(); renderTotal({ need: [] }); renderGroups(); renderBanner({ need: [] }); renderStepBar({ need: [] }); updateBadge(); publish(); return;
      }
      var vr = visibleRows(sel);
      var uo = userOverrides(), CF = window.CRFarm;
      var route1 = CF.route(vr.need, { mode: getSource(), overrides: uo });
      var info = dinnerInfo();
      curPlan = F.plan({ rows: vr.need, vendorOf: function (item) { return CF.vendorOf(route1, item).vendor; }, forced: function (item) { return !!uo[item]; },
        dinners: info.dinners, shelf: shelfOf, cfg: FS.cfg(), now: F.nowOf() });
      var ov2 = Object.assign({}, uo, curPlan.autoReroutes);
      curRoute = CF.route(vr.need, { mode: getSource(), overrides: ov2 });
      curBadges = F.dayBadges(curPlan, info.days);
      var wrows = walmartRowsNow();
      curCart = WM().buildCart(wrows, window.CR_WALMART_MAP, walmartCfg());
      out.appendChild(el('p', { class: 'count', text: vr.need.length + ' items to buy from ' + sel.length + ' recipe' + (sel.length > 1 ? 's' : '') }));
      L.AISLES.forEach(function (a) {
        var rs = vr.need.filter(function (r) { return r.aisle === a; }); if (!rs.length) return;
        var ul = el('ul', { class: 'lrows' }); rs.forEach(function (r) { ul.appendChild(renderRow(r, 'need')); });
        out.appendChild(el('h3', { class: 'aisle', 'data-flip': 'aisle-' + a, text: a })); out.appendChild(ul);
      });
      var ow = document.getElementById('ordered-wrap'), oo = document.getElementById('ordered-out');
      oo.innerHTML = ''; var ul3 = el('ul', { class: 'lrows' }); vr.ordered.forEach(function (r) { ul3.appendChild(renderRow(r, 'ordered')); }); oo.appendChild(ul3); document.getElementById('ordered-count').textContent = vr.ordered.length; ow.hidden = vr.ordered.length === 0;
      haveOut.innerHTML = ''; var ul2 = el('ul', { class: 'lrows' }); vr.got.forEach(function (r) { ul2.appendChild(renderRow(r, 'got')); });
      haveOut.appendChild(ul2); document.getElementById('have-count').textContent = vr.got.length; haveWrap.hidden = vr.got.length === 0;
      updateBadge();
      placeWalmartControls(null);   // put the Walmart controls back before the cards (which may hold them) are rebuilt
      var slot = window.CRFarm.renderCards(document.getElementById('source-cards'), curRoute, {});
      placeWalmartControls(slot);
      document.getElementById('btn-walmart').textContent = curRoute.mode === 'farm' ? 'Add Walmart items to cart (' + wrows.filter(function (r) { return r.item !== 'water'; }).length + ')' : 'Add to Walmart cart';
      walmartUI.refresh();
      window.CRWalmart.renderAlts(document.getElementById('walmart-subs'), wrows, null, curCart.items.map(function (i) { return i.id; }));
      renderPantry(); renderTotal(vr); renderGroups(); renderBanner(vr); renderStepBar(vr); publish();
    }
    function publish() {
      window.CR = window.CR || {};
      window.CR.flow = { badges: function () { return curBadges; }, plan: function () { return curPlan; }, refresh: function () { renderList(); buildRowState(); }, groups: function () { return curPlan ? curPlan.groups : []; },
        placed: function () { var o = FS.orders(); return Object.keys(o).map(function (k) { return o[k]; }).filter(function (x) { return !x.received; }); }, syncFromWeek: syncFromWeek, shopOn: function () { return curPlan ? curPlan.shopOn : null; } };
      window.dispatchEvent(new CustomEvent('cr-flow-updated'));
    }
    function currentText() {
      var sel = selection(); var vr = visibleRows(sel);
      return { rows: vr.need, titles: sel.map(function (s) { return byId[s.id].title; }) };
    }
    document.getElementById('btn-copy').addEventListener('click', function () {
      var c = currentText(); if (!c.rows.length) { toast('Pick a recipe first.'); return; }
      copyText(L.listToText(c.rows, c.titles)).then(function (ok) { track('copy_list', { scope: 'plan', items: c.rows.length }); toast(ok ? 'List copied.' : 'Could not copy automatically.'); });
    });
    walmartUI = window.CRWalmart.wire({ button: document.getElementById('btn-walmart'), note: document.getElementById('walmart-note'), check: document.getElementById('walmart-check'),
        disclosure: document.getElementById('walmart-disclosure'), getRows: function () { return walmartRowsNow(); }, getTier: getTier, getOverrides: getTierOver, track: track, toast: toast,
        stock: stock, goFarm: goFarm, onStockChange: function () { flipList(null, false); } });
    document.getElementById('btn-staples').addEventListener('click', function () {
      var h = getHave(), sw = swaps(); RECIPES.forEach(function (r) { r.ingredients.forEach(function (i) { L.effectiveEntries(i, sw).forEach(function (e) { if (e.staple) h[e.item] = true; }); }); });
      setHave(h); track('pantry_staples_all'); flipList(null, false);
    });
    function toastUndo(msg, fn) {
      var t = document.getElementById('toast'); t.textContent = msg + ' ';
      t.appendChild(el('button', { type: 'button', class: 'linkbtn', id: 'toast-undo', text: 'Undo', onclick: function () { fn(); t.hidden = true; } })); t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 8000);
    }
    document.getElementById('btn-clear').addEventListener('click', function () {
      var snap = { plan: getPlan(), factors: getFactors(), week: window.localStorage.getItem('cr.week') };
      setPlan([]);
      var st = weekLoad(); Wk.clearWeek(st); weekSave(st); window.dispatchEvent(new CustomEvent('cr-week-changed'));
      buildPicker(); renderList(); track('clear_plan');
      if (snap.plan.length) toastUndo('Plan cleared.', function () {
        store.set('cr.factors', snap.factors); setPlan(snap.plan); if (snap.week != null) window.localStorage.setItem('cr.week', snap.week); else window.localStorage.removeItem('cr.week');
        window.dispatchEvent(new CustomEvent('cr-week-changed')); buildPicker(); renderList();
      });
    });
    /* the planner changed the week (days, servings, removals): follow it */
    window.addEventListener('cr-week-saved', function () { syncFromWeek(); soloCache = null; buildPicker(); renderList(); });
    window.addEventListener('storage', function (e) { if (e.key === 'cr.week' || e.key === 'cr.plan') { buildPicker(); renderList(); } });
    syncAdopt(); renderHousehold(); renderSettings();
    buildPicker(); renderBuyBoxes(); renderList(); renderSubPref(function () { flipList(null, false); });
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (!e.isIntersecting) return; if (e.target.id === 'cart' && !cartSeen) { cartSeen = true; track('cart_opened', { recipes: getPlan().length }); } document.getElementById('stepbar').querySelectorAll('.step').forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id); }); }); }, { rootMargin: '-35% 0px -55% 0px' });
    ['pick', 'days', 'cart'].forEach(function (id) { io.observe(document.getElementById(id)); });
    if (page === 'plan' && !location.hash) setTimeout(function () { document.getElementById('cart').scrollIntoView(); }, 0);
  }

  window.CRPagePlan = { initPlan: initPlan };
})();

/* Common Roots: browser behaviour. No backend. Everything stored in localStorage on this device. */
(function () {
  'use strict';
  var L = window.CRLib, RECIPES = window.CR_RECIPES || [];
  var byId = {}; RECIPES.forEach(function (r) { byId[r.id] = r; });

  /* manual swaps the shopper defined (saved on this device): register them before anything reads the swap table */
  try { L.setCustomSwaps(JSON.parse(window.localStorage.getItem('cr.customSwaps') || '{}')); } catch (e) {}

  /* ---------- analytics hook (single place) ---------- */
  function analyticsHook(name, props) {
    // TODO: forward to a real analytics tool (Plausible, GA4, etc.) before launch. Preview: no-op.
  }
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  function track(name, props) {
    var ev = store.get('cr.events', {}); ev[name] = (ev[name] || 0) + 1; store.set('cr.events', ev);
    try { console.debug('[track]', name, props || {}); } catch (e) {}
    analyticsHook(name, props || {});
  }

  /* ---------- state ---------- */
  function getPlan() { return store.get('cr.plan', []); }
  function setPlan(p) { store.set('cr.plan', p); updateBadge(); }
  function getFactors() { return store.get('cr.factors', {}); }
  function factorOf(id) { return getFactors()[id] || 1; }
  function setFactor(id, f) { var m = getFactors(); m[id] = f; store.set('cr.factors', m); }
  /* substitutions: choices are per item and apply to every recipe, the plan and the shopping list */
  var DEFAULT_AUTO_SWAP = false;   // default state of "Never use vegetable oil: swap automatically"
  function getSubs() { return store.get('cr.subs', {}); }
  function setSub(item, v) { var m = getSubs(); m[item] = v; store.set('cr.subs', m); }
  function getAuto() { return store.get('cr.autoswap', DEFAULT_AUTO_SWAP) === true; }
  function setAuto(on) {
    store.set('cr.autoswap', !!on);
    var m = getSubs(); Object.keys(L.SUBS).forEach(function (k) { if (L.SUBS[k].avoid) delete m[k]; }); store.set('cr.subs', m);
  }
  function swaps() { return L.effectiveSwaps(getSubs(), getAuto()); }
  /* Walmart tiers + where to buy (all stored on this device only) */
  function WM() { return window.CRWalmart || null; }
  function getTier() { var t = store.get('cr.tier', 'budget'); return WM() && WM().isTier(t) ? t : 'budget'; }
  function setTier(t) { store.set('cr.tier', t); }
  function getTierOver() { return store.get('cr.tierOver', {}); }
  function setTierOver(item, t) { var m = getTierOver(); if (t) m[item] = t; else delete m[item]; store.set('cr.tierOver', m); }
  function getSource() { return store.get('cr.source', 'walmart') === 'farm' ? 'farm' : 'walmart'; }
  function setSource(s) { store.set('cr.source', s === 'farm' ? 'farm' : 'walmart'); }
  function getHave() { return store.get('cr.have', {}); }
  function setHave(h) { store.set('cr.have', h); }
  function inPlan(id) { return getPlan().indexOf(id) >= 0; }
  function togglePlan(id) {
    var p = getPlan(), i = p.indexOf(id);
    if (i >= 0) p.splice(i, 1); else { p.push(id); track('add_to_plan', { id: id }); }
    setPlan(p);
  }
  function updateBadge() {
    var b = document.getElementById('plan-count'); if (!b) return;
    var n = getPlan().length; b.textContent = n; b.hidden = n === 0;
  }

  /* ---------- helpers ---------- */
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function toast(msg) {
    var t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg; t.hidden = false; clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 3500);
  }
  function copyText(text) {
    return new Promise(function (resolve) {
      function fallback() {
        try {
          var ta = el('textarea', { 'aria-hidden': 'true' }); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); document.body.removeChild(ta); resolve(ok);
        } catch (e) { resolve(false); }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { resolve(true); }, fallback);
      else fallback();
    });
  }
  function servingsLabel(r, f) {
    if (r.servings) return 'Serves ' + L.fmtQty(r.servings * f).replace(/^0$/, '1');
    return 'Makes ' + r.yield + ' servings' + (f !== 1 ? ' \u00d7 ' + L.fmtQty(f) : '');
  }
  function selection() { return getPlan().map(function (id) { return { id: id, factor: factorOf(id) }; }); }
  /* flow state (order records, line statuses, pantry answers): only on pages that load js/flow.js */
  var _FS = null;
  function flowState() { if (_FS === null) _FS = window.CRFlow ? window.CRFlow.makeState(window.localStorage) : false; return _FS || null; }
  /** Manual swaps that are switched on right now: { 'ground turkey': { to, note, timeNote } }. The calendar card shows them. */
  function manualChanges() {
    var def = L.customSwapsDef(), sw = swaps(), out = {};
    Object.keys(def).forEach(function (item) { if (sw[item] === def[item].id) out[item] = { to: def[item].name, note: def[item].note || '', timeNote: def[item].timeNote || '' }; });
    return out;
  }
  /** Split the merged rows into: still to buy (need), ordered and waiting (ordered), and nothing to buy (got: have it / bought / bought elsewhere). */
  function visibleRows(sel) {
    var have = getHave(), rows = L.mergeSelection(RECIPES, sel, swaps()), FS = flowState();
    var pan = FS ? FS.pantry() : {}, done = FS ? FS.pantryDone() : false;
    var need = [], ordered = [], got = [];
    rows.forEach(function (r) {
      var st = FS ? FS.statusOf(r.item) : null, sv = FS ? FS.srcVendor(r.item) : null;
      if (st === 'bought') { r.gotWhy = 'bought'; got.push(r); return; }
      if (sv === 'elsewhere') { r.gotWhy = 'elsewhere'; var sr = FS.src()[r.item]; r.elsewhere = sr && sr.where ? sr.where : ''; got.push(r); return; }
      if (sv === 'have' || have[r.item] || pan[r.item] === 'have' || (done && r.staple && pan[r.item] !== 'need')) { r.gotWhy = 'have'; got.push(r); return; }
      if (st === 'ordered') { r.orderInfo = FS.status()[r.item]; ordered.push(r); return; }
      r.tag = (st === 'oos' || st === 'missing') ? st : null; need.push(r);
    });
    return { need: need, ordered: ordered, got: got };
  }

  /* ---------- motion: FLIP list reordering (no libraries) ---------- */
  var MOTION = { ms: 300, ease: 'cubic-bezier(.2,.8,.25,1)' };
  var rmq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reducedMotion() { return !!(rmq && rmq.matches); }
  function canAnimate() { return !reducedMotion() && typeof Element !== 'undefined' && !!Element.prototype.animate; }
  /**
   * Runs mutate() (which re-renders the list) and animates every [data-flip] element from where it was to where it is now.
   * Elements are matched by their data-flip key, so the DOM may be rebuilt. Positions are read with getBoundingClientRect,
   * which includes any in-flight transform, so rapid repeated clicks continue smoothly from where rows currently appear.
   * opts.key = the toggled element's key (gets a quick fade and sits above the others while it travels); opts.have = its new state.
   */
  function flip(root, mutate, opts) {
    opts = opts || {};
    if (!canAnimate() || !root) { mutate(); return; }
    var first = {}, active = document.activeElement, activeKey = null, activeTag = active && active.tagName ? active.tagName.toLowerCase() : 'input';
    root.querySelectorAll('[data-flip]').forEach(function (e) { first[e.getAttribute('data-flip')] = e.getBoundingClientRect(); });
    var holder = active && active.closest ? active.closest('[data-flip]') : null;
    if (holder && root.contains(holder)) activeKey = holder.getAttribute('data-flip');
    mutate();
    root.querySelectorAll('[data-flip]').forEach(function (e) {
      var k = e.getAttribute('data-flip'), f = first[k], isKey = k === opts.key;
      if (activeKey === k) { var inp = e.querySelector(activeTag === 'select' ? 'select' : activeTag === 'button' ? 'button' : 'input'); if (inp) { try { inp.focus({ preventScroll: true }); } catch (x) {} } }
      var anims = [];
      if (!f) { if (!isKey) anims.push(e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' })); }
      else {
        var l = e.getBoundingClientRect(), dx = f.left - l.left, dy = f.top - l.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          anims.push(e.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }], { duration: MOTION.ms, easing: MOTION.ease }));
        }
      }
      if (isKey) {
        anims.push(e.animate(opts.have ? [{ opacity: 1 }, { opacity: 0.6 }] : [{ opacity: 0.6 }, { opacity: 1 }], { duration: MOTION.ms, easing: 'ease-out' }));
        if (opts.have) { var cb = e.querySelector('input[type=checkbox]');
          if (cb) cb.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' }); }
        e.style.position = 'relative'; e.style.zIndex = '3';
        var done = function () { e.style.position = ''; e.style.zIndex = ''; };
        if (anims[0]) { anims[0].onfinish = done; anims[0].oncancel = done; } else done();
      }
    });
  }

  /* ---------- substitution preference toggle ---------- */
  function renderSubPref(onChange) {
    document.querySelectorAll('[data-sub-pref]').forEach(function (host) {
      host.innerHTML = '';
      var cb = el('input', { type: 'checkbox', id: 'pref-auto' }); cb.checked = getAuto();
      cb.addEventListener('change', function () { setAuto(cb.checked); track('pref_never_veg_oil', { on: cb.checked }); if (onChange) onChange(); });
      host.appendChild(el('label', { class: 'pref', for: 'pref-auto' }, [cb, el('span', {}, [el('strong', { text: 'Never use vegetable oil: swap automatically' }),
        el('span', { class: 'small', text: ' Uses avocado oil, or pick olive oil on any ingredient. Saved on this device.' })])]));
    });
  }

  /* ---------- pages ---------- */
  var page = window.CR_PAGE;

  function initHome() {
    var chips = document.querySelectorAll('.chip');
    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        chips.forEach(function (x) { x.classList.remove('on'); }); c.classList.add('on');
        var f = c.getAttribute('data-filter');
        document.querySelectorAll('.card').forEach(function (card) { card.hidden = !(f === 'all' || card.getAttribute('data-cat') === f); });
        track('filter', { f: f });
      });
    });
    function refresh() {
      document.querySelectorAll('.plan-toggle').forEach(function (b) {
        var on = inPlan(b.getAttribute('data-id'));
        b.textContent = on ? '\u2713 In plan' : '+ Add to plan'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('on', on);
      });
    }
    document.querySelectorAll('.plan-toggle').forEach(function (b) { b.addEventListener('click', function () { togglePlan(b.getAttribute('data-id')); refresh(); }); });
    refresh(); renderSubPref();
  }

  function initRecipe() {
    var r = byId[window.CR_RECIPE_ID]; if (!r) return;
    track('view_recipe', { id: r.id });
    var adj = document.getElementById('adjuster');
    var ingsEl = document.getElementById('ings'), stepsEl = document.getElementById('steps');
    var addBtn = document.getElementById('btn-add-plan');

    function render() {
      var f = factorOf(r.id);
      // adjuster
      adj.innerHTML = '';
      var label = el('span', { class: 'serv-label', id: 'serv-label', text: servingsLabel(r, f) });
      adj.appendChild(label);
      if (r.servings) {
        var s = Math.max(1, Math.round(r.servings * f));
        adj.appendChild(el('button', { class: 'step-btn', 'aria-label': 'Fewer servings', onclick: function () { setServings(Math.max(1, Math.round(r.servings * factorOf(r.id)) - 1)); } }, ['\u2212']));
        adj.appendChild(el('button', { class: 'step-btn', 'aria-label': 'More servings', onclick: function () { setServings(Math.round(r.servings * factorOf(r.id)) + 1); } }, ['+']));
      }
      var q = el('span', { class: 'quick', role: 'group', 'aria-label': 'Scale recipe' });
      [[0.5, '\u00bd\u00d7'], [1, '1\u00d7'], [2, '2\u00d7'], [3, '3\u00d7']].forEach(function (m) {
        q.appendChild(el('button', { class: 'chip' + (Math.abs(f - m[0]) < 0.001 ? ' on' : ''), onclick: function () { setFactor(r.id, m[0]); track('scale_change', { id: r.id, f: m[0] }); render(); } }, [m[1]]));
      });
      adj.appendChild(q);
      document.getElementById('scale-note').hidden = Math.abs(f - 1) < 0.001;
      renderIngs(); renderSteps();
      addBtn.textContent = inPlan(r.id) ? '\u2713 In plan (tap to remove)' : '+ Add to plan';
    }
    function renderSteps() {
      var f = factorOf(r.id), sw = swaps(); stepsEl.innerHTML = '';
      r.steps.forEach(function (st) { stepsEl.appendChild(el('li', { text: L.swapText(L.scaleStep(st, f).replace(/\[\[|\]\]/g, ''), sw) })); });
    }
    function ingNode(ing, idx, f, sw, have) {
      var ents = L.effectiveEntries(ing, sw), keys = ents.map(function (e) { return e.item; });
      var isHave = keys.every(function (k) { return have[k]; });
      var flipKey = 'ing-' + idx;
      var cb = el('input', { type: 'checkbox', class: 'have', 'aria-label': 'I already have ' + L.swapText(ing.text, sw) });
      cb.checked = isHave;
      cb.addEventListener('change', function () {
        var h = getHave(), on = cb.checked; keys.forEach(function (k) { if (on) h[k] = true; else delete h[k]; }); setHave(h);
        track('pantry_toggle', { item: keys[0], have: on });
        flip(ingsEl, renderIngs, { key: flipKey, have: on });
      });
      var swItem = L.swappableItem(ing), kids = [];
      kids.push(el('label', {}, [cb, el('span', { class: 'txt' }, [L.swapText(L.scaleText(ing.text, f), sw), ing.staple ? el('span', { class: 'pill', text: 'pantry staple' }) : '']),
        el('span', { class: 'ihave', text: 'I have it' })]));
      if (swItem) {
        var cur = sw[swItem] || 'orig', orig = L.originalWording(ing.text, swItem) || swItem;
        var sel = el('select', { class: 'swap', 'aria-label': 'Swap ' + orig + ' (applies to every recipe)' });
        sel.appendChild(el('option', { value: 'orig', text: cur === 'orig' ? 'Swap\u2026' : 'Keep ' + orig }));
        L.subOptions(swItem).forEach(function (o) { sel.appendChild(el('option', { value: o.id, text: L.capital(o.name) })); });
        sel.value = cur;
        sel.addEventListener('change', function () {
          setSub(swItem, sel.value); track('swap', { item: swItem, to: sel.value });
          flip(ingsEl, function () { renderIngs(); renderSteps(); }, {});
        });
        var o = cur !== 'orig' ? L.subOption(swItem, cur) : null;
        kids.push(el('div', { class: 'swaprow' }, [sel, o ? el('span', { class: 'swapnote small', text: 'Swapped from ' + orig + '. ' + (o.note ? o.note + ' ' : '') + 'Applies to every recipe and your list.' }) : '']));
      }
      var li = el('li', { class: 'ing' + (isHave ? ' have' : ''), 'data-flip': flipKey }, kids);
      return { li: li, have: isHave, group: ing.group };
    }
    function renderIngs() {
      var f = factorOf(r.id), sw = swaps(), have = getHave(); ingsEl.innerHTML = '';
      var cur = null, haveRows = [];
      r.ingredients.forEach(function (ing, idx) {
        var n = ingNode(ing, idx, f, sw, have);
        if (n.have) { haveRows.push(n.li); return; }
        if (ing.group && ing.group !== cur) ingsEl.appendChild(el('li', { class: 'grp', 'data-flip': 'grp-' + ing.group, text: ing.group }));
        cur = ing.group; ingsEl.appendChild(n.li);
      });
      if (haveRows.length) {
        ingsEl.appendChild(el('li', { class: 'grp havehead', 'data-flip': 'have-h', text: 'Have it (' + haveRows.length + ')' }));
        haveRows.forEach(function (li) { ingsEl.appendChild(li); });
      }
    }
    function renderPrefAndNote() { renderSubPref(function () { flip(ingsEl, function () { renderIngs(); renderSteps(); }, {}); }); }
    function setServings(n) { setFactor(r.id, n / r.servings); track('scale_change', { id: r.id, servings: n }); render(); }
    addBtn.addEventListener('click', function () { togglePlan(r.id); render(); });
    document.getElementById('btn-copy-recipe').addEventListener('click', function () {
      var vr = visibleRows([{ id: r.id, factor: factorOf(r.id) }]);
      copyText(L.listToText(vr.need, [r.title])).then(function (ok) { track('copy_list', { scope: 'recipe', id: r.id }); toast(ok ? 'List copied.' : 'Could not copy. Select the text manually.'); });
    });
    render(); renderPrefAndNote();
  }

  function initPlan() {
    var picker = document.getElementById('plan-picker'), out = document.getElementById('list-out');
    var haveWrap = document.getElementById('have-wrap'), haveOut = document.getElementById('have-out');
    var listRoot = document.querySelector('.plan-list');
    var Wk = window.CRWeek, F = window.CRFlow, FS = flowState(), FLOWON = !!(window.CR_FLOW && Wk && F && FS && window.CR_VENDORS);
    track('view_plan');
    var OPTS = [[0.5, '\u00bd\u00d7'], [1, '1\u00d7'], [1.5, '1\u00bd\u00d7'], [2, '2\u00d7'], [3, '3\u00d7']];
    var curPlan = null, curPart = null, curCart = null, curBadges = [], lastRows = [];

    /* ---------- one plan: the picks (cr.plan) and the week (cr.week) are kept as the same set of recipes ---------- */
    function todayStr() { return Wk.localDateStr(new Date()); }
    function weekLoad() { return Wk.load(window.localStorage, RECIPES); }
    function weekSave(st) { if (!st.start && Wk.plannedCount(st)) st.start = Wk.weekStart(st, todayStr()); Wk.save(window.localStorage, st); }
    function weekIds(st) { var ids = []; Wk.allItems(st).forEach(function (it) { if (ids.indexOf(it.id) < 0) ids.push(it.id); }); return ids; }
    function weekFactors(st) { var sel = Wk.shoppingSelection(st); return sel.factors; }
    /** Additive and idempotent: nothing the shopper saved is dropped. Picks missing from the week wait in its "waiting for a day" list; planned recipes join the picks. */
    function syncAdopt() {
      if (!FLOWON) return;
      var st = weekLoad(), plan = getPlan(), inWeek = {}, ch = false, pch = false;
      weekIds(st).forEach(function (id) { inWeek[id] = true; });
      plan.forEach(function (id) { if (!inWeek[id] && byId[id]) { Wk.addItem(st, id, 'pool', factorOf(id)); ch = true; inWeek[id] = true; } });
      var fac = weekFactors(st), f = store.get('cr.factors', {}), fch = false;
      Object.keys(inWeek).forEach(function (id) { if (plan.indexOf(id) < 0) { plan.push(id); pch = true; } if (fac[id] && Math.abs((f[id] || 1) - fac[id]) > 1e-9) { f[id] = fac[id]; fch = true; } });
      if (ch) weekSave(st); if (pch) setPlan(plan); if (fch) store.set('cr.factors', f);
    }
    /** After the week changes (days, servings, removals): the picks become exactly the week's recipes, at the week's servings. */
    function syncFromWeek() {
      if (!FLOWON) return;
      var st = weekLoad(), ids = weekIds(st), fac = weekFactors(st), f = store.get('cr.factors', {});
      ids.forEach(function (id) { f[id] = fac[id]; }); store.set('cr.factors', f); setPlan(ids);
    }
    function pickAdd(id) {
      var plan = getPlan(); if (plan.indexOf(id) < 0) { plan.push(id); track('add_to_plan', { id: id }); setPlan(plan); }
      var r = byId[id], hh = FLOWON ? FS.household() : 0, fs = store.get('cr.factors', {});
      if (hh && r.servings && !fs[id]) setFactor(id, Math.round(hh / r.servings * 1000) / 1000);
      if (FLOWON) { var st = weekLoad(); if (Wk.dayOf(st, id) === -1) { Wk.addItem(st, id, 'pool', factorOf(id)); weekSave(st); window.dispatchEvent(new CustomEvent('cr-week-changed')); } }
    }
    function pickRemove(id) {
      var plan = getPlan(), i = plan.indexOf(id); if (i >= 0) plan.splice(i, 1); setPlan(plan);
      if (FLOWON) { var st = weekLoad(); for (var d = 0; d < 7; d++) Wk.removeItem(st, d, id); Wk.removeItem(st, 'pool', id); weekSave(st); window.dispatchEvent(new CustomEvent('cr-week-changed')); }
    }
    function pickFactor(id, f) {
      setFactor(id, f);
      if (FLOWON) { var st = weekLoad(), ch = false, its = Wk.allItems(st).filter(function (it) { return it.id === id; }); its.forEach(function (it) { it.f = Math.round(f / its.length * 1000) / 1000; ch = true; }); if (ch) { weekSave(st); window.dispatchEvent(new CustomEvent('cr-week-changed')); } }
    }

    /* ---------- Walmart tier + where-to-buy controls ---------- */
    var curRoute = null, walmartHomes = null;
    var TIERSD = function () { return window.CR_WALMART_TIERS || null; };
    function baseIx() { return WM() ? WM().indexMap(window.CR_WALMART_MAP || []) : {}; }
    var stock = WM() ? WM().makeStockStore(window.localStorage) : null, walmartUI = null;
    function walmartCfg() { return Object.assign({}, WM().CONFIG, { tiers: TIERSD(), tier: getTier(), tierOverrides: getTierOver(), backups: window.CR_WALMART_BACKUPS || null, oos: stock.oos(), swaps: stock.swaps() }); }
    function walmartRowsNow() { return curRoute ? curRoute.walmartRows : currentText().rows; }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    function renderBuyBoxes() {
      var tb = document.getElementById('tier-box'), sb = document.getElementById('source-box'); if (!tb || !sb || !WM() || !TIERSD()) { if (tb) tb.hidden = true; if (sb) sb.hidden = true; return; }
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
    function goFarm() { setSource('farm'); track('source_change', { source: 'farm', from: 'oos' }); flipList(null, false); renderBuyBoxes(); var t = document.getElementById('source-box'); if (t && t.scrollIntoView) { try { t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {} } }
    function priceText(e) { return e && e.price_usd ? ', about $' + e.price_usd + '*' : ''; }
    /* the "what we'd buy" line under a list row */
    function pickLine(r, main) {
      var W = WM(), F = window.CRFarm; if (!W) return;
      var v = curRoute && curRoute.mode === 'farm' && F ? F.vendorOf(curRoute, r.item) : { vendor: 'walmart' };
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
      var box = document.getElementById('household-box'); if (!box) return; box.innerHTML = '';
      if (!FLOWON) { box.hidden = true; return; }
      box.hidden = false;
      var sel = el('select', { id: 'household-sel', 'aria-label': 'Servings per dinner' }), cur = FS.household();
      HH.forEach(function (n) { var o = el('option', { value: String(n), text: n ? 'Serves ' + n : 'Recipes as written' }); if (n === cur) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', function () {
        var n = Number(sel.value); FS.setHousehold(n); track('household', { n: n });
        if (n) getPlan().forEach(function (id) { var r = byId[id]; if (r && r.servings) pickFactor(id, Math.round(n / r.servings * 1000) / 1000); });
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
          if (FLOWON) { if (cb.checked) pickAdd(id); else pickRemove(id); } else togglePlan(id);
          renderList(); buildRowState(); if (FLOWON) buildPicker();
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
    function shelfOf(item) { var fr = window.CR_FRESH; var e = fr && fr.items && fr.items[item]; return e && !e.minor ? e.min : (e ? e.min : null); }
    function userOverrides() {
      var o = {}; if (!FLOWON) return o; var m = FS.src();
      Object.keys(m).forEach(function (k) { var v = FS.srcVendor(k); if (v === 'walmart' || v === 'tyner' || v === 'market') o[k] = v; });
      return o;
    }
    function plLine(item) { if (!curPlan) return null; for (var i = 0; i < curPlan.lines.length; i++) if (curPlan.lines[i].item === item) return curPlan.lines[i]; return null; }
    var VNAME = { walmart: 'Walmart', tyner: 'Tyner Pond Farm', market: 'Market Wagon' };

    /* ---------- list rows ---------- */
    function markHave(r, on) {
      var h = getHave(); if (on) h[r.item] = true; else delete h[r.item]; setHave(h);
      if (FLOWON) {
        if (on) { FS.setPantry(r.item, null); }
        else {
          var sv = FS.srcVendor(r.item); if (sv === 'elsewhere' || sv === 'have') FS.setSrc(r.item, null);
          if (FS.statusOf(r.item) === 'bought') FS.setStatus(r.item, null);
          if (FS.pantryDone() && r.staple) FS.setPantry(r.item, 'need'); else FS.setPantry(r.item, null);
        }
      }
      track('pantry_toggle', { item: r.item, have: on });
    }
    function whereSelect(r) {
      var farm = window.CR_FARM || {}, ty = farm.tyner || {}, mw = farm.marketwagon || {};
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
            if (FLOWON) window.dispatchEvent(new CustomEvent('cr-week-changed'));
          } })]));
      } else if (L.SUBS[r.item] && section !== 'got' && L.subOptions(r.item).some(function (op) { return !op.custom; })) {
        var sel = el('select', { class: 'swap', 'aria-label': 'Swap ' + r.label + ' (applies to every recipe)' });
        sel.appendChild(el('option', { value: 'orig', text: 'Swap\u2026' }));
        L.subOptions(r.item).filter(function (op) { return !op.custom; }).forEach(function (op) { sel.appendChild(el('option', { value: op.id, text: L.capital(op.name) })); });
        sel.addEventListener('change', function () { setSub(r.item, sel.value); track('swap', { item: r.item, to: sel.value }); flipList(null, false); if (FLOWON) window.dispatchEvent(new CustomEvent('cr-week-changed')); });
        main.appendChild(sel);
      }
      if (FLOWON) {
        var pl = plLine(r.item);
        if (section === 'need' && pl) {
          var bits = [];
          if (pl.rerouted) bits.push(el('div', { class: 'lflow small reroute', text: 'Moved to Walmart: ' + pl.rerouted.reason }));
          if (pl.late) bits.push(el('div', { class: 'lflow small late', text: 'Too late: ' + pl.reason + (pl.suggestDay ? ' Moving the dinner to ' + Wk.fmtDate(pl.suggestDay) + ' or later would work.' : '') + ' You can also buy it in a store or pick another source below.' }));
          else if (pl.arrive) bits.push(el('div', { class: 'lflow small' }, [el('span', { class: 'dbadge ' + pl.vendor, text: VNAME[pl.vendor] }), ' arrives ' + Wk.fmtDate(pl.arrive) + ' \u00b7 order by ' + F.fmtOrderBy(pl.orderBy) + (pl.orderBy.assumed ? '*' : '') + (pl.neededBy ? ' \u00b7 for ' + Wk.fmtDate(pl.neededBy) : '')]));
          else if (pl.undated) bits.push(el('div', { class: 'lflow small muted', text: 'No dinner day yet, so no order deadline. Put its recipe on a day in step 2.' }));
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
      }
      return el('li', { class: 'lrow' + (gotSection ? ' got' : '') + (section === 'ordered' ? ' ordered' : ''), 'data-flip': fk }, kids);
    }
    function flipList(key, have) { flip(listRoot, renderList, { key: key, have: have }); }

    /* ---------- pantry check ---------- */
    function stapleRows() {
      var all = L.mergeSelection(RECIPES, selection(), swaps()); return all.filter(function (r) { return r.staple; });
    }
    function renderPantry() {
      var box = document.getElementById('pantry-box'); if (!box) return; box.innerHTML = '';
      var rows = FLOWON ? stapleRows() : []; if (!rows.length) { box.hidden = true; return; }
      box.hidden = false; var done = FS.pantryDone(), pan = FS.pantry();
      var checks = [];
      var ul = el('ul', { class: 'pantry-list' });
      rows.forEach(function (r) {
        var on = done ? (pan[r.item] !== 'need') : pan[r.item] !== 'need';
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
      var box = document.getElementById('total-box'); if (!box) return; box.innerHTML = '';
      if (!FLOWON || !curCart || !vr.need.length) { box.hidden = true; return; }
      box.hidden = false;
      var lines = [];
      curCart.items.forEach(function (i) { lines.push({ price: i.price, qty: i.qty }); });
      curCart.unmapped.forEach(function () { lines.push({ price: null }); });
      if (curRoute && curRoute.tyner) curRoute.tyner.lines.forEach(function (l) { lines.push({ price: l.price, qty: l.qty }); });
      if (curRoute && curRoute.market) curRoute.market.lines.forEach(function () { lines.push({ price: null }); });
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
    function groupUrl(g) {
      if (g.vendor === 'tyner' && curRoute && curRoute.tyner && window.CRFarm.tynerUrlFor) {
        var its = g.lines.map(function (l) { return l.item; });
        var ls = curRoute.tyner.lines.filter(function (l) { return its.indexOf(l.ingredient) >= 0 || (l.ingredients || []).some(function (i) { return its.indexOf(i) >= 0; }); });
        return window.CRFarm.tynerUrlFor(ls.length ? ls : curRoute.tyner.lines, window.CR_FARM);
      }
      return null;
    }
    function renderGroups() {
      var root = document.getElementById('order-groups'); if (!root) return; root.innerHTML = '';
      if (!FLOWON) { root.hidden = true; return; }
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
        if (g.assumed) card.appendChild(el('div', { class: 'small assumed', text: '* ' + (spec.buffer ? spec.buffer.text : '') }));
        else if (spec.cutoffKnown) card.appendChild(el('div', { class: 'small assumed', text: (FS.cfg()[g.vendor] && FS.cfg()[g.vendor].cutoff) ? 'From your delivery settings.' : 'Their own cutoff, from their site. Confirm at checkout.' }));
        if (spec.minNote && g.vendor !== 'walmart') card.appendChild(el('div', { class: 'small assumed', text: spec.minNote }));
        var acts = el('div', { class: 'ogroup-acts' }, []);
        var url = groupUrl(g);
        if (g.vendor === 'walmart') acts.appendChild(el('button', { type: 'button', class: 'btn small', text: 'Open Walmart link', onclick: function () { document.getElementById('btn-walmart').click(); } }));
        else if (url) acts.appendChild(el('a', { class: 'btn small', href: url, target: '_blank', rel: 'noopener', text: 'Open Tyner cart' }));
        else acts.appendChild(el('button', { type: 'button', class: 'btn small', text: 'Open the Market Wagon checklist', onclick: function () { var c = document.querySelector('#source-cards [data-card]') || document.getElementById('source-cards'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }));
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
      var b = document.getElementById('shop-banner'); if (!b) return;
      if (!FLOWON) { b.hidden = true; return; }
      var open = Object.keys(FS.orders()).map(function (k) { return FS.orders()[k]; }).filter(function (o) { return !o.received; });
      var due = F.dueArrivals(FS.orders(), F.nowOf());
      var msg = '', cls = 'shop-banner';
      if (due.length) { msg = 'An order should have arrived (' + VNAME[due[0].vendor] + ', due ' + Wk.fmtDate(due[0].arrive) + '). Tell us what landed in the cart below.'; cls += ' due'; }
      else if (curPlan && curPlan.shopOn) {
        var s = curPlan.shopOn, g = curPlan.groups[0];
        msg = (s.today ? 'Order today: ' : 'Shop on ' + Wk.fmtDate(s.date) + ': ') + g.name + ' by ' + F.fmtOrderBy(s.orderBy) + (s.orderBy.assumed ? '*' : '') + ', for delivery ' + Wk.fmtDate(g.arrive) + '. The longest lead time sets this day.';
        if (s.today) cls += ' today';
      } else if (curPlan && curPlan.late.length) { msg = 'Some items cannot arrive in time for the day they are on. See the cart below.'; cls += ' late'; }
      else if (curPlan && curPlan.undated.length && vr.need.length) msg = 'Put your recipes on days to see when to order.';
      else if (open.length) msg = 'Orders placed. Waiting on ' + open.map(function (o) { return VNAME[o.vendor] + (o.arrive ? ' (' + Wk.fmtDate(o.arrive) + ')' : ''); }).join(' and ') + '.';
      if (!msg) { b.hidden = true; return; }
      b.hidden = false; b.className = cls; b.textContent = msg;
    }
    function renderStepBar(vr) {
      var n = getPlan().length, st = FLOWON ? weekLoad() : null;
      function set(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }
      set('sb-pick', n ? n + ' picked' : 'none yet');
      if (st) { var onDay = 0; st.days.forEach(function (d) { onDay += d.items.length; }); set('sb-days', n ? onDay + ' of ' + n + ' on a day' : ''); }
      var cart = vr ? vr.need.length + ' to buy' : ''; set('sb-cart', cart);
    }

    /* ---------- delivery settings ---------- */
    function renderSettings() {
      var box = document.getElementById('deliv-box'); if (!box) return; box.innerHTML = '';
      if (!FLOWON) return;
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
        var sb0 = document.getElementById('ordered-wrap'); if (sb0) sb0.hidden = true; var sw0 = document.getElementById('walmart-subs'); if (sw0) { sw0.innerHTML = ''; sw0.hidden = true; }
        curRoute = null; curPlan = null; curCart = null; curBadges = []; if (WM()) placeWalmartControls(null);
        var sc0 = document.getElementById('source-cards'); if (sc0) { sc0.innerHTML = ''; sc0.hidden = true; }
        renderPantry(); renderTotal({ need: [] }); renderGroups(); renderBanner({ need: [] }); renderStepBar({ need: [] }); updateBadge(); publish(); return;
      }
      var vr = visibleRows(sel); curPart = vr; lastRows = vr.need;
      var uo = userOverrides(), CF = window.CRFarm;
      var route1 = CF ? CF.route(vr.need, { mode: getSource(), overrides: uo }) : null;
      curPlan = null;
      if (FLOWON && CF && route1) {
        var info = dinnerInfo();
        curPlan = F.plan({ rows: vr.need, vendorOf: function (item) { return CF.vendorOf(route1, item).vendor; }, forced: function (item) { return !!uo[item]; },
          dinners: info.dinners, shelf: shelfOf, cfg: FS.cfg(), now: F.nowOf() });
        var ov2 = Object.assign({}, uo, curPlan.autoReroutes);
        curRoute = CF.route(vr.need, { mode: getSource(), overrides: ov2 });
        var covered = {}; vr.ordered.forEach(function (r) { covered[r.item] = 'ordered'; }); vr.got.forEach(function (r) { covered[r.item] = r.gotWhy || 'have'; });
        curBadges = F.dayBadges(curPlan, info.days, function (item) { return covered[item] || null; });
      } else { curRoute = route1; curBadges = []; }
      var wrows = walmartRowsNow();
      curCart = WM() ? WM().buildCart(wrows, window.CR_WALMART_MAP || [], walmartCfg()) : null;
      out.appendChild(el('p', { class: 'count', text: vr.need.length + ' items to buy from ' + sel.length + ' recipe' + (sel.length > 1 ? 's' : '') }));
      L.AISLES.forEach(function (a) {
        var rs = vr.need.filter(function (r) { return r.aisle === a; }); if (!rs.length) return;
        var ul = el('ul', { class: 'lrows' }); rs.forEach(function (r) { ul.appendChild(renderRow(r, 'need')); });
        out.appendChild(el('h3', { class: 'aisle', 'data-flip': 'aisle-' + a, text: a })); out.appendChild(ul);
      });
      var ow = document.getElementById('ordered-wrap'), oo = document.getElementById('ordered-out');
      if (ow && oo) { oo.innerHTML = ''; var ul3 = el('ul', { class: 'lrows' }); vr.ordered.forEach(function (r) { ul3.appendChild(renderRow(r, 'ordered')); }); oo.appendChild(ul3); document.getElementById('ordered-count').textContent = vr.ordered.length; ow.hidden = vr.ordered.length === 0; }
      haveOut.innerHTML = ''; var ul2 = el('ul', { class: 'lrows' }); vr.got.forEach(function (r) { ul2.appendChild(renderRow(r, 'got')); });
      haveOut.appendChild(ul2); document.getElementById('have-count').textContent = vr.got.length; haveWrap.hidden = vr.got.length === 0;
      updateBadge();
      if (window.CRFarm && curRoute) {
        placeWalmartControls(null);   // put the Walmart controls back before the cards (which may hold them) are rebuilt
        var slot = window.CRFarm.renderCards(document.getElementById('source-cards'), curRoute, {});
        placeWalmartControls(slot);
        var wb = document.getElementById('btn-walmart');
        if (wb && (window.CR_WALMART_MAP || []).length) wb.textContent = curRoute.mode === 'farm' ? 'Add Walmart items to cart (' + wrows.filter(function (r) { return r.item !== 'water'; }).length + ')' : 'Add to Walmart cart';
      }
      if (window.CRWalmart && window.CRWalmart.renderAlts) {
        if (walmartUI) walmartUI.refresh();
        window.CRWalmart.renderAlts(document.getElementById('walmart-subs'), wrows, null, curCart.items.map(function (i) { return i.id; }));
      }
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
    if (window.CRWalmart) {
      walmartUI = window.CRWalmart.wire({ button: document.getElementById('btn-walmart'), note: document.getElementById('walmart-note'), check: document.getElementById('walmart-check'),
        disclosure: document.getElementById('walmart-disclosure'), getRows: function () { return walmartRowsNow(); }, getTier: getTier, getOverrides: getTierOver, track: track, toast: toast,
        stock: stock, goFarm: goFarm, onStockChange: function () { flipList(null, false); } });
    }
    document.getElementById('btn-staples').addEventListener('click', function () {
      var h = getHave(), sw = swaps(); RECIPES.forEach(function (r) { r.ingredients.forEach(function (i) { L.effectiveEntries(i, sw).forEach(function (e) { if (e.staple) h[e.item] = true; }); }); });
      setHave(h); track('pantry_staples_all'); flipList(null, false);
    });
    function toastUndo(msg, fn) {
      var t = document.getElementById('toast'); if (!t) return; t.textContent = msg + ' ';
      t.appendChild(el('button', { type: 'button', class: 'linkbtn', id: 'toast-undo', text: 'Undo', onclick: function () { fn(); t.hidden = true; } })); t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 8000);
    }
    document.getElementById('btn-clear').addEventListener('click', function () {
      var snap = { plan: getPlan(), factors: getFactors(), week: window.localStorage.getItem('cr.week') };
      setPlan([]);
      if (FLOWON) { var st = weekLoad(); Wk.clearWeek(st); weekSave(st); window.dispatchEvent(new CustomEvent('cr-week-changed')); }
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
    var stepBar = document.getElementById('stepbar');
    if (stepBar && window.IntersectionObserver) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) stepBar.querySelectorAll('.step').forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id); }); }); }, { rootMargin: '-35% 0px -55% 0px' });
      ['pick', 'days', 'cart'].forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
    }
    if (page === 'plan' && !location.hash) setTimeout(function () { var c = document.getElementById('cart'); if (c && c.scrollIntoView) c.scrollIntoView(); }, 0);
  }


  function initStats() {
    var tb = document.querySelector('#stats-table tbody');
    function draw() {
      var ev = store.get('cr.events', {}); tb.innerHTML = ''; var ks = Object.keys(ev).sort();
      if (!ks.length) tb.appendChild(el('tr', {}, [el('td', { colspan: '2', text: 'No events yet.' })]));
      ks.forEach(function (k) { tb.appendChild(el('tr', {}, [el('td', { text: k }), el('td', { text: String(ev[k]) })])); });
    }
    document.getElementById('stats-reset').addEventListener('click', function () { store.set('cr.events', {}); draw(); });
    draw();
  }

  function initSignup() {
    var f = document.getElementById('signup-form'); if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = document.getElementById('su-email').value.trim(), msg = document.getElementById('signup-msg');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { msg.textContent = 'Please enter a valid email address.'; return; }
      // TODO: POST to a real email-list service. Preview: store locally only.
      var list = store.get('cr.signups', []); list.push({ email: v, at: new Date().toISOString() }); store.set('cr.signups', list);
      track('email_signup'); msg.textContent = 'Thanks! (Preview: saved in this browser only, nothing is sent anywhere.)'; f.reset();
    });
  }

  updateBadge(); initSignup();
  if (page === 'home') initHome(); else if (page === 'recipe') initRecipe(); else if (page === 'plan' || page === 'week') initPlan(); else if (page === 'stats') initStats();
  window.CR = Object.assign(window.CR || {}, { track: track, store: store,
    // used by js/weekui.js (My week, My Kitchen)
    swaps: swaps, factorOf: factorOf, setFactor: setFactor, getPlan: getPlan, setPlan: setPlan, updateBadge: updateBadge, servingsLabel: servingsLabel,
    manualChanges: manualChanges, flowState: flowState });
})();

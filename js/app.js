/* Common Roots: browser behaviour. No backend. Everything stored in localStorage on this device. */
(function () {
  'use strict';
  var L = window.CRLib, RECIPES = window.CR_RECIPES || [];
  var byId = {}; RECIPES.forEach(function (r) { byId[r.id] = r; });

  /* ---------- CONFIG: swap points for later ---------- */
  var CONFIG = {
    instacart: {
      // 'coming_soon' = copy the list and say so honestly. 'api' = call createShoppingListLink below.
      mode: 'coming_soon',
      // Instacart store-search deep link is unverified and may need a store/location, so it stays off.
      openSearchFallback: false,
      searchUrl: function (q) { return 'https://www.instacart.com/store/s?k=' + encodeURIComponent(q); },
      /**
       * SINGLE SWAP POINT for the real integration.
       * Should POST payload (see CRLib.instacartPayload) to a small server-side function that calls
       * Instacart's "Create shopping list page" endpoint (POST /idp/v1/products/products_link) and
       * returns { url }. The API key must never be shipped in this static site.
       * TODO: implement once Instacart Developer Platform access exists. See INSTACART_NOTES.md.
       */
      createShoppingListLink: function (payload) { return Promise.resolve(null); }
    }
  };

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
  function visibleRows(sel) {
    var have = getHave();
    var rows = L.mergeSelection(RECIPES, sel, swaps());
    return { need: rows.filter(function (r) { return !have[r.item]; }), got: rows.filter(function (r) { return have[r.item]; }) };
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

  /* ---------- the one Instacart function ---------- */
  function sendToInstacart(rows, titles) {
    var text = L.listToText(rows, titles);
    track('instacart_click', { items: rows.length });
    return copyText(text).then(function (ok) {
      var cfg = CONFIG.instacart;
      if (cfg.mode === 'api') {
        return cfg.createShoppingListLink(L.instacartPayload(rows, 'Common Roots shopping list')).then(function (res) {
          if (res && res.url) { window.open(res.url, '_blank', 'noopener'); return { ok: ok, opened: true }; }
          return { ok: ok, opened: false };
        });
      }
      if (cfg.openSearchFallback && rows.length) window.open(cfg.searchUrl(rows[0].name), '_blank', 'noopener');
      return { ok: ok, opened: false, text: text };
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
    track('view_plan');
    var OPTS = [[0.5, '\u00bd\u00d7'], [1, '1\u00d7'], [1.5, '1\u00bd\u00d7'], [2, '2\u00d7'], [3, '3\u00d7']];

    function buildPicker() {
      picker.innerHTML = '';
      RECIPES.forEach(function (r) {
        var id = r.id, on = inPlan(id);
        var cb = el('input', { type: 'checkbox', id: 'pick-' + id, 'aria-label': 'Include ' + r.title }); cb.checked = on;
        cb.addEventListener('change', function () { togglePlan(id); renderList(); buildRowState(); });
        var sel = el('select', { 'aria-label': 'Servings for ' + r.title });
        var f = factorOf(id), found = false;
        OPTS.forEach(function (o) {
          var op = el('option', { value: String(o[0]), text: o[1] }); if (Math.abs(o[0] - f) < 0.001) { op.selected = true; found = true; } sel.appendChild(op);
        });
        if (!found) { var c = el('option', { value: String(f), text: L.fmtQty(f) + '\u00d7' }); c.selected = true; sel.appendChild(c); }
        sel.addEventListener('change', function () { setFactor(id, Number(sel.value)); track('scale_change', { id: id, f: Number(sel.value) }); renderList(); buildRowState(); });
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
    function renderRow(r, gotSection) {
      var fk = 'row-' + r.key;
      var cb = el('input', { type: 'checkbox', 'aria-label': 'I already have ' + r.label });
      cb.checked = !!gotSection;
      cb.addEventListener('change', function () {
        var on = cb.checked, h = getHave(); if (on) h[r.item] = true; else delete h[r.item]; setHave(h);
        track('pantry_toggle', { item: r.item, have: on }); flipList(fk, on);
      });
      var sub = [(r.staple ? el('span', { class: 'pill', text: 'pantry staple' }) : ''), 'For: ' + r.recipes.join(', ')];
      var kids = [
        el('label', { class: 'lcheck' }, [cb, el('span', { class: 'ihave', text: 'I have it' })]),
        el('div', { class: 'lmain' }, [
          el('div', { class: 'ltop' }, [el('span', { class: 'lname', text: L.capital(r.label) }),
            el('span', { class: 'lamt', text: r.amount + (r.optionalAll ? ' (optional)' : '') })]),
          el('div', { class: 'lsub' }, sub)])];
      var main = kids[1];
      if (r.swappedFrom && r.swappedFrom.length) {
        var o = L.subOption(r.swappedFrom[0], r.item);
        main.appendChild(el('div', { class: 'swapnote small' }, [
          'Swapped from ' + r.swappedFrom.join(' and ') + '. ' + (o && o.note ? o.note + ' ' : ''),
          el('button', { class: 'linkbtn', type: 'button', text: 'Undo swap', onclick: function () {
            r.swappedFrom.forEach(function (f) { setSub(f, 'orig'); }); track('swap', { undo: r.swappedFrom.join(',') }); flipList(null, false);
          } })]));
      } else if (L.SUBS[r.item]) {
        var sel = el('select', { class: 'swap', 'aria-label': 'Swap ' + r.label + ' (applies to every recipe)' });
        sel.appendChild(el('option', { value: 'orig', text: 'Swap\u2026' }));
        L.subOptions(r.item).forEach(function (op) { sel.appendChild(el('option', { value: op.id, text: L.capital(op.name) })); });
        sel.addEventListener('change', function () { setSub(r.item, sel.value); track('swap', { item: r.item, to: sel.value }); flipList(null, false); });
        main.appendChild(sel);
      }
      return el('li', { class: 'lrow' + (gotSection ? ' got' : ''), 'data-flip': fk }, kids);
    }
    function flipList(key, have) { flip(listRoot, renderList, { key: key, have: have }); }
    function renderList() {
      var sel = selection(); out.innerHTML = '';
      if (!sel.length) { out.appendChild(el('p', { class: 'empty', text: 'No recipes picked yet. Tick a few on the left (or add them from the recipe pages).' })); haveWrap.hidden = true; return; }
      var vr = visibleRows(sel);
      out.appendChild(el('p', { class: 'count', text: vr.need.length + ' items to buy from ' + sel.length + ' recipe' + (sel.length > 1 ? 's' : '') }));
      L.AISLES.forEach(function (a) {
        var rs = vr.need.filter(function (r) { return r.aisle === a; }); if (!rs.length) return;
        var ul = el('ul', { class: 'lrows' }); rs.forEach(function (r) { ul.appendChild(renderRow(r, false)); });
        out.appendChild(el('h3', { class: 'aisle', 'data-flip': 'aisle-' + a, text: a })); out.appendChild(ul);
      });
      haveOut.innerHTML = ''; var ul2 = el('ul', { class: 'lrows' }); vr.got.forEach(function (r) { ul2.appendChild(renderRow(r, true)); });
      haveOut.appendChild(ul2); document.getElementById('have-count').textContent = vr.got.length; haveWrap.hidden = vr.got.length === 0;
      updateBadge();
    }
    function currentText() {
      var sel = selection(); var vr = visibleRows(sel);
      return { rows: vr.need, titles: sel.map(function (s) { return byId[s.id].title; }) };
    }
    document.getElementById('btn-copy').addEventListener('click', function () {
      var c = currentText(); if (!c.rows.length) { toast('Pick a recipe first.'); return; }
      copyText(L.listToText(c.rows, c.titles)).then(function (ok) { track('copy_list', { scope: 'plan', items: c.rows.length }); toast(ok ? 'List copied.' : 'Could not copy automatically.'); });
    });
    document.getElementById('btn-instacart').addEventListener('click', function () {
      var c = currentText(); var note = document.getElementById('instacart-note');
      if (!c.rows.length) { toast('Pick a recipe first.'); return; }
      sendToInstacart(c.rows, c.titles).then(function (res) {
        note.hidden = false;
        if (res.opened) { note.textContent = 'Opening Instacart.'; return; }
        note.textContent = (res.ok ? 'Your list is copied. ' : 'Copy failed, so select and copy the list manually. ') +
          'Instacart link coming soon: this button does not create a cart yet. For now, paste the list into Instacart or your store\u2019s app.';
      });
    });
    if (window.CRWalmart) {
      window.CRWalmart.wire({ button: document.getElementById('btn-walmart'), note: document.getElementById('walmart-note'),
        disclosure: document.getElementById('walmart-disclosure'), getRows: function () { return currentText().rows; }, track: track, toast: toast });
    }
    document.getElementById('btn-staples').addEventListener('click', function () {
      var h = getHave(), sw = swaps(); RECIPES.forEach(function (r) { r.ingredients.forEach(function (i) { L.effectiveEntries(i, sw).forEach(function (e) { if (e.staple) h[e.item] = true; }); }); });
      setHave(h); track('pantry_staples_all'); flipList(null, false);
    });
    document.getElementById('btn-clear').addEventListener('click', function () { setPlan([]); buildPicker(); renderList(); });
    buildPicker(); renderList(); renderSubPref(function () { flipList(null, false); });
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
  if (page === 'home') initHome(); else if (page === 'recipe') initRecipe(); else if (page === 'plan') initPlan(); else if (page === 'stats') initStats();
  window.CR = { track: track, CONFIG: CONFIG, sendToInstacart: sendToInstacart, store: store };
})();

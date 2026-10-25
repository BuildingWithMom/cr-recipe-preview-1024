/* Common Roots: recipe page (servings, swaps, ingredient list, steps). */
(function () {
  'use strict';
  var track = window.CRState.track;
  var CRStateM = window.CRState;
  var L = CRStateM.L, byId = CRStateM.byId, factorOf = CRStateM.factorOf, getHave = CRStateM.getHave, inPlan = CRStateM.inPlan, servingsLabel = CRStateM.servingsLabel, setFactor = CRStateM.setFactor, setHave = CRStateM.setHave, setSub = CRStateM.setSub, swaps = CRStateM.swaps, togglePlan = CRStateM.togglePlan, visibleRows = CRStateM.visibleRows;
  var CRDomM = window.CRDom;
  var copyText = CRDomM.copyText, el = CRDomM.el, toast = CRDomM.toast;
  var CRMotionM = window.CRMotion;
  var flip = CRMotionM.flip;
  var CRSubPrefM = window.CRSubPref;
  var renderSubPref = CRSubPrefM.renderSubPref;
  function initRecipe() {
    var r = byId[window.CR_RECIPE_ID];
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

  window.CRPageRecipe = { initRecipe: initRecipe };
})();

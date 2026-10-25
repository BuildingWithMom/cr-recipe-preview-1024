/* Common Roots: the "Never use vegetable oil" preference toggle. */
(function () {
  'use strict';
  var track = window.CRState.track;
  var CRStateM = window.CRState;
  var getAuto = CRStateM.getAuto, setAuto = CRStateM.setAuto;
  var CRDomM = window.CRDom;
  var el = CRDomM.el;
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

  window.CRSubPref = { renderSubPref: renderSubPref };
})();

/* Common Roots: home page (recipe grid, filters). */
(function () {
  'use strict';
  var track = window.CRState.track;
  var CRStateM = window.CRState;
  var inPlan = CRStateM.inPlan, togglePlan = CRStateM.togglePlan;
  var CRSubPrefM = window.CRSubPref;
  var renderSubPref = CRSubPrefM.renderSubPref;
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

  window.CRPageHome = { initHome: initHome };
})();

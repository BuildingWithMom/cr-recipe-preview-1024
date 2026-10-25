/* Common Roots: local event counts page and the email sign-up stub. */
(function () {
  'use strict';
  var track = window.CRState.track, store = window.CRState.store;
  var CRDomM = window.CRDom;
  var el = CRDomM.el;
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
    var f = document.getElementById('signup-form');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = document.getElementById('su-email').value.trim(), msg = document.getElementById('signup-msg');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { msg.textContent = 'Please enter a valid email address.'; return; }
      // TODO: POST to a real email-list service. Preview: store locally only.
      var list = store.get('cr.signups', []); list.push({ email: v, at: new Date().toISOString() }); store.set('cr.signups', list);
      track('email_signup'); msg.textContent = 'Thanks! (Preview: saved in this browser only, nothing is sent anywhere.)'; f.reset();
    });
  }

  window.CRPageStats = { initSignup: initSignup, initStats: initStats };
})();

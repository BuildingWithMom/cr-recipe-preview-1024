/* Common Roots: privacy choice. A small banner (only when a collector endpoint is configured and no choice was made yet) and the controls on privacy.html.
 * Default is "this device only": nothing is sent anywhere. "Share anonymously" is only possible when an endpoint is configured. */
(function () {
  'use strict';
  var T = window.CRTelemetry, D = window.CRDom, page = window.CR_PAGE;

  function showBanner() {
    var bar = D.el('div', { class: 'consent', role: 'region', 'aria-label': 'Privacy choice' }, [
      D.el('p', { text: 'Help us fix bugs and improve Common Roots? We can send anonymous usage counts (no names, no ingredients you type, no personal data). You choose.' }),
      D.el('div', { class: 'consent-actions' }, [
        D.el('button', { type: 'button', class: 'btn small', id: 'consent-remote', text: 'Share anonymously', onclick: function () { T.setConsent('remote'); bar.remove(); } }),
        D.el('button', { type: 'button', class: 'btn small ghost', id: 'consent-local', text: 'Keep it on this device', onclick: function () { T.setConsent('local'); bar.remove(); } }),
        D.el('a', { href: 'privacy.html', text: 'Details' })
      ])
    ]);
    document.body.appendChild(bar);
  }

  function initPrivacy() {
    var status = document.getElementById('consent-status'), remote = document.getElementById('c-remote');
    var radios = document.querySelectorAll('input[name="consent"]');
    function sync() {
      var c = T.consent();
      radios.forEach(function (r) { r.checked = r.value === c; });
      status.textContent = 'Current choice: ' + (c === 'off' ? 'off (nothing is recorded)' : c === 'local' ? 'this device only (nothing is sent)' : 'share anonymously') + '.';
    }
    remote.disabled = !T.endpoint();
    document.getElementById('c-remote-note').hidden = !!T.endpoint();
    radios.forEach(function (r) { r.addEventListener('change', function () { T.setConsent(r.value); sync(); }); });
    document.getElementById('c-clear').addEventListener('click', function () { T.clearBuffer(); window.CRStorage.store.set('cr.events', {}); status.textContent = 'Deleted the usage log stored on this device.'; });
    sync();
  }

  if (T.needsBanner()) showBanner();
  if (page === 'privacy') initPrivacy();
})();

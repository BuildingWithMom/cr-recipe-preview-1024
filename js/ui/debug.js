/* Common Roots: debug.html (not linked from the site). Shows the local telemetry ring buffer, consent, flags; export and clear. Everything is read from this device. */
(function () {
  'use strict';
  var T = window.CRTelemetry, D = window.CRDom, F = window.CRFlags, cfg = window.CR_TELEMETRY_CONFIG;
  var root = document.getElementById('debug-root');

  function table(rows) {
    var tb = document.getElementById('dbg-rows'); tb.innerHTML = '';
    var q = document.getElementById('dbg-filter').value.trim().toLowerCase();
    rows.filter(function (e) { return !q || (e.k + ' ' + e.n + ' ' + JSON.stringify(e.p)).toLowerCase().indexOf(q) >= 0; }).reverse().forEach(function (e) {
      tb.appendChild(D.el('tr', { class: 'dbg-' + e.k }, [D.el('td', { text: new Date(e.t * 1000).toISOString().replace('T', ' ').slice(0, 19) }), D.el('td', { text: e.k + (e.l ? ':' + e.l : '') }),
        D.el('td', { text: e.n }), D.el('td', { text: JSON.stringify(e.p) })]));
    });
  }
  function render() {
    var buf = T.getBuffer();
    document.getElementById('dbg-meta').textContent = 'App ' + cfg.version + ' | session ' + T.sessionId() + ' | consent ' + T.consent() + ' | endpoint ' + (T.endpoint() || '(none)') + ' | queued ' + T.queued() + ' | entries ' + buf.length;
    table(buf);
    var fl = document.getElementById('dbg-flags'); fl.innerHTML = '';
    var all = F.all();
    Object.keys(all).forEach(function (k) {
      var cb = D.el('input', { type: 'checkbox', id: 'flag-' + k }); cb.checked = all[k];
      cb.addEventListener('change', function () { F.setOverride(k, cb.checked); render(); });
      fl.appendChild(D.el('label', { class: 'dbg-flag' }, [cb, ' ' + k]));
    });
    document.getElementById('dbg-level').value = T.level();
  }
  root.hidden = false;
  if (!F.isOn('debugPage')) { root.textContent = 'The debug page is switched off (flag debugPage).'; return; }
  document.getElementById('dbg-filter').addEventListener('input', render);
  document.getElementById('dbg-level').addEventListener('change', function (e) { window.CRStorage.store.set('cr.logLevel', e.target.value); render(); });
  document.getElementById('dbg-clear').addEventListener('click', function () { T.clearBuffer(); render(); });
  document.getElementById('dbg-refresh').addEventListener('click', render);
  document.getElementById('dbg-export').addEventListener('click', function () {
    var url = URL.createObjectURL(new Blob([T.exportJSON()], { type: 'application/json' }));
    var a = D.el('a', { href: url, download: 'common-roots-debug.json' }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  });
  render();
})();

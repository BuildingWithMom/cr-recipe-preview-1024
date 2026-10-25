/* Common Roots telemetry: browser wiring. Creates window.CRTelemetry (track, log, ...) from the real localStorage/sessionStorage/console/fetch,
 * installs the global error handlers and records one page_view. Config: data/telemetry-config.js (endpoint is empty by default). */
(function () {
  'use strict';
  var Lib = window.CRTelemetryLib, cfgIn = window.CR_TELEMETRY_CONFIG;
  var Flags = window.CRFlags;
  var cfg = Object.assign({ endpoint: '', ringSize: 300, flushAt: 10, flushMs: 10000, level: 'info', version: 'dev' }, cfgIn);
  if (!Flags.isOn('telemetry')) cfg.endpoint = '';

  var knownCache = null;
  function known() {
    if (knownCache) return knownCache;
    var k = { recipes: {}, items: {}, categories: {} };
    window.CR_RECIPES.forEach(function (r) {
      k.recipes[r.id] = 1; k.categories[r.category] = 1; if (r.sub) k.categories[r.sub] = 1;
      r.ingredients.forEach(function (i) { i.m.forEach(function (m) { k.items[m.item] = 1; }); });
    });
    var subs = window.CRLib.SUBS;
    Object.keys(subs).forEach(function (s) { k.items[s] = 1; subs[s].options.forEach(function (o) { k.items[o.id] = 1; }); });
    knownCache = k; return k;
  }
  var Store = window.CRStorage;
  var t = Lib.create({
    storage: Store.local(), session: Store.session(), config: cfg, known: known,
    now: function () { return Date.now(); },
    random: function () { return Math.random(); },
    console: window.console,
    page: function () { return window.CR_PAGE; },
    hidden: function () { return document.visibilityState === 'hidden'; },
    sendBeacon: function (u, b) { return window.navigator.sendBeacon(u, new Blob([b], { type: 'text/plain' })); },
    fetch: window.fetch.bind(window),
    setInterval: function (fn, ms) { return window.setInterval(fn, ms); }
  });
  t.install(window);
  window.CRTelemetry = t;
  t.track('page_view', { page: window.CR_PAGE });
})();

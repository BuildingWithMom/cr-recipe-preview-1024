/* Common Roots telemetry: structured logger, schema-checked events, error capture, local ring buffer, consent and a pluggable transport.
 * Privacy-first defaults: events and logs stay in this browser (localStorage ring buffer, viewable on debug.html). Nothing leaves the device unless
 * (a) a collector endpoint is configured in data/telemetry-config.js AND (b) the visitor chose "Share anonymously". Only events listed in
 * core/telemetry-schema.js are ever recorded; anything else is dropped. See docs/TELEMETRY.md.
 * create(env) takes every dependency (storage, clock, console, transport) so it is fully testable in Node; core/telemetry-boot.js wires the real browser. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var Schema = NODE ? require('./telemetry-schema.js') : root.CRTelemetrySchema;
  var Store = NODE ? require('./storage.js') : root.CRStorage;

  var LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
  var KEYS = { buffer: 'cr.telemetry', consent: 'cr.consent', level: 'cr.logLevel', counts: 'cr.events', sid: 'cr.sid' };
  var MAX_BYTES = 120000;

  function randomHex(rand, n) { var s = ''; while (s.length < n) s += Math.floor(rand() * 16).toString(16); return s; }

  function create(env) {
    var cfg = env.config;
    var ring = Math.max(1, cfg.ringSize || 300), flushAt = Math.max(1, cfg.flushAt || 10);
    var queue = [], inError = false, sid = null;

    function level() {
      var l = Store.rd(env.storage, KEYS.level, null) || cfg.level || 'info';
      return LEVELS[l] ? l : 'info';
    }
    function consent() { var c = Store.rd(env.storage, KEYS.consent, null); return c === 'off' || c === 'remote' ? c : 'local'; }
    function consentSet() { return Store.rd(env.storage, KEYS.consent, null) !== null; }
    function endpoint() { return typeof cfg.endpoint === 'string' && /^https:\/\//.test(cfg.endpoint) ? cfg.endpoint : ''; }
    function remoteAllowed() { return endpoint() !== '' && consent() === 'remote'; }
    function needsBanner() { return endpoint() !== '' && !consentSet(); }
    function sessionId() {
      if (sid) return sid;
      sid = Store.rd(env.session, KEYS.sid, null);
      if (typeof sid !== 'string' || !/^[a-f0-9]{16}$/.test(sid)) { sid = randomHex(env.random, 16); Store.wr(env.session, KEYS.sid, sid); }
      return sid;
    }

    /* ---- ring buffer (this device only) ---- */
    function getBuffer() { var b = Store.rd(env.storage, KEYS.buffer, []); return Array.isArray(b) ? b : []; }
    function push(entry) {
      var b = getBuffer(); b.push(entry);
      if (b.length > ring) b = b.slice(b.length - ring);
      while (b.length > 1 && JSON.stringify(b).length > MAX_BYTES) b.shift();
      Store.wr(env.storage, KEYS.buffer, b);
    }
    function clearBuffer() { Store.wr(env.storage, KEYS.buffer, []); }
    function exportJSON() {
      return JSON.stringify({ app: cfg.version || 'dev', session: sessionId(), consent: consent(), exported: Math.floor(env.now() / 1000), entries: getBuffer() }, null, 2);
    }

    /* ---- logger ---- */
    function log(lvl, msg, fields) {
      if (!LEVELS[lvl] || LEVELS[lvl] < LEVELS[level()]) return;
      var line = '[cr] ' + lvl + ' ' + msg;
      try { (env.console[lvl] || env.console.log).call(env.console, line, fields || {}); } catch (e) {}
      if (consent() !== 'off') push({ t: Math.floor(env.now() / 1000), k: 'log', l: lvl, n: String(msg).slice(0, 80), p: fields || {} });
    }

    /* ---- events ---- */
    function count(name) { var c = Store.rd(env.storage, KEYS.counts, {}); c[name] = (c[name] || 0) + 1; Store.wr(env.storage, KEYS.counts, c); }
    function record(name, props, kind) {
      if (consent() === 'off') return null;
      var v = Schema.validate(name, props, { known: env.known ? env.known() : null });   // callers only pass names that exist in the schema
      var entry = { t: Math.floor(env.now() / 1000), k: kind || 'event', n: v.name, p: v.props };
      push(entry);
      log('debug', 'event', { n: v.name, p: v.props });
      if (remoteAllowed()) { queue.push({ n: v.name, t: entry.t, p: v.props }); if (queue.length >= flushAt) flush(false); }
      return entry;
    }
    /** track('swap', {...}) with an old or new event name. The on-device counters (cr.events, shown on stats.html) keep the name the app used. */
    function track(name, props) {
      if (consent() === 'off') return null;
      count(name);
      var c = Schema.canonical(name, props);
      return c ? record(c.name, c.props) : null;
    }

    /* ---- errors ---- */
    function captureError(kind, info) {
      if (inError) return null;
      inError = true;
      try {
        return record('error', { kind: kind, message: info.message, stack: info.stack || '', source: info.source || '', line: info.line || 0, col: info.col || 0, page: env.page ? env.page() : 'home' }, 'error');
      } finally { inError = false; }
    }

    /* ---- transport ---- */
    function flush(final) {
      if (!queue.length || !remoteAllowed()) { if (!remoteAllowed()) queue = []; return false; }
      var body = JSON.stringify({ v: 1, sid: sessionId(), app: cfg.version || 'dev', events: queue.splice(0, queue.length) });
      var url = endpoint();
      try {
        if (final && env.sendBeacon && env.sendBeacon(url, body)) return true;
        if (env.fetch) { var p = env.fetch(url, { method: 'POST', body: body, headers: { 'content-type': 'text/plain' }, keepalive: true, mode: 'cors', credentials: 'omit' }); if (p && p.catch) p.catch(function () {}); return true; }
      } catch (e) { log('warn', 'telemetry send failed', {}); }
      return false;
    }

    function setConsent(choice) {
      if (choice !== 'off' && choice !== 'local' && choice !== 'remote') return false;
      if (choice === 'remote' && !endpoint()) choice = 'local';
      var prev = consent();
      Store.wr(env.storage, KEYS.consent, choice);
      if (choice !== 'remote') queue = [];
      if (choice === 'off') { clearBuffer(); Store.wr(env.storage, KEYS.counts, {}); }
      else if (choice !== prev) record('consent_changed', { choice: choice });
      return true;
    }

    /** Hook global handlers on a window-like object. */
    function install(win) {
      win.addEventListener('error', function (e) {
        captureError('error', { message: e && e.message, stack: e && e.error && e.error.stack, source: e && e.filename, line: e && e.lineno, col: e && e.colno });
      });
      win.addEventListener('unhandledrejection', function (e) {
        var r = e && e.reason;
        captureError('unhandledrejection', { message: r && r.message ? r.message : String(r), stack: r && r.stack });
      });
      win.addEventListener('pagehide', function () { flush(true); });
      win.addEventListener('visibilitychange', function () { if (env.hidden && env.hidden()) flush(true); });
      if (env.setInterval) env.setInterval(function () { flush(false); }, cfg.flushMs || 10000);
    }

    return { track: track, log: log, captureError: captureError, getBuffer: getBuffer, clearBuffer: clearBuffer, exportJSON: exportJSON,
      consent: consent, consentSet: consentSet, setConsent: setConsent, needsBanner: needsBanner, remoteAllowed: remoteAllowed, endpoint: endpoint,
      sessionId: sessionId, flush: flush, install: install, level: level, queued: function () { return queue.length; } };
  }

  var api = { create: create, LEVELS: LEVELS, KEYS: KEYS, MAX_BYTES: MAX_BYTES };
  if (NODE) module.exports = api; else root.CRTelemetryLib = api;
})(typeof window !== 'undefined' ? window : globalThis);

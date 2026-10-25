/* Common Roots: week export / import (JSON) and share-link encoding. Pure. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var CRWeekState = NODE ? require('./state.js') : root.CRWeekState;
  var normalize = CRWeekState.normalize, plannedCount = CRWeekState.plannedCount;
  /* ---------- export / import / share ---------- */
  function exportObject(state) {
    return { format: 'common-roots-week', v: 1, start: state.start, time: state.time, tz: state.tz, len: state.len, alarms: state.alarms,
      days: state.days.map(function (d) { return { pinned: d.pinned, items: d.items.map(function (x) { return { id: x.id, f: x.f }; }) }; }), pool: state.pool.map(function (x) { return { id: x.id, f: x.f }; }) };
  }
  function exportJSON(state) { return JSON.stringify(exportObject(state), null, 2); }
  function importJSON(text, recipes) {
    var o; try { o = JSON.parse(text); } catch (e) { return { ok: false, error: 'That is not valid JSON.' }; }
    if (!o || o.format !== 'common-roots-week') return { ok: false, error: 'This file is not a Common Roots week.' };
    var s = normalize(o, recipes);
    return { ok: true, state: s, count: plannedCount(s) };
  }
  function b64enc(str) {
    var b = typeof btoa === 'function' ? btoa(str) : Buffer.from(str, 'binary').toString('base64');
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64dec(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    return typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  }
  /** Compact share string for a URL hash: ids are ASCII so plain base64url of short JSON is enough. */
  function encodeShare(state) {
    var o = { v: 1, s: state.start, t: state.time, z: state.tz, l: state.len, a: [state.alarms.dinner ? 1 : 0, state.alarms.prep ? 1 : 0],
      d: state.days.map(function (d) { return [d.pinned ? 1 : 0, d.items.map(function (x) { return [x.id, x.f]; })]; }), p: state.pool.map(function (x) { return [x.id, x.f]; }) };
    return b64enc(JSON.stringify(o));
  }
  function decodeShare(str, recipes) {
    var o; try { o = JSON.parse(b64dec(String(str))); } catch (e) { return { ok: false, error: 'That share link could not be read.' }; }
    if (!o || o.v !== 1 || !Array.isArray(o.d)) return { ok: false, error: 'That share link could not be read.' };
    var full = { start: o.s, time: o.t, tz: o.z, len: o.l, alarms: { dinner: !o.a || o.a[0] !== 0, prep: !o.a || o.a[1] !== 0 },
      days: o.d.map(function (d) { return { pinned: d[0] === 1, items: (d[1] || []).map(function (x) { return { id: x[0], f: x[1] }; }) }; }), pool: (o.p || []).map(function (x) { return { id: x[0], f: x[1] }; }) };
    var s = normalize(full, recipes); return { ok: true, state: s, count: plannedCount(s) };
  }

  var api = { decodeShare: decodeShare, encodeShare: encodeShare, exportJSON: exportJSON, exportObject: exportObject, importJSON: importJSON };
  if (NODE) module.exports = api; else root.CRShare = api;
})(typeof window !== 'undefined' ? window : globalThis);

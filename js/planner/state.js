/* Common Roots: the week plan state (normalize, load/save, add/move/remove items). Pure; storage is passed in. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var CRDates = NODE ? require('./dates.js') : root.CRDates;
  var DEFAULT_TZ = CRDates.DEFAULT_TZ, KEY = CRDates.KEY, TZS = CRDates.TZS, addDays = CRDates.addDays, comingMonday = CRDates.comingMonday, pad = CRDates.pad, parseDate = CRDates.parseDate, parseTime = CRDates.parseTime;
  /* ---------- state ---------- */
  function emptyDays() { var a = []; for (var i = 0; i < 7; i++) a.push({ items: [], pinned: false }); return a; }
  function defaultState() {
    return { v: 1, start: null, time: '17:30', tz: DEFAULT_TZ, len: 60, alarms: { dinner: true, prep: true }, days: emptyDays(), pool: [] };
  }
  function cleanItem(it, byId) {
    if (!it || typeof it.id !== 'string' || !byId[it.id]) return null;
    var f = Number(it.f); if (!(f > 0 && f <= 20)) f = 1;
    return { id: it.id, f: Math.round(f * 1000) / 1000 };
  }
  /** Make any parsed object safe: unknown recipes dropped, bad fields replaced by defaults. */
  function normalize(o, recipes) {
    var byId = {}; (recipes || []).forEach(function (r) { byId[r.id] = r; });
    var s = defaultState(); if (!o || typeof o !== 'object') return s;
    if (parseDate(o.start)) s.start = o.start;
    if (parseTime(o.time)) { var t = parseTime(o.time); s.time = pad(t.h) + ':' + pad(t.mi); }
    if (typeof o.tz === 'string' && TZS[o.tz]) s.tz = o.tz;
    if ([30, 45, 60, 90, 120, 180].indexOf(Number(o.len)) >= 0) s.len = Number(o.len);
    if (o.alarms && typeof o.alarms === 'object') { s.alarms.dinner = o.alarms.dinner !== false; s.alarms.prep = o.alarms.prep !== false; }
    if (Array.isArray(o.days)) for (var i = 0; i < 7; i++) {
      var d = o.days[i]; if (!d || typeof d !== 'object') continue;
      s.days[i].pinned = d.pinned === true;
      (Array.isArray(d.items) ? d.items : []).forEach(function (it) { var c = cleanItem(it, byId); if (c && !s.days[i].items.some(function (x) { return x.id === c.id; })) s.days[i].items.push(c); });
    }
    (Array.isArray(o.pool) ? o.pool : []).forEach(function (it) { var c = cleanItem(it, byId); if (c && !s.pool.some(function (x) { return x.id === c.id; })) s.pool.push(c); });
    return s;
  }
  function load(storage, recipes) {
    try { var raw = storage.getItem(KEY); return normalize(raw ? JSON.parse(raw) : null, recipes); } catch (e) { return defaultState(); }
  }
  function save(storage, state) { try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; } }
  function weekStart(state, todayStr) { return state.start || comingMonday(todayStr); }
  function dayDate(state, i, todayStr) { return addDays(weekStart(state, todayStr), i); }
  function plannedCount(state) { return state.days.reduce(function (n, d) { return n + d.items.length; }, 0) + state.pool.length; }
  function allItems(state) { var a = []; state.days.forEach(function (d) { d.items.forEach(function (it) { a.push(it); }); }); state.pool.forEach(function (it) { a.push(it); }); return a; }
  function dayOf(state, id) { for (var i = 0; i < 7; i++) if (state.days[i].items.some(function (x) { return x.id === id; })) return i; return state.pool.some(function (x) { return x.id === id; }) ? 'pool' : -1; }

  /** day: 0..6 or 'auto' (= waiting for a day; "Order by freshness" or the shopper picks later). Adding an already-planned recipe to the same day is a no-op. */
  function addItem(state, id, day, f) {
    var item = { id: id, f: f > 0 ? f : 1 };
    if (day === 'auto' || day === 'pool') { if (!state.pool.some(function (x) { return x.id === id; })) state.pool.push(item); return state; }
    day = Number(day); if (!(day >= 0 && day <= 6)) return state;
    if (!state.days[day].items.some(function (x) { return x.id === id; })) state.days[day].items.push(item);
    return state;
  }
  function removeItem(state, where, id) {
    var arr = where === 'pool' ? state.pool : state.days[where].items;
    var i = arr.map(function (x) { return x.id; }).indexOf(id); if (i >= 0) arr.splice(i, 1); return state;
  }
  function moveItem(state, from, id, to) {
    var src = from === 'pool' ? state.pool : state.days[from].items, i = src.map(function (x) { return x.id; }).indexOf(id);
    if (i < 0) return state;
    var it = src[i];
    if (to === 'pool' || to === 'auto') { if (from === 'pool') return state; src.splice(i, 1); state.pool.push(it); return state; }
    to = Number(to); if (!(to >= 0 && to <= 6) || to === from) return state;
    src.splice(i, 1);
    if (!state.days[to].items.some(function (x) { return x.id === id; })) state.days[to].items.push(it);
    return state;
  }
  function setFactor(state, where, id, f) {
    var arr = where === 'pool' ? state.pool : state.days[where].items;
    arr.forEach(function (x) { if (x.id === id && f > 0) x.f = f; }); return state;
  }
  function setPinned(state, day, on) { state.days[day].pinned = !!on; return state; }
  function clearWeek(state) { state.days = emptyDays(); state.pool = []; return state; }

  /** Shopping-plan view of the week: unique recipe ids and the summed multiplier (cooking a dish twice buys twice). */
  function shoppingSelection(state) {
    var ids = [], f = {};
    allItems(state).forEach(function (it) { if (ids.indexOf(it.id) < 0) { ids.push(it.id); f[it.id] = 0; } f[it.id] += it.f; });
    ids.forEach(function (id) { f[id] = Math.round(f[id] * 1000) / 1000; });
    return { ids: ids, factors: f };
  }

  var api = { addItem: addItem, allItems: allItems, clearWeek: clearWeek, dayDate: dayDate, dayOf: dayOf, defaultState: defaultState, load: load, moveItem: moveItem, normalize: normalize, plannedCount: plannedCount, removeItem: removeItem, save: save, setFactor: setFactor, setPinned: setPinned, shoppingSelection: shoppingSelection, weekStart: weekStart };
  if (NODE) module.exports = api; else root.CRWeekState = api;
})(typeof window !== 'undefined' ? window : globalThis);

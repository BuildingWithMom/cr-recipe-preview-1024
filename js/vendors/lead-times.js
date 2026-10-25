/* Common Roots: vendor delivery days, order-by cutoffs, the one "shop on" day and per-dinner badges. Pure; Node + browser. Vendor facts live in data/vendors.js. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var W = NODE ? require('../week.js') : root.CRWeek;
  var VEND = NODE ? require('../../data/vendors.js') : root.CR_VENDORS;
  var CRStorageM = NODE ? require('../core/storage.js') : root.CRStorage;
  var isObj = CRStorageM.isObj;
  var KEYS = { src: 'cr.src', status: 'cr.status', orders: 'cr.orders', cfg: 'cr.vendorCfg', pantry: 'cr.pantry', pantryDone: 'cr.pantryDone', household: 'cr.household', custom: 'cr.customSwaps' };
  var VENDOR_IDS = ['walmart', 'tyner', 'market'];
  var SOURCE_CHOICES = ['walmart', 'tyner', 'market', 'elsewhere', 'have'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /* ---------- time ---------- */
  /** { date:'YYYY-MM-DD', time:'HH:MM' } for a JS Date, read in the BROWSER's local clock (the shopper's own device). */
  function nowOf(d) { d = d || new Date(); return { date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), time: pad(d.getHours()) + ':' + pad(d.getMinutes()) }; }
  function key(dt) { return dt.date + ' ' + dt.time; }
  function isPast(dt, now) { return key(dt) <= key(now); }
  function dayDiff(a, b) { return Math.round((Date.UTC.apply(null, ymd(b)) - Date.UTC.apply(null, ymd(a))) / 86400000); }   // b - a in days
  function ymd(s) { var p = String(s).split('-'); return [+p[0], +p[1] - 1, +p[2]]; }
  function clockLabel(t) { return W.fmtTime(t); }
  /** Human text for an order-by moment. Early-morning cutoffs read as the evening before ("Wed 1:00 AM (Tuesday night)"). */
  function fmtOrderBy(ob) {
    var s = W.fmtDate(ob.date) + ', ' + clockLabel(ob.time);
    if (ob.time < '06:00') s += ' (' + W.DAYS[(W.weekdayIdx(ob.date) + 6) % 7] + ' night)';
    return s;
  }
  /** The calendar day the shopper should actually sit down and order: a cutoff before 6 AM means the evening before. */
  function shopDay(ob) { return ob.time < '06:00' ? W.addDays(ob.date, -1) : ob.date; }

  /* ---------- vendor specs and the shopper's delivery settings ----------
   * cfg (cr.vendorCfg) = { tyner:{days:[1,3], cutoff:{daysBefore:2, time:'23:59'}|null}, market:{days:[3], cutoff:{...}|null}, walmart:{buffer:{...}} }  (all optional) */
  function cleanCutoff(c) {
    if (!isObj(c)) return null; var d = Number(c.daysBefore), t = String(c.time || '');
    if (!(d >= 0 && d <= 7) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return null;
    return { daysBefore: Math.floor(d), time: t };
  }
  function cleanDays(a) { if (!Array.isArray(a)) return null; var o = a.map(Number).filter(function (n, i, s) { return n >= 0 && n <= 6 && s.indexOf(n) === i; }).sort(); return o.length ? o : null; }
  function normalizeCfg(c) {
    var out = {}; if (!isObj(c)) return out;
    VENDOR_IDS.forEach(function (id) {
      var v = c[id]; if (!isObj(v)) return; var o = {};
      var d = cleanDays(v.days); if (d && id !== 'walmart') o.days = d;
      var k = cleanCutoff(v.cutoff); if (k) o.cutoff = k;
      if (Object.keys(o).length) out[id] = o;
    });
    return out;
  }
  /** The effective spec for a vendor: vendors.js plus any settings the shopper saved. cutoffKnown = false when only our planning buffer is in use. */
  function specFor(id, cfg) {
    var base = VEND.vendors[id]; if (!base) return null;
    var s = {}; Object.keys(base).forEach(function (k) { s[k] = base[k]; });
    var o = (cfg && cfg[id]) || {};
    if (o.days) s.arriveDays = o.days;
    if (o.cutoff) { s.cutoff = o.cutoff; s.cutoffUser = true; }
    s.cutoffKnown = !!s.cutoff;
    s.rule = s.cutoff || s.buffer || null;
    return s;
  }
  function daysLabel(spec) { return spec.arriveDays ? spec.arriveDays.map(function (i) { return W.SHORT[i]; }).join(' and ') : 'any day'; }
  function orderByFor(spec, arrive) {
    var r = spec.rule || { daysBefore: 1, time: '20:00' };
    return { date: W.addDays(arrive, -r.daysBefore), time: r.time, assumed: !spec.cutoffKnown };
  }

  /** Latest workable arrival of one vendor for a dinner on D.
   *  -> { ok:true, arrive, orderBy } | { ok:false, reason:'cutoff'|'shelf'|'none', arrive?, orderBy? }
   *  shelf = fridge days the ingredient keeps (null when not time-critical). Frozen vendors ignore it (they thaw before cooking). */
  function arrivalFor(spec, D, now, shelf) {
    var latest = W.addDays(D, -spec.lastArrivalOffset), a = latest, n = 0;
    if (spec.arriveDays) { while (spec.arriveDays.indexOf(W.weekdayIdx(a)) < 0 && n < 8) { a = W.addDays(a, -1); n++; } if (n >= 8) return { ok: false, reason: 'none' }; }
    var ob = orderByFor(spec, a);
    if (a < now.date || isPast(ob, now)) return { ok: false, reason: 'cutoff', arrive: a, orderBy: ob };
    if (!spec.frozen && shelf != null && dayDiff(a, D) > shelf) return { ok: false, reason: 'shelf', arrive: a, orderBy: ob };
    return { ok: true, arrive: a, orderBy: ob };
  }
  function reasonText(spec, r, D) {
    if (r.reason === 'cutoff') return spec.short + ' would arrive ' + W.fmtDate(r.arrive) + ', and its order deadline (' + fmtOrderBy(r.orderBy) + ') has passed.';
    if (r.reason === 'shelf') return spec.short + ' would arrive ' + W.fmtDate(r.arrive) + ', too long before ' + W.fmtDate(D) + ' for this to stay fresh.';
    return spec.short + ' has no delivery day before ' + W.fmtDate(D) + '.';
  }

  /** The main planner.
   * opts = { rows:[{item,label,amount}] (lines still to buy), vendorOf(item) -> 'walmart'|'tyner'|'market', forced(item) -> bool (the shopper chose the vendor: never auto-rerouted),
   *          dinners:{item:[dates]}, shelf(item) -> days|null, cfg, now:{date,time}, available(item, vendor) -> bool (vendor can actually supply it; default true) }
   * -> { lines:[{item,label,amount,vendor,asked,rerouted,arrive,orderBy,late,reason,suggestDay,neededBy,undated}], groups:[...], shopOn, autoReroutes:{item:vendor}, late:[...], undated:[...] } */
  function plan(opts) {
    var cfg = opts.cfg || {}, now = opts.now || nowOf(), lines = [], autoReroutes = {};
    (opts.rows || []).forEach(function (r) {
      var item = r.item, v = opts.vendorOf ? opts.vendorOf(item) : 'walmart', spec = specFor(v, cfg) || specFor('walmart', cfg);
      var dates = ((opts.dinners || {})[item] || []).filter(function (d) { return d >= now.date; }).sort(), D = dates[0] || null;
      var L = { item: item, label: r.label || item, amount: r.amount || '', vendor: v, asked: v, rerouted: null, arrive: null, orderBy: null, late: false, reason: '', suggestDay: null, neededBy: D, undated: !D, shelf: opts.shelf ? opts.shelf(item) : null, laterDinners: dates.slice(1) };
      if (D) {
        var res = arrivalFor(spec, D, now, L.shelf);
        if (!res.ok && v !== 'walmart' && !(opts.forced && opts.forced(item))) {
          var w = specFor('walmart', cfg), res2 = arrivalFor(w, D, now, L.shelf);
          if (res2.ok) { L.rerouted = { from: v, reason: reasonText(spec, res, D) }; L.vendor = 'walmart'; spec = w; autoReroutes[item] = 'walmart'; res = res2; }
        }
        if (res.ok) { L.arrive = res.arrive; L.orderBy = res.orderBy; }
        else { L.late = true; L.reason = reasonText(spec, res, D); L.arrive = res.arrive || null; L.orderBy = res.orderBy || null; }
      }
      lines.push(L);
    });
    // one Walmart order: its delivery is the earliest one any Walmart line needs; flag lines that would then wait too long
    var wl = lines.filter(function (l) { return l.vendor === 'walmart' && l.arrive && !l.late; });
    if (wl.length) {
      var wa = wl.reduce(function (m, l) { return l.arrive < m ? l.arrive : m; }, wl[0].arrive), wspec = specFor('walmart', cfg), wob = orderByFor(wspec, wa);
      wl.forEach(function (l) {
        l.ownArrive = l.arrive; l.arrive = wa; l.orderBy = wob;
        if (l.shelf != null && l.neededBy && dayDiff(wa, l.neededBy) > l.shelf) l.waitWarn = 'Arrives ' + W.fmtDate(wa) + ' but is for ' + W.fmtDate(l.neededBy) + ' (keeps about ' + l.shelf + ' day' + (l.shelf === 1 ? '' : 's') + '). Think about a second, later Walmart order for this one.';
      });
    }
    var late = lines.filter(function (l) { return l.late; }), undated = lines.filter(function (l) { return l.undated; });
    // suggestions for late lines: the first later dinner day on which the same vendor would work
    late.forEach(function (l) {
      var spec2 = specFor(l.vendor, cfg);
      for (var k = 1; k <= 8; k++) { var D2 = W.addDays(l.neededBy, k); if (arrivalFor(spec2, D2, now, l.shelf).ok) { l.suggestDay = D2; break; } }
    });
    // groups: vendor + delivery day
    var gmap = {}, order = [];
    lines.forEach(function (l) {
      if (l.late || l.undated || !l.arrive) return;
      var k = l.vendor + '|' + l.arrive;
      if (!gmap[k]) { gmap[k] = { key: k, vendor: l.vendor, arrive: l.arrive, orderBy: l.orderBy, lines: [] }; order.push(k); }
      gmap[k].lines.push(l);   // one vendor + one arrival day always means one deadline, so the group takes the first line's
    });
    var groups = order.map(function (k) { return gmap[k]; }).sort(function (a, b) { return key(a.orderBy) < key(b.orderBy) ? -1 : key(a.orderBy) > key(b.orderBy) ? 1 : 0; });
    groups.forEach(function (g) { g.assumed = !!g.orderBy.assumed; g.name = (specFor(g.vendor, cfg) || {}).name || g.vendor; });
    var shopOn = null;
    if (groups.length) { var first = groups[0]; shopOn = { date: shopDay(first.orderBy), orderBy: first.orderBy, vendor: first.vendor, today: shopDay(first.orderBy) <= now.date, groupKey: first.key }; }
    return { lines: lines, groups: groups, shopOn: shopOn, autoReroutes: autoReroutes, late: late, undated: undated, now: now };
  }

  /** Badge for each dinner day. days = [{ date, items:[ingredient item keys the dishes on that day use] }].
   *  -> { date, state:'ready'|'order'|'late'|'empty', orderBy?, text, suggestDay? } */
  function dayBadges(pl, days) {
    var by = {}; pl.lines.forEach(function (l) { by[l.item] = l; });
    return days.map(function (d) {
      if (!d.items || !d.items.length) return { date: d.date, state: 'empty', text: '' };
      var need = [];
      d.items.forEach(function (it) { if (by[it]) need.push(by[it]); });
      var lateL = need.filter(function (l) { return l.late; }), rer = need.filter(function (l) { return l.rerouted; });
      if (d.date < pl.now.date) return { date: d.date, state: 'empty', text: '' };
      if (lateL.length) {
        var sd = lateL.map(function (l) { return l.suggestDay; }).filter(Boolean).sort().pop() || null;
        return { date: d.date, state: 'late', text: 'Too late to order ' + lateL.map(function (l) { return l.label; }).slice(0, 2).join(' and ') + (lateL.length > 2 ? ' and ' + (lateL.length - 2) + ' more' : '') + ' for this day.' + (sd ? ' Moving it to ' + W.fmtDate(sd) + ' or later would work.' : ''), suggestDay: sd, late: lateL };
      }
      var timed = need.filter(function (l) { return l.orderBy; });
      if (!timed.length) return { date: d.date, state: 'ready', text: need.length ? 'No order deadline yet (add a day).' : 'Ready: everything is ordered, bought or on hand.' };
      var ob = timed.map(function (l) { return l.orderBy; }).sort(function (a, b) { return key(a) < key(b) ? -1 : 1; })[0];
      return { date: d.date, state: 'order', orderBy: ob, text: 'Order by ' + fmtOrderBy(ob) + (rer.length ? '. ' + rer.length + ' item' + (rer.length === 1 ? '' : 's') + ' moved to Walmart.' : ''), rerouted: rer.length };
    });
  }

  var api = { KEYS: KEYS, SOURCE_CHOICES: SOURCE_CHOICES, VENDOR_IDS: VENDOR_IDS, arrivalFor: arrivalFor, clockLabel: clockLabel, dayBadges: dayBadges, dayDiff: dayDiff, daysLabel: daysLabel, fmtOrderBy: fmtOrderBy, isPast: isPast, normalizeCfg: normalizeCfg, nowOf: nowOf, orderByFor: orderByFor, pad: pad, plan: plan, shopDay: shopDay, specFor: specFor };
  if (NODE) module.exports = api; else root.CRLeadTimes = api;
})(typeof window !== 'undefined' ? window : globalThis);

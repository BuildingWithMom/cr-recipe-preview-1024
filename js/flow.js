/* Common Roots: the one flow (Pick -> Days -> Cart). Pure logic, no DOM. Works in the browser (window.CRFlow) and in Node (tests).
 *
 * What lives here
 *   - vendor lead-time planning: for every shopping line, which vendor, which delivery day, the order-by moment, and ONE "shop on" day (the longest lead wins);
 *   - day badges for the planner (Ready / Order by ... / Too late, with the first day that would work);
 *   - the shopper's own bookkeeping, all on this device: where each line comes from (cr.src), line status (cr.status), "I placed this order" records (cr.orders),
 *     pantry answers (cr.pantry, cr.pantryDone), delivery settings (cr.vendorCfg), household servings (cr.household), manual swaps (cr.customSwaps);
 *   - cart-total honesty ("N of M items priced") and "you will have leftovers" labels;
 *   - shopping reminders for the calendar file.
 * We cannot see anyone's orders: every "bought" state is something the shopper told us.
 * Dates are plain 'YYYY-MM-DD' strings and times 'HH:MM', America/New_York wall-clock time; the arithmetic is calendar arithmetic, never Date-offset arithmetic. */
(function (root) {
  'use strict';
  var W = root.CRWeek || (typeof require !== 'undefined' ? require('./week.js') : null);
  var VEND = root.CR_VENDORS || (typeof require !== 'undefined' ? require('../data/vendors.js') : { vendors: {}, order: [] });

  var KEYS = { src: 'cr.src', status: 'cr.status', orders: 'cr.orders', cfg: 'cr.vendorCfg', pantry: 'cr.pantry', pantryDone: 'cr.pantryDone', household: 'cr.household', custom: 'cr.customSwaps' };
  var VENDOR_IDS = ['walmart', 'tyner', 'market'];
  var SOURCE_CHOICES = ['walmart', 'tyner', 'market', 'elsewhere', 'have'];

  /* ---------- tiny storage helpers (storage = anything with getItem/setItem) ---------- */
  function rd(storage, k, d) { try { var v = storage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function wr(storage, k, v) { try { storage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
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
    var base = (VEND.vendors || {})[id]; if (!base) return null;
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
      gmap[k].lines.push(l); if (key(l.orderBy) < key(gmap[k].orderBy)) gmap[k].orderBy = l.orderBy;
    });
    var groups = order.map(function (k) { return gmap[k]; }).sort(function (a, b) { return key(a.orderBy) < key(b.orderBy) ? -1 : key(a.orderBy) > key(b.orderBy) ? 1 : 0; });
    groups.forEach(function (g) { g.assumed = !!g.orderBy.assumed; g.name = (specFor(g.vendor, cfg) || {}).name || g.vendor; });
    var shopOn = null;
    if (groups.length) { var first = groups[0]; shopOn = { date: shopDay(first.orderBy), orderBy: first.orderBy, vendor: first.vendor, today: shopDay(first.orderBy) <= now.date, groupKey: first.key }; }
    return { lines: lines, groups: groups, shopOn: shopOn, autoReroutes: autoReroutes, late: late, undated: undated, now: now };
  }

  /** Badge for each dinner day. days = [{ date, items:[ingredient item keys the dishes on that day use] }].
   *  covered(item) -> 'ordered'|'bought'|'have'|null for lines no longer to buy.
   *  -> { date, state:'ready'|'order'|'late'|'empty', orderBy?, text, suggestDay? } */
  function dayBadges(pl, days, covered) {
    var by = {}; pl.lines.forEach(function (l) { by[l.item] = l; });
    return days.map(function (d) {
      if (!d.items || !d.items.length) return { date: d.date, state: 'empty', text: '' };
      var need = [], done = 0;
      d.items.forEach(function (it) { if (by[it]) need.push(by[it]); else if (covered && covered(it)) done++; });
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

  /* ---------- money honesty ---------- */
  function parsePrice(p) { if (p == null || p === '') return null; var m = /(\d+(?:\.\d+)?)/.exec(String(p)); return m ? Number(m[1]) : null; }
  /** lines = [{ price, qty }] for every line that will be bought (Walmart items, Tyner lines, Market Wagon lines with price null, unmapped lines with price null). */
  function priceStats(lines) {
    var total = 0, priced = 0;
    (lines || []).forEach(function (l) { var p = parsePrice(l.price); if (p != null) { priced++; total += p * (l.qty || 1); } });
    total = Math.round(total * 100) / 100;
    var m = (lines || []).length;
    return { priced: priced, lines: m, unpriced: m - priced, total: total,
      text: priced ? 'About $' + total.toFixed(2) + ' for the ' + priced + ' priced line' + (priced === 1 ? '' : 's') + '. ' + priced + ' of ' + m + ' lines have a price' + (m > priced ? ', so the real total will be higher' : '') + '.' : '0 of ' + m + ' lines have a price, so there is no total yet.' };
  }
  /** Quarter-pack text, e.g. 0.5 -> "1/2". */
  function fracText(x) { var q = Math.round(x * 4) / 4, w = Math.floor(q), r = q - w, f = r === 0.25 ? '1/4' : r === 0.5 ? '1/2' : r === 0.75 ? '3/4' : ''; return (w ? w + (f ? ' ' : '') : '') + f || '0'; }
  /** Label for a rounded-up package: what is bought, what is used, what is left. item = a CRWalmart.buildCart item with frac. */
  function leftoverNote(item) {
    if (!item || item.assumed || !(item.frac > 0) || !(item.qty >= 1)) return '';
    var left = item.qty - item.frac;
    if (left < 0.26) return '';
    if (item.frac < 0.125) return 'Buys ' + item.qty + ' (' + item.size + '): the recipes use only a small part of it, so most of the pack is left over.';
    return 'Buys ' + item.qty + ' (' + item.size + '): the recipes use about ' + fracText(item.frac) + ' of a pack' + (item.qty > 1 ? ' in total' : '') + ', so about ' + fracText(left) + ' pack' + (left > 1.01 ? 's' : '') + ' left over.';
  }

  /* ---------- the shopper's bookkeeping ---------- */
  function makeState(storage) {
    var S = {
      cfg: function () { return normalizeCfg(rd(storage, KEYS.cfg, {})); },
      setCfg: function (c) { return wr(storage, KEYS.cfg, normalizeCfg(c)); },
      src: function () { var m = rd(storage, KEYS.src, {}), o = {}; if (!isObj(m)) return o; Object.keys(m).forEach(function (k) { if (SOURCE_CHOICES.indexOf(m[k]) >= 0 || (isObj(m[k]) && m[k].v === 'elsewhere')) o[k] = m[k]; }); return o; },
      setSrc: function (item, v, where) { var m = S.src(); if (!v) delete m[item]; else m[item] = v === 'elsewhere' && where ? { v: 'elsewhere', where: String(where).slice(0, 60) } : v; return wr(storage, KEYS.src, m); },
      srcVendor: function (item) { var v = S.src()[item]; return isObj(v) ? v.v : (v || null); },
      status: function () { var m = rd(storage, KEYS.status, {}); return isObj(m) ? m : {}; },
      setStatus: function (item, s, extra) { var m = S.status(); if (!s) delete m[item]; else m[item] = Object.assign({ s: s, at: Date.now() }, extra || {}); return wr(storage, KEYS.status, m); },
      statusOf: function (item) { var x = S.status()[item]; return x && x.s ? x.s : null; },
      orders: function () { var m = rd(storage, KEYS.orders, {}); return isObj(m) ? m : {}; },
      /** Record "I placed this order" for a group { vendor, arrive, orderBy, lines:[{item,label}] }. Lines in `missing` stay to-buy with status 'oos'. */
      placeOrder: function (g, missing) {
        var os = S.orders(), n = 1, id; while (os[(id = g.vendor + '|' + (g.arrive || 'undated') + '|' + n)]) n++;
        var miss = missing || [], items = g.lines.map(function (l) { return l.item; }).filter(function (i) { return miss.indexOf(i) < 0; });
        os[id] = { id: id, vendor: g.vendor, arrive: g.arrive || null, placedAt: Date.now(), items: items, labels: g.lines.filter(function (l) { return items.indexOf(l.item) >= 0; }).map(function (l) { return l.label; }), received: false };
        wr(storage, KEYS.orders, os);
        items.forEach(function (i) { S.setStatus(i, 'ordered', { order: id, arrive: g.arrive || null, vendor: g.vendor }); });
        miss.forEach(function (i) { S.setStatus(i, 'oos', { vendor: g.vendor }); });
        return os[id];
      },
      /** "Did everything land?": items in `got` become bought; the rest of the order goes back to to-buy (status 'missing'). */
      receiveOrder: function (id, got) {
        var os = S.orders(), o = os[id]; if (!o) return false;
        o.received = true; o.receivedAt = Date.now(); o.got = got.slice();
        o.items.forEach(function (i) { if (got.indexOf(i) >= 0) S.setStatus(i, 'bought', { order: id, vendor: o.vendor }); else S.setStatus(i, 'missing', { order: id, vendor: o.vendor }); });
        return wr(storage, KEYS.orders, os);
      },
      cancelOrder: function (id) {
        var os = S.orders(), o = os[id]; if (!o) return false;
        o.items.forEach(function (i) { var st = S.status()[i]; if (st && st.order === id) S.setStatus(i, null); });
        delete os[id]; return wr(storage, KEYS.orders, os);
      },
      pantry: function () { var m = rd(storage, KEYS.pantry, {}); return isObj(m) ? m : {}; },     // { item: 'have' | 'need' }
      setPantry: function (item, v) { var m = S.pantry(); if (!v) delete m[item]; else m[item] = v === 'need' ? 'need' : 'have'; return wr(storage, KEYS.pantry, m); },
      pantryDone: function () { return rd(storage, KEYS.pantryDone, false) === true; },
      setPantryDone: function (b) { return wr(storage, KEYS.pantryDone, !!b); },
      household: function () { var n = Number(rd(storage, KEYS.household, 0)); return n >= 1 && n <= 24 ? Math.round(n) : 0; },      // 0 = recipes as written
      setHousehold: function (n) { n = Number(n); return wr(storage, KEYS.household, n >= 1 && n <= 24 ? Math.round(n) : 0); },
      custom: function () { var m = rd(storage, KEYS.custom, {}); return isObj(m) ? m : {}; },
      setCustom: function (item, def) { var m = S.custom(); if (!def) delete m[item]; else m[item] = def; return wr(storage, KEYS.custom, m); }
    };
    return S;
  }
  /** Orders whose delivery day has arrived and that the shopper has not closed out. */
  function dueArrivals(orders, now) {
    return Object.keys(orders || {}).map(function (k) { return orders[k]; }).filter(function (o) { return !o.received && o.arrive && o.arrive <= now.date; });
  }

  /* ---------- manual-swap presets (shown as quick picks; anything else is free text and carries the quantity 1:1) ---------- */
  var SWAP_PRESETS = {
    'ground turkey': [{ to: 'ground chicken', note: '' }],
    'roasted chicken': [{
      to: 'chicken breast', conv: { fam: 'wt', perUnit: 24 },
      match: '(?:[\\d\\s&/.\u00bc-\u00be\u2150-\u215e]+(?:\\(\\d+\\s*lbs?\\)\\s*)?)?\\b(?:roasted|rotisserie) chickens?\\b', textTo: 'chicken breasts, cooked and shredded (instead of rotisserie chicken; amount is on your shopping list)',
      note: 'Cook the chicken breasts first (simmer or bake until cooked through), shred them, then follow the recipe. Adjust the cooking time yourself.',
      basis: 'About 24 oz of raw boneless breast per rotisserie chicken: a rotisserie chicken gives roughly 3 to 4 cups of shredded meat and 1 lb of raw breast about 2 to 3 cups (from our substitutes notes); we use the low end of both so you do not run short.' }]
  };
  function presetsFor(item) { return SWAP_PRESETS[item] || []; }

  /* ---------- calendar reminders ---------- */
  /** From the order groups (unplaced, with deadlines) and the placed orders -> reminder events for the .ics file. All times are floating wall-clock times in the plan's time zone. */
  function reminders(groups, placed, opts) {
    opts = opts || {}; var out = [];
    (groups || []).forEach(function (g) {
      var ob = g.orderBy; if (!ob) return;
      var at = ob.time >= '18:00' ? { date: ob.date, time: '18:00' } : ob.time < '06:00' ? { date: W.addDays(ob.date, -1), time: '18:00' } : { date: ob.date, time: pad(Math.max(6, +ob.time.slice(0, 2) - 2)) + ':' + ob.time.slice(3) };
      var items = g.lines.map(function (l) { return l.label + (l.amount ? ' (' + l.amount + ')' : ''); });
      out.push({ kind: 'order', uid: 'cr-order-' + g.vendor + '-' + g.arrive + '@common-roots.preview', date: at.date, time: at.time, mins: 15,
        summary: 'Order ' + g.name + ' groceries by ' + clockLabel(ob.time) + (ob.time < '06:00' ? ' (tonight)' : ''),
        description: 'Common Roots shopping reminder.\nOrder from ' + g.name + ' by ' + fmtOrderBy(ob) + ', for delivery ' + W.fmtDate(g.arrive) + '.' + (ob.assumed ? '\nThis deadline is our planning allowance, not ' + g.name + '\u2019s own rule. Confirm at checkout.' : '') + '\nItems (' + items.length + '): ' + items.join('; ') + '.' });
    });
    var arrivals = {};
    (groups || []).forEach(function (g) { arrivals[g.vendor + '|' + g.arrive] = { vendor: g.vendor, name: g.name, arrive: g.arrive, n: g.lines.length, placed: false }; });
    (placed || []).forEach(function (o) { if (o.arrive && !o.received) arrivals[o.vendor + '|' + o.arrive] = { vendor: o.vendor, name: (VEND.vendors[o.vendor] || {}).name || o.vendor, arrive: o.arrive, n: (o.items || []).length, placed: true }; });
    Object.keys(arrivals).forEach(function (k) {
      var a = arrivals[k];
      out.push({ kind: 'arrive', uid: 'cr-arrive-' + a.vendor + '-' + a.arrive + '@common-roots.preview', date: a.arrive, allDay: true,
        summary: a.name + ' delivery day' + (a.vendor === 'walmart' ? ' (pickup or delivery)' : ''),
        description: 'Common Roots reminder: ' + a.name + ' is due on ' + W.fmtDate(a.arrive) + ' (' + a.n + ' item' + (a.n === 1 ? '' : 's') + (a.placed ? ', order placed' : ', if you place the order') + '). Open the Cart step in Common Roots and tick off what landed; anything missing goes back on your list. We cannot see your orders; this is only a reminder.' });
    });
    return out;
  }

  var api = { KEYS: KEYS, VENDOR_IDS: VENDOR_IDS, SOURCE_CHOICES: SOURCE_CHOICES, nowOf: nowOf, isPast: isPast, dayDiff: dayDiff, fmtOrderBy: fmtOrderBy, shopDay: shopDay,
    normalizeCfg: normalizeCfg, specFor: specFor, daysLabel: daysLabel, orderByFor: orderByFor, arrivalFor: arrivalFor, plan: plan, dayBadges: dayBadges,
    parsePrice: parsePrice, priceStats: priceStats, fracText: fracText, leftoverNote: leftoverNote, makeState: makeState, dueArrivals: dueArrivals,
    SWAP_PRESETS: SWAP_PRESETS, presetsFor: presetsFor, reminders: reminders };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CRFlow = api;
})(typeof window !== 'undefined' ? window : globalThis);

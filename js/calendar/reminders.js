/* Common Roots: order-by and delivery-day reminder events for the calendar file. Pure. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var CRLeadTimes = NODE ? require('../vendors/lead-times.js') : root.CRLeadTimes;
  var clockLabel = CRLeadTimes.clockLabel, fmtOrderBy = CRLeadTimes.fmtOrderBy, pad = CRLeadTimes.pad;
  var W = NODE ? require('../week.js') : root.CRWeek;
  var VEND = NODE ? require('../../data/vendors.js') : root.CR_VENDORS;
  /* ---------- calendar reminders ---------- */
  /** From the order groups (unplaced, with deadlines) and the placed orders -> reminder events for the .ics file. All times are floating wall-clock times in the plan's time zone. */
  function reminders(groups, placed) {
    var out = [];
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

  var api = { reminders: reminders };
  if (NODE) module.exports = api; else root.CRReminders = api;
})(typeof window !== 'undefined' ? window : globalThis);

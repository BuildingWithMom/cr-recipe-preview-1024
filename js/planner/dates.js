/* Common Roots: calendar-date and time-zone helpers (plain YYYY-MM-DD arithmetic, US DST rules). Pure. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var KEY = 'cr.week';
  var DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DEFAULT_TZ = 'America/Indiana/Indianapolis';
  var CENTER = ['Main dish', 'Soup', 'Breakfast'];

  /* ---------- time zones (US rules in force since 2007; the ICS carries a matching VTIMEZONE) ---------- */
  var TZS = {
    'America/Indiana/Indianapolis': { label: 'Indiana (Eastern)', std: ['EST', '-0500'], dst: ['EDT', '-0400'] },
    'America/New_York': { label: 'Eastern', std: ['EST', '-0500'], dst: ['EDT', '-0400'] },
    'America/Chicago': { label: 'Central', std: ['CST', '-0600'], dst: ['CDT', '-0500'] },
    'America/Denver': { label: 'Mountain', std: ['MST', '-0700'], dst: ['MDT', '-0600'] },
    'America/Phoenix': { label: 'Arizona (no daylight time)', std: ['MST', '-0700'], dst: null },
    'America/Los_Angeles': { label: 'Pacific', std: ['PST', '-0800'], dst: ['PDT', '-0700'] },
    'floating': { label: 'Floating (uses each device\u2019s own time zone)', floating: true }
  };

  /* ---------- calendar-date helpers ---------- */
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3], dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }
  function toDayNum(s) { var p = parseDate(s); return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86400000); }
  function fromDayNum(n) { var d = new Date(n * 86400000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function addDays(s, n) { return fromDayNum(toDayNum(s) + n); }
  function weekdayIdx(s) { var p = parseDate(s); return (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7; }   // 0 = Monday
  function localDateStr(now) { now = now || new Date(); return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()); }
  /** The Monday on or after the given day (today if it is a Monday). */
  function comingMonday(todayStr) { var i = weekdayIdx(todayStr); return i === 0 ? todayStr : addDays(todayStr, 7 - i); }
  function fmtDate(s) { var p = parseDate(s); return SHORT[weekdayIdx(s)] + ', ' + MONTHS[p.m - 1] + ' ' + p.d; }
  function fmtDateLong(s) { var p = parseDate(s); return DAYS[weekdayIdx(s)] + ', ' + MONTHS[p.m - 1] + ' ' + p.d + ', ' + p.y; }
  function compactDate(s) { return s.replace(/-/g, ''); }
  function parseTime(t) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); if (!m || +m[1] > 23 || +m[2] > 59) return null; return { h: +m[1], mi: +m[2] }; }
  function fmtTime(t) { var p = parseTime(t) || { h: 17, mi: 30 }; var h12 = p.h % 12 === 0 ? 12 : p.h % 12; return h12 + ':' + pad(p.mi) + ' ' + (p.h < 12 ? 'AM' : 'PM'); }
  /** date + 'HH:MM' + minutes -> {date, time} with day rollover (wall-clock arithmetic, DST-free by design). */
  function addMinutes(dateStr, time, mins) {
    var p = parseTime(time), total = p.h * 60 + p.mi + mins, dayShift = Math.floor(total / 1440), rem = total - dayShift * 1440;
    return { date: addDays(dateStr, dayShift), time: pad(Math.floor(rem / 60)) + ':' + pad(rem % 60) };
  }
  function dtLocal(dateStr, time) { var p = parseTime(time); return compactDate(dateStr) + 'T' + pad(p.h) + pad(p.mi) + '00'; }
  function dtUtc(d) { return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'; }

  var api = { CENTER: CENTER, DAYS: DAYS, DEFAULT_TZ: DEFAULT_TZ, KEY: KEY, SHORT: SHORT, TZS: TZS, addDays: addDays, addMinutes: addMinutes, comingMonday: comingMonday, compactDate: compactDate, dtLocal: dtLocal, dtUtc: dtUtc, fmtDate: fmtDate, fmtDateLong: fmtDateLong, fmtTime: fmtTime, localDateStr: localDateStr, pad: pad, parseDate: parseDate, parseTime: parseTime, weekdayIdx: weekdayIdx };
  if (NODE) module.exports = api; else root.CRDates = api;
})(typeof window !== 'undefined' ? window : globalThis);

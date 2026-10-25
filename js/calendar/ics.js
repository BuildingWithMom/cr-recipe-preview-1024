/* Common Roots: recipe-card text, .ics calendar file and Google Calendar template links. Generates files and links only; never writes to a calendar. Pure. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var CRDates = NODE ? require('../planner/dates.js') : root.CRDates;
  var TZS = CRDates.TZS, addDays = CRDates.addDays, addMinutes = CRDates.addMinutes, compactDate = CRDates.compactDate, dtLocal = CRDates.dtLocal, dtUtc = CRDates.dtUtc, fmtDateLong = CRDates.fmtDateLong, fmtTime = CRDates.fmtTime, localDateStr = CRDates.localDateStr, parseDate = CRDates.parseDate;
  var CRWeekState = NODE ? require('../planner/state.js') : root.CRWeekState;
  var dayDate = CRWeekState.dayDate;
  var CRFreshness = NODE ? require('../planner/freshness.js') : root.CRFreshness;
  var byIdOf = CRFreshness.byIdOf, dayNote = CRFreshness.dayNote, servesText = CRFreshness.servesText;
  var CRPairing = NODE ? require('../planner/pairing.js') : root.CRPairing;
  var suggestPairings = CRPairing.suggestPairings;
  var CRVideo = NODE ? require('../planner/video.js') : root.CRVideo;
  var videoUrlOf = CRVideo.videoUrlOf;
  /* ---------- recipe card text ---------- */
  function recipeUrl(ctx, id) { return (ctx.baseUrl || '') + 'recipes/' + id + '.html'; }
  /** One dish as card data: scaled ingredients (with the active swaps applied), numbered steps, urls. */
  function dishCard(ctx, id, f) {
    var L = ctx.L, sw = ctx.swaps || {}, r = byIdOf(ctx)[id]; if (!r) return null;
    var video = ctx.videos && ctx.videos[r.id] ? videoUrlOf(ctx.videos[r.id]) : null;
    var changes = [], seenCh = {};
    if (ctx.manual) r.ingredients.forEach(function (ing) { (ing.m || []).forEach(function (m) {
      var c = ctx.manual[m.item]; if (!c || seenCh[m.item]) return; seenCh[m.item] = 1;
      changes.push({ from: m.item, to: c.to, note: c.note || '', timeNote: c.timeNote || '' });
    }); });
    return {
      changes: changes,
      id: r.id, title: r.title, serves: servesText(r, f, L), f: f, category: r.category, source: r.source,
      ingredients: r.ingredients.map(function (ing) { return { group: ing.group || null, text: L.swapText(L.scaleText(ing.text, f), sw) }; }),
      steps: r.steps.map(function (st) { return L.swapText(L.scaleStep(st, f).replace(/\[\[|\]\]/g, ''), sw); }),
      tips: r.tips || [], url: recipeUrl(ctx, r.id), video: video, scaled: Math.abs(f - 1) > 0.001
    };
  }
  /** The recipe card for one planned day: structured data plus a plain-text rendering. */
  function dayCard(ctx, state, dayIdx, todayStr) {
    var date = dayDate(state, dayIdx, todayStr), items = state.days[dayIdx].items;
    var dishes = items.map(function (it) { return dishCard(ctx, it.id, it.f); }).filter(Boolean);
    var pair = suggestPairings(ctx, state, dayIdx), note = dayNote(ctx, dayIdx, items);
    var titles = dishes.map(function (d) { return d.title; });
    var prep = [];
    if (state.alarms && state.alarms.prep) dishes.forEach(function (d) { var p = ctx.fresh.prep[d.id]; if (p) prep.push({ id: d.id, title: d.title, lead: p.lead, label: p.label, basis: p.basis }); });
    var card = { dayIdx: dayIdx, date: date, time: state.time, dishes: dishes, titles: titles, summary: 'Dinner: ' + titles.join(' + '), pairing: pair, freshness: note, prep: prep };
    card.text = cardText(card, state);
    return card;
  }
  function cardText(card) {
    var o = [];
    o.push('COMMON ROOTS \u00b7 MY WEEK');
    o.push(fmtDateLong(card.date) + ', dinner at ' + fmtTime(card.time));
    o.push('Menu: ' + card.titles.join(' + '));
    card.dishes.forEach(function (d) {
      o.push(''); o.push('== ' + d.title.toUpperCase() + ' (' + d.serves + ') ==');
      o.push('INGREDIENTS' + (d.scaled ? ' (scaled to ' + d.serves.toLowerCase() + ')' : ''));
      var g = null; d.ingredients.forEach(function (i) { if (i.group && i.group !== g) { o.push(i.group + ':'); } g = i.group; o.push('- ' + i.text); });
      o.push('METHOD'); d.steps.forEach(function (s, k) { o.push((k + 1) + '. ' + s); });
      if (d.changes && d.changes.length) {
        o.push('YOUR CHANGES');
        d.changes.forEach(function (c) { o.push('- Using ' + c.to + ' instead of ' + c.from + '.' + (c.note ? ' ' + c.note : '')); if (c.timeNote) o.push('  Time: ' + c.timeNote); });
      }
      if (d.tips.length) { o.push('GOOD TO KNOW'); d.tips.forEach(function (t) { o.push('- ' + t); }); }
      o.push('Recipe: ' + d.url);
      if (d.video) o.push('Video: ' + d.video);
    });
    o.push('');
    if (card.pairing.text) o.push(card.pairing.text);
    if (card.freshness.level === 'first' || card.freshness.level === 'warn') o.push('FRESHNESS: ' + card.freshness.text);
    if (card.prep.length) { o.push('START AHEAD (from the recipe text):'); card.prep.forEach(function (p) { o.push('- ' + p.title + ': ' + p.basis); }); }
    o.push('Freshness numbers assume you buy fresh at the start of the week; freezing extends it.');
    return o.join('\n');
  }

  /* ---------- ICS ---------- */
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n'); }
  var enc = new TextEncoder();   // browsers and Node 20+ all have it
  function byteLen(ch) { return enc.encode(ch).length; }
  /** Fold one content line to at most 75 octets per physical line (RFC 5545 3.1), never splitting a UTF-8 character. */
  function foldLine(line) {
    var out = [], cur = '', n = 0, limit = 75;
    for (var ch of line) {
      var b = byteLen(ch);
      if (n + b > limit) { out.push(cur); cur = ''; n = 1; limit = 75; cur = ''; /* the leading space counts as one octet */ }
      cur += ch; n += b;
    }
    out.push(cur);
    return out.map(function (s, i) { return i === 0 ? s : ' ' + s; }).join('\r\n');
  }
  function triggerOf(mins) { var h = Math.floor(mins / 60), m = mins % 60; return '-PT' + (h ? h + 'H' : '') + (m ? m + 'M' : (h ? '' : '0M')); }
  function vtimezone(tzid) {
    var z = TZS[tzid]; if (!z || z.floating) return [];
    var o = ['BEGIN:VTIMEZONE', 'TZID:' + tzid, 'X-LIC-LOCATION:' + tzid];
    if (z.dst) {
      o.push('BEGIN:DAYLIGHT', 'DTSTART:20070311T020000', 'TZOFFSETFROM:' + z.std[1], 'TZOFFSETTO:' + z.dst[1], 'TZNAME:' + z.dst[0], 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT');
      o.push('BEGIN:STANDARD', 'DTSTART:20071104T020000', 'TZOFFSETFROM:' + z.dst[1], 'TZOFFSETTO:' + z.std[1], 'TZNAME:' + z.std[0], 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD');
    } else {
      o.push('BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:' + z.std[1], 'TZOFFSETTO:' + z.std[1], 'TZNAME:' + z.std[0], 'END:STANDARD');
    }
    o.push('END:VTIMEZONE'); return o;
  }
  function uidOf(dateStr) { return 'cr-meal-' + compactDate(dateStr) + '@common-roots.preview'; }
  /** One .ics for the week: one VEVENT per planned day. Pass opts.now (a Date) for a deterministic DTSTAMP in tests. */
  function buildICS(ctx, state, opts) {
    opts = opts || {};
    var today = opts.today || localDateStr(opts.now), stamp = dtUtc(opts.now || new Date());
    var floating = !!(TZS[state.tz] && TZS[state.tz].floating), tzp = floating ? '' : ';TZID=' + state.tz;
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Common Roots//My week//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsEscape('Common Roots: my week')];
    if (!floating) lines = lines.concat(vtimezone(state.tz));
    var n = 0;
    for (var i = 0; i < 7; i++) {
      if (!state.days[i].items.length) continue;
      var c = dayCard(ctx, state, i, today); n++;
      var end = addMinutes(c.date, state.time, state.len);
      lines.push('BEGIN:VEVENT', 'UID:' + uidOf(c.date), 'DTSTAMP:' + stamp,
        'DTSTART' + tzp + ':' + dtLocal(c.date, state.time), 'DTEND' + tzp + ':' + dtLocal(end.date, end.time),
        'SUMMARY:' + icsEscape(c.summary), 'DESCRIPTION:' + icsEscape(c.text),
        'CATEGORIES:' + icsEscape('Common Roots') + ',' + icsEscape('Dinner'), 'SEQUENCE:0', 'STATUS:CONFIRMED', 'TRANSP:OPAQUE');
      if (c.dishes[0]) lines.push('URL:' + c.dishes[0].url);
      if (state.alarms.dinner) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape('Dinner in 1 hour: ' + c.titles.join(' + ')), 'TRIGGER:-PT1H', 'END:VALARM');
      c.prep.forEach(function (p) {
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(p.label + ': ' + p.title + '. ' + p.basis), 'TRIGGER:' + triggerOf(p.lead), 'END:VALARM');
      });
      lines.push('END:VEVENT');
    }
    (opts.reminders || []).forEach(function (rm) {
      if (!rm || !parseDate(rm.date)) return;
      var ev = ['BEGIN:VEVENT', 'UID:' + rm.uid, 'DTSTAMP:' + stamp];
      if (rm.allDay) { ev.push('DTSTART;VALUE=DATE:' + compactDate(rm.date), 'DTEND;VALUE=DATE:' + compactDate(addDays(rm.date, 1)), 'TRANSP:TRANSPARENT'); }
      else { var e2 = addMinutes(rm.date, rm.time, rm.mins || 15); ev.push('DTSTART' + tzp + ':' + dtLocal(rm.date, rm.time), 'DTEND' + tzp + ':' + dtLocal(e2.date, e2.time), 'TRANSP:TRANSPARENT'); }
      ev.push('SUMMARY:' + icsEscape(rm.summary), 'DESCRIPTION:' + icsEscape(rm.description), 'CATEGORIES:' + icsEscape('Common Roots') + ',' + icsEscape('Shopping'), 'SEQUENCE:0', 'STATUS:CONFIRMED');
      if (rm.allDay) ev.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(rm.summary), 'TRIGGER:PT9H', 'END:VALARM');
      else ev.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(rm.summary), 'TRIGGER:PT0S', 'END:VALARM');
      ev.push('END:VEVENT'); lines = lines.concat(ev); n++;
    });
    if (!n) return null;
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
  }

  /* ---------- Google Calendar link ---------- */
  var GCAL = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  /** A template link for one day. The details are cut to keep the whole URL under maxLen; recipe links are always kept so the full card is one tap away. */
  function gcalUrl(ctx, state, dayIdx, opts) {
    opts = opts || {}; var maxLen = opts.maxLen || 1900, today = opts.today || localDateStr(opts.now);
    var c = dayCard(ctx, state, dayIdx, today), end = addMinutes(c.date, state.time, state.len), floating = !!(TZS[state.tz] && TZS[state.tz].floating);
    var base = GCAL + '&text=' + encodeURIComponent(c.summary) + '&dates=' + dtLocal(c.date, state.time) + '/' + dtLocal(end.date, end.time) + (floating ? '' : '&ctz=' + encodeURIComponent(state.tz));
    var must = ['Menu: ' + c.titles.join(' + ') + ' (dinner at ' + fmtTime(c.time) + ')'];
    if (c.pairing.text) must.push(c.pairing.text);
    if (c.freshness.level === 'first' || c.freshness.level === 'warn') must.push('Freshness: ' + c.freshness.text);
    c.dishes.forEach(function (d) { d.changes.forEach(function (ch) { must.push('Your change: ' + ch.to + ' instead of ' + ch.from + (ch.timeNote ? '. Time: ' + ch.timeNote : '')); }); });
    var links = c.dishes.map(function (d) { return d.title + ' full recipe: ' + d.url + (d.video ? '\nVideo: ' + d.video : ''); });
    var extra = [];
    c.dishes.forEach(function (d) {
      extra.push('', d.title + ' (' + d.serves + ')', 'Ingredients:'); d.ingredients.forEach(function (i) { extra.push('- ' + i.text); });
      extra.push('Method:'); d.steps.forEach(function (s, k) { extra.push((k + 1) + '. ' + s); });
      d.changes.forEach(function (c) { extra.push('Your change: using ' + c.to + ' instead of ' + c.from + '.' + (c.note ? ' ' + c.note : '') + (c.timeNote ? ' Time: ' + c.timeNote : '')); });
    });
    function make(nExtra) {
      var body = must.concat([''], extra.slice(0, nExtra));
      var txt = body.join('\n');
      txt += (nExtra < extra.length ? '\n\u2026 (card shortened)' : '');
      txt += '\n\n' + links.join('\n');
      return txt;
    }
    var n = extra.length, details = make(n), url;
    function build(d) { return base + '&details=' + encodeURIComponent(d); }
    url = build(details);
    while (url.length > maxLen && n > 0) { n = Math.max(0, n - Math.max(1, Math.floor(n / 8))); details = make(n); url = build(details); }
    if (url.length > maxLen) { details = must[0] + '\n\n' + links.join('\n'); url = build(details); }
    if (url.length > maxLen) { // last resort: first recipe link only
      details = must[0] + '\n' + links[0].split('\n')[0]; url = build(details);
    }
    return url;
  }

  var api = { buildICS: buildICS, cardText: cardText, dayCard: dayCard, dishCard: dishCard, foldLine: foldLine, gcalUrl: gcalUrl, icsEscape: icsEscape, triggerOf: triggerOf, uidOf: uidOf, vtimezone: vtimezone };
  if (NODE) module.exports = api; else root.CRIcs = api;
})(typeof window !== 'undefined' ? window : globalThis);

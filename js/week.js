/* Common Roots: "My week" logic. Pure functions, no DOM. Works in the browser (window.CRWeek) and in Node (tests).
 * State shape (saved by the page as JSON in localStorage key "cr.week"):
 *   { v:1, start:'YYYY-MM-DD'|null, time:'HH:MM', tz:'America/Indiana/Indianapolis'|'floating'|..., len:60,
 *     alarms:{dinner:true, prep:true}, days:[{items:[{id,f}], pinned:false} x7 (Mon..Sun)], pool:[{id,f}] }
 * f is the same servings multiplier as the plan page uses (1 = the recipe as written).
 * Dates are plain calendar arithmetic on 'YYYY-MM-DD' strings, so daylight-saving changes cannot shift a day. */
(function (root) {
  'use strict';
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

  /* ---------- recipe helpers ---------- */
  function byIdOf(ctx) { if (!ctx._by) { ctx._by = {}; ctx.recipes.forEach(function (r) { ctx._by[r.id] = r; }); } return ctx._by; }
  function servesText(r, f, L) {
    var q = function (x) { return L && L.fmtQty ? L.fmtQty(x) : String(Math.round(x * 10) / 10).replace(/\.0$/, ''); };
    return r.servings ? 'Serves ' + q(r.servings * f) : 'Makes ' + r.yield + ' servings' + (Math.abs(f - 1) > 0.001 ? ' \u00d7 ' + q(f) : '');
  }
  function slotOf(r) {
    if (r.category === 'Salad') return 'salad';
    if (r.category === 'Side') { if (r.sub === 'Vegetable') return 'vegetable'; if (r.sub === 'Pasta' || r.sub === 'Rice & noodles') return 'starch'; return 'side'; }
    return null;
  }
  var SLOT_LABEL = { vegetable: 'a vegetable side', starch: 'a rice, noodle or pasta side', salad: 'a salad', side: 'a side' };
  function isCenter(r) { return CENTER.indexOf(r.category) >= 0; }
  function hashStr(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

  /* ---------- freshness ---------- */
  function rangeText(e) { return e.min === e.max ? e.min + (e.min === 1 ? ' day' : ' days') : e.min + '\u2013' + e.max + ' days'; }
  /** Perishable ingredients of a recipe from the shelf-life table (optional ingredients skipped), shortest first. */
  function perishables(r, fresh) {
    var seen = {}, out = [];
    r.ingredients.forEach(function (ing) {
      (ing.m || []).forEach(function (m) {
        var e = fresh.items[m.item];
        if (!e || m.optional || seen[m.item]) return;
        seen[m.item] = true; out.push({ item: m.item, label: e.label, group: e.group, min: e.min, max: e.max, kind: e.kind, minor: !!e.minor });
      });
    });
    out.sort(function (a, b) { return a.min - b.min; });
    return out;
  }
  /** use-by score = shortest conservative shelf life (days) among the recipe's significant (non-garnish) perishables; Infinity when none. */
  function recipeScore(r, fresh) {
    var p = perishables(r, fresh), sig = p.filter(function (x) { return !x.minor; });
    var lim = sig[0] || null;
    return { score: lim ? lim.min : Infinity, limiting: lim, perishables: p };
  }
  function dayScore(ctx, items) {
    var best = { score: Infinity, limiting: null, id: null };
    items.forEach(function (it) { var r = byIdOf(ctx)[it.id]; if (!r) return; var s = recipeScore(r, ctx.fresh); if (s.score < best.score) best = { score: s.score, limiting: s.limiting, id: it.id }; });
    return best;
  }
  /** Freshness note for one day. dayIdx = days since the start-of-week shop (Monday = 0). */
  function dayNote(ctx, dayIdx, items) {
    var s = dayScore(ctx, items);
    if (!items.length) return { level: 'none', text: '', score: Infinity };
    if (!s.limiting) return { level: 'none', text: 'No short-dated ingredients in this meal.', score: Infinity };
    var lim = s.limiting, rng = rangeText(lim);
    if (dayIdx > lim.max) return { level: 'warn', score: s.score, limiting: lim, text: 'Heads up: ' + lim.label + ' keeps ' + rng + ' in the fridge, and this lands ' + dayIdx + ' days after a Monday shop. Move it earlier or freeze it.' };
    if (s.score <= 3) return { level: 'first', score: s.score, limiting: lim, text: 'Cook first: ' + lim.label + ', ' + rng };
    return { level: 'ok', score: s.score, limiting: lim, text: 'Shortest shelf life here: ' + lim.label + ', ' + rng };
  }
  function isMainLike(ctx, it) { var r = byIdOf(ctx)[it.id]; return !!r && isCenter(r); }
  function sideCount(ctx, meal) { return meal.items.filter(function (it) { var r = byIdOf(ctx)[it.id]; return r && !isCenter(r); }).length; }

  /** Suggest an order. Never changes state: returns a proposal {days, pool, changes}. Pinned days are left alone. Whole meals move together. */
  function orderByFreshness(ctx, state) {
    var days = state.days.map(function (d) { return { items: d.items.slice(), pinned: d.pinned }; });
    var meals = [], occupied = [];
    days.forEach(function (d, i) { if (!d.pinned && d.items.length) { meals.push({ items: d.items.slice(), from: i, seq: meals.length }); occupied.push(i); } });
    var poolMains = state.pool.filter(function (it) { return isMainLike(ctx, it); }), poolRest = state.pool.filter(function (it) { return !isMainLike(ctx, it); });
    poolMains.forEach(function (it) { meals.push({ items: [it], from: 'pool', seq: meals.length }); });
    function sc(m) { return dayScore(ctx, m.items).score; }
    var leftoverPool = [];
    poolRest.forEach(function (it) {
      if (!meals.length) { meals.push({ items: [it], from: 'pool', seq: meals.length }); return; }
      var order = meals.slice().sort(function (a, b) { return (sideCount(ctx, a) - sideCount(ctx, b)) || (sc(a) - sc(b)) || (a.seq - b.seq); });
      order[0].items.push(it);
    });
    // slots: unpinned days that hold something today, plus the earliest empty unpinned days when more meals than slots
    var slots = occupied.slice();
    for (var i = 0; i < 7 && slots.length < meals.length; i++) if (!days[i].pinned && slots.indexOf(i) < 0) slots.push(i);
    slots.sort(function (a, b) { return a - b; });
    var sorted = meals.slice().sort(function (a, b) { var x = sc(a), y = sc(b); if (x === y) return a.seq - b.seq; return x < y ? -1 : 1; });
    var placed = sorted.slice(0, slots.length), overflow = sorted.slice(slots.length);
    var out = days.map(function (d) { return { items: d.pinned ? d.items : [], pinned: d.pinned }; });
    placed.forEach(function (m, k) { out[slots[k]].items = m.items; });
    overflow.forEach(function (m) { m.items.forEach(function (it) { leftoverPool.push(it); }); });
    var changes = [];
    for (var j = 0; j < 7; j++) {
      var before = state.days[j].items.map(function (x) { return x.id; }).join(','), after = out[j].items.map(function (x) { return x.id; }).join(',');
      if (before !== after) changes.push({ day: j, before: state.days[j].items.map(function (x) { return x.id; }), after: out[j].items.map(function (x) { return x.id; }) });
    }
    return { days: out, pool: leftoverPool, changes: changes, changed: changes.length > 0 || leftoverPool.length !== state.pool.length };
  }
  function applyProposal(state, p) {
    state.days.forEach(function (d, i) { if (!d.pinned) d.items = p.days[i].items.map(function (x) { return { id: x.id, f: x.f }; }); });
    state.pool = p.pool.map(function (x) { return { id: x.id, f: x.f }; });
    return state;
  }

  /* ---------- pairing (category rules only) ---------- */
  var MAIN_SUB_ORDER = ['Chicken', 'Beef', 'Pork', 'Fish'];
  /** Suggested pairing for a day. Rule: a main (or soup/breakfast dish) gets sides picked by recipe category only:
   *  vegetable side, rice/noodle/pasta side, salad (soups and breakfast get a salad and a vegetable side). A day with only sides/desserts gets up to 3 mains of different kinds.
   *  Nothing here claims flavors match. Returns {mode, suggestions:[{id, slot, label}], text}. */
  function suggestPairings(ctx, state, dayIdx) {
    var recipes = ctx.recipes, items = state.days[dayIdx].items, ids = items.map(function (x) { return x.id; });
    var inWeek = {}; allItems(state).forEach(function (it) { inWeek[it.id] = true; });
    var res = { mode: 'none', suggestions: [], text: '' };
    if (!items.length) return res;
    var recs = items.map(function (it) { return byIdOf(ctx)[it.id]; }).filter(Boolean);
    var center = recs.filter(isCenter);
    function pickFrom(cands, seed) {
      var fresh = cands.filter(function (r) { return !inWeek[r.id]; }), pool = fresh.length ? fresh : cands;
      return pool.length ? pool[hashStr(seed) % pool.length] : null;
    }
    if (center.length) {
      res.mode = 'sides';
      var lead = center[0], want = lead.category === 'Main dish' ? ['vegetable', 'starch', 'salad'] : ['salad', 'vegetable'];
      var have = {}; recs.forEach(function (r) { var s = slotOf(r); if (s) have[s] = true; });
      want.forEach(function (slot) {
        if (have[slot] || res.suggestions.length >= 3) return;
        var cands = recipes.filter(function (r) { return slotOf(r) === slot && ids.indexOf(r.id) < 0; });
        var r = pickFrom(cands, lead.id + '|' + slot); if (r) res.suggestions.push({ id: r.id, slot: slot, label: SLOT_LABEL[slot] });
      });
    } else {
      res.mode = 'mains';
      var seen = {}, start = hashStr(ids[0] || ''), subs = MAIN_SUB_ORDER.slice(start % MAIN_SUB_ORDER.length).concat(MAIN_SUB_ORDER.slice(0, start % MAIN_SUB_ORDER.length));
      subs.forEach(function (sub) {
        if (res.suggestions.length >= 3) return;
        var cands = recipes.filter(function (r) { return r.category === 'Main dish' && r.sub === sub && ids.indexOf(r.id) < 0; });
        var r = pickFrom(cands, ids.join(',') + '|' + sub); if (r) res.suggestions.push({ id: r.id, slot: 'main', label: 'a ' + sub.toLowerCase() + ' main' });
      });
    }
    if (res.suggestions.length) {
      res.text = 'Suggested pairing: ' + res.suggestions.map(function (s) { return byIdOf(ctx)[s.id].title + ' (' + s.label + ')'; }).join(', ') + '. Chosen from recipe categories only, not from flavor matching.';
    }
    return res;
  }
  /** Servings multiplier for a suggested dish so it feeds about as many people as the day's first dish. */
  function matchFactor(ctx, state, dayIdx, id) {
    var items = state.days[dayIdx].items, r = byIdOf(ctx)[id];
    if (!items.length || !r || !r.servings) return 1;
    var lead = byIdOf(ctx)[items[0].id]; if (!lead || !lead.servings) return 1;
    var target = lead.servings * items[0].f, best = 1, err = 1e9;
    [0.5, 1, 1.5, 2, 3].forEach(function (f) { var e = Math.abs(r.servings * f - target); if (e < err - 1e-9) { err = e; best = f; } });
    return best;
  }

  /* ---------- recipe card text ---------- */
  function trimUrl(u) { return u.replace(/[^\/]*$/, ''); }
  function recipeUrl(ctx, id) { return (ctx.baseUrl || '') + 'recipes/' + id + '.html'; }
  /** One dish as card data: scaled ingredients (with the active swaps applied), numbered steps, urls. */
  function dishCard(ctx, id, f) {
    var L = ctx.L, sw = ctx.swaps || {}, r = byIdOf(ctx)[id]; if (!r) return null;
    var video = ctx.videos && ctx.videos[r.id] ? videoUrlOf(ctx.videos[r.id]) : null;
    return {
      id: r.id, title: r.title, serves: servesText(r, f, L), f: f, category: r.category, source: r.source,
      ingredients: r.ingredients.map(function (ing) { return { group: ing.group || null, text: L.swapText(L.scaleText(ing.text, f), sw) }; }),
      steps: r.steps.map(function (st) { return L.swapText(L.scaleStep(st, f).replace(/\[\[|\]\]/g, ''), sw); }),
      tips: r.tips || [], url: recipeUrl(ctx, r.id), video: video, scaled: Math.abs(f - 1) > 0.001
    };
  }
  /** The recipe card for one planned day: structured data plus a plain-text rendering. */
  function dayCard(ctx, state, dayIdx, todayStr) {
    var L = ctx.L, sw = ctx.swaps || {}, date = dayDate(state, dayIdx, todayStr), items = state.days[dayIdx].items;
    var dishes = items.map(function (it) { return dishCard(ctx, it.id, it.f); }).filter(Boolean);
    var pair = suggestPairings(ctx, state, dayIdx), note = dayNote(ctx, dayIdx, items);
    var titles = dishes.map(function (d) { return d.title; });
    var prep = [];
    if (state.alarms && state.alarms.prep) dishes.forEach(function (d) { var p = ctx.fresh.prep[d.id]; if (p) prep.push({ id: d.id, title: d.title, lead: p.lead, label: p.label, basis: p.basis }); });
    var card = { dayIdx: dayIdx, date: date, time: state.time, dishes: dishes, titles: titles, summary: 'Dinner: ' + titles.join(' + '), pairing: pair, freshness: note, prep: prep };
    card.text = cardText(card, state);
    return card;
  }
  function cardText(card, state) {
    var o = [];
    o.push('COMMON ROOTS \u00b7 MY WEEK');
    o.push(fmtDateLong(card.date) + ', dinner at ' + fmtTime(card.time));
    o.push('Menu: ' + card.titles.join(' + '));
    card.dishes.forEach(function (d) {
      o.push(''); o.push('== ' + d.title.toUpperCase() + ' (' + d.serves + ') ==');
      o.push('INGREDIENTS' + (d.scaled ? ' (scaled to ' + d.serves.toLowerCase() + ')' : ''));
      var g = null; d.ingredients.forEach(function (i) { if (i.group && i.group !== g) { o.push(i.group + ':'); } g = i.group; o.push('- ' + i.text); });
      o.push('METHOD'); d.steps.forEach(function (s, k) { o.push((k + 1) + '. ' + s); });
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
  var enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  function byteLen(ch) { if (enc) return enc.encode(ch).length; var c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
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
    var links = c.dishes.map(function (d) { return d.title + ' full recipe: ' + d.url + (d.video ? '\nVideo: ' + d.video : ''); });
    var extra = [];
    c.dishes.forEach(function (d) {
      extra.push('', d.title + ' (' + d.serves + ')', 'Ingredients:'); d.ingredients.forEach(function (i) { extra.push('- ' + i.text); });
      extra.push('Method:'); d.steps.forEach(function (s, k) { extra.push((k + 1) + '. ' + s); });
    });
    function make(nExtra, cut) {
      var body = must.concat([''], extra.slice(0, nExtra));
      var txt = body.join('\n');
      if (cut) txt += (nExtra < extra.length ? '\n\u2026 (card shortened)' : '');
      txt += '\n\n' + links.join('\n');
      return txt;
    }
    var n = extra.length, details = make(n, true), url;
    function build(d) { return base + '&details=' + encodeURIComponent(d); }
    url = build(details);
    while (url.length > maxLen && n > 0) { n = Math.max(0, n - Math.max(1, Math.floor(n / 8))); details = make(n, true); url = build(details); }
    if (url.length > maxLen) { details = must[0] + '\n\n' + links.join('\n'); url = build(details); }
    if (url.length > maxLen) { // last resort: first recipe link only
      details = must[0] + '\n' + links[0].split('\n')[0]; url = build(details);
    }
    return url;
  }

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

  /* ---------- video slots ---------- */
  function videoUrlOf(entry) { return typeof entry === 'string' ? entry : (entry && typeof entry.url === 'string' ? entry.url : null); }
  function parseClock(t) {
    var p = String(t || '').split(':').map(Number); if (!p.length || p.length > 3 || p.some(function (x) { return !isFinite(x) || x < 0; })) return null;
    return p.reduce(function (a, x) { return a * 60 + x; }, 0);
  }
  /** Turn a videos.js entry (string or {url, chapters}) into something safe to embed, or null. Only https (or a site-relative .mp4) is accepted. */
  function parseVideo(entry) {
    var url = videoUrlOf(entry); if (!url) return null; url = url.trim();
    var chapters = (entry && Array.isArray(entry.chapters) ? entry.chapters : []).map(function (c) { var s = parseClock(c && c.t); return s === null || !c.label ? null : { t: String(c.t), seconds: s, label: String(c.label) }; }).filter(Boolean);
    var m, base = { url: url, chapters: chapters };
    if ((m = /^https:\/\/(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)([\w-]{11})(?:[&?#].*)?$/i.exec(url)) || (m = /^https:\/\/youtu\.be\/([\w-]{11})(?:[?#].*)?$/i.exec(url))) {
      return Object.assign(base, { type: 'youtube', id: m[1], embed: function (start) { return 'https://www.youtube-nocookie.com/embed/' + m[1] + (start ? '?start=' + Math.floor(start) : ''); } });
    }
    if ((m = /^https:\/\/(?:www\.)?vimeo\.com\/(?:video\/)?(\d{6,12})(?:[\/?#].*)?$/i.exec(url)) || (m = /^https:\/\/player\.vimeo\.com\/video\/(\d{6,12})(?:[?#].*)?$/i.exec(url))) {
      return Object.assign(base, { type: 'vimeo', id: m[1], embed: function (start) { return 'https://player.vimeo.com/video/' + m[1] + '?dnt=1' + (start ? '#t=' + Math.floor(start) + 's' : ''); } });
    }
    if (/^(https:\/\/|(?!\/\/)(?![a-z][a-z0-9+.-]*:)[^\s])[^\s]*\.mp4(?:[?#][^\s]*)?$/i.test(url)) return Object.assign(base, { type: 'mp4', src: url });
    return null;
  }

  var api = { KEY: KEY, DAYS: DAYS, SHORT: SHORT, TZS: TZS, DEFAULT_TZ: DEFAULT_TZ, parseDate: parseDate, addDays: addDays, weekdayIdx: weekdayIdx, comingMonday: comingMonday, localDateStr: localDateStr,
    fmtDate: fmtDate, fmtDateLong: fmtDateLong, fmtTime: fmtTime, addMinutes: addMinutes, dtLocal: dtLocal, defaultState: defaultState, normalize: normalize, load: load, save: save,
    weekStart: weekStart, dayDate: dayDate, plannedCount: plannedCount, allItems: allItems, dayOf: dayOf, addItem: addItem, removeItem: removeItem, moveItem: moveItem, setFactor: setFactor,
    setPinned: setPinned, clearWeek: clearWeek, shoppingSelection: shoppingSelection, servesText: servesText, slotOf: slotOf, isCenter: isCenter,
    rangeText: rangeText, perishables: perishables, recipeScore: recipeScore, dayScore: dayScore, dayNote: dayNote, orderByFreshness: orderByFreshness, applyProposal: applyProposal,
    dishCard: dishCard, suggestPairings: suggestPairings, matchFactor: matchFactor, dayCard: dayCard, cardText: cardText, icsEscape: icsEscape, foldLine: foldLine, triggerOf: triggerOf, vtimezone: vtimezone,
    uidOf: uidOf, buildICS: buildICS, gcalUrl: gcalUrl, exportObject: exportObject, exportJSON: exportJSON, importJSON: importJSON, encodeShare: encodeShare, decodeShare: decodeShare,
    parseVideo: parseVideo, videoUrlOf: videoUrlOf, hashStr: hashStr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CRWeek = api;
})(typeof window !== 'undefined' ? window : globalThis);

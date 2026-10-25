/* Common Roots: recipe helpers and freshness ordering (use-by scores, cook-first notes). Pure. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var CRDates = NODE ? require('./dates.js') : root.CRDates;
  var CENTER = CRDates.CENTER;
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

  var api = { SLOT_LABEL: SLOT_LABEL, applyProposal: applyProposal, byIdOf: byIdOf, dayNote: dayNote, dayScore: dayScore, hashStr: hashStr, isCenter: isCenter, orderByFreshness: orderByFreshness, perishables: perishables, rangeText: rangeText, recipeScore: recipeScore, servesText: servesText, slotOf: slotOf };
  if (NODE) module.exports = api; else root.CRFreshness = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* Common Roots: merging recipes into whole-item shopping rows, conversions, aisles, list text. Pure; Node + browser. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var CRScale = NODE ? require('./scale.js') : root.CRScale;
  var fmtAmount = CRScale.fmtAmount, fmtQty = CRScale.fmtQty, fmtSize = CRScale.fmtSize, fmtVol = CRScale.fmtVol;
  var CRSwaps = NODE ? require('./swaps.js') : root.CRSwaps;
  var effectiveEntries = CRSwaps.effectiveEntries;
  /* ---------- whole-item conversions for the shopping list ----------
   * Recipes mix counts ("2 medium onions") and measures ("1 cup chopped onion"). To show ONE line per ingredient we convert
   * measures into whole shopping units (medium, stalk, head, bunch, package) and round UP to whole items.
   * Every ratio below is deliberately conservative (the low end of the published range = more items to buy, so nobody runs short)
   * and has a source. Anything NOT listed here is never converted: its rows stay separate. See CONVERSIONS.md for the full table.
   *
   *  item:   merge key of the shopping list rows this entry converts
   *  into:   merged item key (default: itself)
   *  unit:   shopping unit shown ('medium' | 'stalk' | 'head' | 'bunch' | 'package' | 'can' | 'each');  cu = unit key used by the Walmart package table
   *  vol:    teaspoons of prepared (chopped/sliced/minced/juice) amount that ONE unit yields
   *  ct:     count units used in recipes -> how many shopping units each one is ('each' = 1 means "one medium")
   *  prep:   word shown in the breakdown ("2½ cups chopped")      pool: rows with the same pool share the same fruit (take the larger, not the sum)
   *  est:    true when the per-unit figure is an estimate that is not directly sourced (flagged in the notes)
   * Sources:  BC  = Betty Crocker "Yields & Equivalents for Common Ingredients" https://www.bettycrocker.com/how-to/tipslibrary/charts-timetables-measuring/common-ingredients-yields-equivalents
   *           USDA = USDA FoodData Central (SR Legacy) household weights (onion 110 g medium / 160 g per cup chopped, FDC 170000 / SNAP-Ed https://snaped.fns.usda.gov/resources/nutrition-education-materials/seasonal-produce-guide/onions ;
   *                  tomato 123 g medium / 180 g per cup / 62 g Italian-plum, Basic Report 11529; fresh basil chopped 42 g per cup, fresh thyme 2.4 g per tbsp, fresh dill sprigs 8.9 g per cup, via https://cookbookmanager.com/tools/ingredient-weights and https://chefsolver.com/en/convert/basil_fresh_chopped/)
   *           HMI = howmuchisin.com experiments: garlic https://www.howmuchisin.com/produce_converters/garlic, celery .../celery, green onion .../green-onion
   *           HGC = herbgardencooking.com parsley https://herbgardencooking.com/how-to-measure-parsley/ and Familystyle Food https://familystylefood.com/how-to-chop-parsley/
   *           RK  = Ruchi's Kitchen produce equivalents https://www.ruchiskitchen.com/fruit-and-vegetable-equivalents/ (secondary source) */
  var CONV = {
    // yellow onion: USDA 160 g per cup chopped / 110 g per medium = 0.69 cup; BC says 1/2 cup. We use 2/3 cup (32 tsp).
    'onion': { unit: 'medium', cu: 'each', vol: 32, ct: { each: 1 }, prep: 'chopped', name: 'onion', plural: 'onions', src: 'USDA 170000 (110 g medium, 160 g/cup chopped); BC 1/2 cup' },
    'red onion': { unit: 'medium', cu: 'each', vol: 32, ct: { each: 1 }, prep: 'chopped', name: 'red onion', plural: 'red onions', src: 'same as onion' },
    // bell peppers: BC 1 cup chopped = 1 medium; RK the same.
    'red pepper': { unit: 'medium', cu: 'each', vol: 48, ct: { each: 1 }, prep: 'chopped', name: 'red bell pepper', plural: 'red bell peppers', src: 'BC (1 cup chopped = 1 medium); RK' },
    'green pepper': { unit: 'medium', cu: 'each', vol: 48, ct: { each: 1 }, prep: 'chopped', name: 'green pepper', plural: 'green peppers', src: 'BC (1 cup chopped = 1 medium); RK' },
    // carrot: BC 1 cup 1/4-inch slices = 2 medium (so 1 medium = 1/2 cup = 24 tsp); chopped is treated the same.
    'carrot': { unit: 'medium', cu: 'each', vol: 24, ct: { each: 1 }, prep: 'chopped or sliced', name: 'carrot', plural: 'carrots', src: 'BC (1 cup sliced = 2 medium)' },
    // celery: BC 1 cup chopped = 2 medium stalks; HMI 1 stalk = 1/2 cup.
    'celery': { unit: 'stalk', cu: 'stalk', vol: 24, ct: { stalk: 1 }, prep: 'sliced', name: 'celery', plural: 'celery', src: 'BC; HMI (1 stalk = 1/2 cup)' },
    // fresh tomato: USDA 180 g per cup chopped / 123 g per medium = 0.68 cup -> 2/3 cup.
    'tomato': { unit: 'medium', cu: 'each', vol: 32, ct: { each: 1 }, prep: 'chopped', name: 'tomato', plural: 'tomatoes', src: 'USDA 11529 (123 g medium, 180 g/cup chopped)' },
    // garlic: HMI 10 to 12 cloves per grocery-store head; we use the low end, 10.
    'garlic': { unit: 'head', cu: 'head', ct: { clove: 0.1, each: 0.1 }, name: 'garlic', plural: 'garlic', src: 'HMI (10-12 cloves per head)' },
    // green onion: HMI 1 bunch (6-8 onions) = 1 cup sliced or 3/4 cup diced; BC 1/4 cup sliced = 3-4 medium. We use 3/4 cup (36 tsp) per bunch.
    'green onion': { unit: 'bunch', cu: 'bunch', vol: 36, ct: { bunch: 1 }, prep: 'sliced', name: 'green onion', plural: 'green onions', src: 'HMI (1 bunch = 3/4 cup diced)' },
    // lemon: BC 1 medium = 2-3 tbsp juice and 1 1/2-3 tsp grated peel. Low ends: 2 tbsp (6 tsp) juice, 1.5 tsp zest.
    // Juice and zest come from the same lemons (zest first, then juice), so the two are pooled (larger of the two), then whole lemons are added.
    'lemon': { unit: 'medium', cu: 'each', ct: { each: 1 }, name: 'lemon', plural: 'lemons', src: 'BC (lemons or limes: 2-3 tbsp juice, 1 1/2-3 tsp grated peel per medium)' },
    'lemon juice': { into: 'lemon', vol: 6, prep: 'juice', pool: 'citrus', src: 'BC (2-3 tbsp juice per medium lemon; low end)' },
    'lemon zest': { into: 'lemon', vol: 1.5, prep: 'zest', pool: 'citrus', src: 'BC (1 1/2-3 tsp grated peel per medium lemon; low end)' },
    'lime': { unit: 'medium', cu: 'each', ct: { each: 1 }, name: 'lime', plural: 'limes', src: 'BC (lemons or limes: 2-3 tbsp juice, 1 1/2-3 tsp grated peel per medium)' },
    'lime juice': { into: 'lime', vol: 6, prep: 'juice', pool: 'citrus', src: 'BC (2-3 tbsp juice per medium lime; low end)' },
    'lime zest': { into: 'lime', vol: 1.5, prep: 'zest', pool: 'citrus', src: 'BC (1 1/2-3 tsp grated peel per medium lime; low end)' },
    // orange rind (zest): BC 1-2 tbsp grated peel per medium orange; low end 1 tbsp = 3 tsp.
    'orange rind': { unit: 'medium', cu: 'each', vol: 3, ct: { each: 1 }, prep: 'zest', name: 'orange (for zest)', plural: 'oranges (for zest)', src: 'BC (1-2 tbsp grated peel per medium orange)' },
    // potato / cabbage / cucumber: not in the starter 20 as mixed units today; ready for later recipes.
    'potato': { unit: 'medium', cu: 'each', vol: 48, ct: { each: 1 }, prep: 'diced', name: 'potato', plural: 'potatoes', src: 'BC (1 cup 1/2-inch pieces = 1 medium)' },
    'cabbage': { unit: 'head', cu: 'head', vol: 288, ct: { head: 1 }, prep: 'shredded', name: 'cabbage', plural: 'cabbages', src: 'BC (1 medium head = 1 1/2 lb; 4 cups shredded per lb)' },
    'cucumber': { unit: 'each', cu: 'each', vol: 64, ct: { each: 1 }, prep: 'chopped', name: 'cucumber', plural: 'cucumbers', src: 'RK (3/4 medium = 1 cup chopped)' },
    // fresh herbs: bunches / packages. Package = the 0.5 oz clamshell mapped at Walmart.
    // basil: USDA 42 g per cup chopped; 0.5 oz = 14 g = 1/3 cup = 16 tsp.
    'basil': { unit: 'package', cu: 'package', vol: 16, ct: { package: 1 }, prep: 'chopped', size: '0.5 oz', name: 'fresh basil', plural: 'fresh basil', src: 'USDA (basil 42 g/cup chopped); 0.5 oz clamshell = 14 g' },
    // parsley: HGC 1 bunch (about 2 oz) = about 1 1/2 cups finely chopped; Familystyle 3/4 cup. Low end 3/4 cup = 36 tsp.
    'parsley': { unit: 'bunch', cu: 'bunch', vol: 36, ct: { bunch: 1 }, prep: 'chopped', name: 'parsley', plural: 'parsley', src: 'HGC / Familystyle Food (3/4 to 1 1/2 cups per bunch)' },
    // thyme and dill: package figures are estimates (0.5 oz clamshell; leaf-only maximum from USDA is ~17 tsp thyme; stems allowed for). Recipes need only 1 1/2 and 3 tsp.
    'fresh thyme': { unit: 'package', cu: 'package', vol: 12, ct: { package: 1 }, prep: 'minced', size: '0.5 oz', name: 'fresh thyme', plural: 'fresh thyme', est: true, src: 'estimate (USDA thyme 2.4 g/tbsp leaves; 0.5 oz clamshell includes stems)' },
    'fresh dill': { unit: 'package', cu: 'package', vol: 24, ct: { package: 1 }, prep: 'chopped', size: '0.5 oz', name: 'fresh dill', plural: 'fresh dill', est: true, src: 'estimate (USDA dill 8.9 g/cup sprigs; 0.5 oz clamshell)' },
    // plain counts that only differ by a size note ("4" vs "4 (4 oz each)", "3 cans" vs "2 cans (14 oz each)"): add them up.
    'chicken breast': { unit: 'each', cu: 'each', ct: { each: 1 }, name: 'chicken breast', plural: 'chicken breasts', src: 'same item, counts added' },
    'canned tomatoes': { unit: 'can', cu: 'can', ct: { can: 1 }, name: 'canned tomatoes', plural: 'canned tomatoes', src: 'same item, counts added' }
  };
  // Items that are the same product under two names.
  var ALIAS = { 'dry breadcrumb': { item: 'bread crumb', name: 'bread crumbs' }, 'bread crumb': { item: 'bread crumb', name: 'bread crumbs' } };
  var WHOLE_TOL = 0.03;
  var UNIT_WORD = { medium: ['medium', 'medium'], stalk: ['stalk', 'stalks'], head: ['head', 'heads'], bunch: ['bunch', 'bunches'], package: ['package', 'packages'],
                    can: ['can', 'cans'], each: ['', ''] };
  function ceilWhole(x) { var n = Math.ceil(x - WHOLE_TOL); return n < 1 ? 1 : n; }
  function approxQ(x) { var q = Math.round(x * 4) / 4; if (q < 0.25) q = 0.25; return fmtQty(q, true); }

  /** Merge rows of items that appear in CONV into one row per target item, in whole shopping units. */
  function mergeConverted(rows) {
    var groups = {}, placed = {}, out = [];
    rows.forEach(function (r) { var c = CONV[r.item]; if (c) { var t = c.into || r.item; (groups[t] = groups[t] || []).push(r); } });
    rows.forEach(function (r) {
      var c = CONV[r.item];
      if (!c) { out.push(r); return; }
      var t = c.into || r.item;
      if (placed[t]) return; placed[t] = true;
      buildMerged(t, groups[t]).forEach(function (x) { out.push(x); });
    });
    return out;
  }
  function buildMerged(t, rs) {
    var tc = CONV[t], unit = tc.unit, counts = [], conv = {}, left = [], noneRows = [], measured = false;
    var recs = [], opt = true, swapped = [];
    rs.forEach(function (r) {
      var c = CONV[r.item], u = null, kind = null;
      if (r.fam === 'none') { noneRows.push(r); return; }
      if (r.fam === 'vol' && c.vol) { u = r.qty / c.vol; kind = 'vol'; }
      else if (r.fam.indexOf('ct:') === 0 && c.ct && c.ct[r.cu] != null) { u = r.qty * c.ct[r.cu]; kind = (c.ct[r.cu] === 1 && r.item === t) ? 'count' : 'ctconv'; }
      if (u === null) { r.note = 'No reliable conversion to whole items yet, so this stays on its own line.'; left.push(r); return; }
      measured = true;
      if (r.recipes) r.recipes.forEach(function (x) { if (recs.indexOf(x) < 0) recs.push(x); });
      if (!r.optionalAll) opt = false;
      (r.swappedFrom || []).forEach(function (x) { if (swapped.indexOf(x) < 0) swapped.push(x); });
      if (kind === 'count') counts.push({ qty: r.qty, size: r.size });
      else {
        var k = c.prep || '';
        var g = conv[k] = conv[k] || { units: 0, tsp: 0, cloves: 0, prep: k, pool: c.pool || null, ct: kind === 'ctconv' };
        g.units += u; if (kind === 'vol') g.tsp += r.qty; else g.cloves += r.qty;
        g.cuName = r.cu;
      }
    });
    if (!measured) return rs;              // nothing convertible (e.g. only "as needed" rows): leave untouched
    var cnt = counts.reduce(function (a, c) { return a + c.qty; }, 0), convUnits = 0, poolMax = {};
    Object.keys(conv).forEach(function (k) {
      var g = conv[k];
      if (g.pool) poolMax[g.pool] = Math.max(poolMax[g.pool] || 0, g.units); else convUnits += g.units;
    });
    Object.keys(poolMax).forEach(function (p) { convUnits += poolMax[p]; });
    var total = cnt + convUnits, whole = ceilWhole(total);
    var converted = Object.keys(conv).length > 0;
    var uw = UNIT_WORD[unit] || ['', ''], word = whole > 1.012 ? uw[1] : uw[0];
    var amount = (converted ? 'about ' : '') + whole + (word ? ' ' + word : '') + (tc.size ? ' (' + tc.size + (whole > 1.012 ? ' each' : '') + ')' : '');
    // breakdown (small gray text)
    var parts = [];
    var descr = Object.keys(conv).map(function (k) {
      var g = conv[k], bits = [];
      if (g.tsp > 0) bits.push(fmtVol(g.tsp) + (g.prep ? ' ' + g.prep : ''));
      if (g.cloves > 0) bits.push(fmtQty(g.cloves) + ' ' + (g.cloves > 1.012 ? 'cloves' : 'clove'));
      return bits.join(' + ');
    }).join(' + ');
    var poolShared = Object.keys(conv).filter(function (k) { return conv[k].pool; }).length > 1;
    if (converted) {
      var cs = counts.length ? fmtQty(cnt) + ' whole + ' : '';
      parts.push(cs + '~' + approxQ(convUnits) + (unit === 'medium' ? ' medium' : ' ' + (convUnits > 1.012 ? uw[1] : uw[0])) + ' from ' + descr + (poolShared ? ' (zest and juice use the same ' + tc.plural + ')' : ''));
    } else if (counts.length > 1) {
      parts.push(counts.map(function (c) { return fmtQty(c.qty) + (c.size ? ' (' + fmtSize(c.size) + ' each)' : ''); }).join(' + '));
    }
    var base = rs.filter(function (r) { return r.item === t; })[0] || rs[0];
    var row = { key: t + '|whole', item: t, name: tc.name || base.name, plural: tc.plural, fam: 'ct:' + tc.cu, qty: whole, cu: tc.cu, size: null, noqty: base.noqty,
      aisle: base.aisle, staple: base.staple, optionalAll: opt, recipes: recs, swappedFrom: swapped, whole: true, unit: unit, exact: total,
      amount: amount, breakdown: parts.join(''), est: !!tc.est, converted: converted };
    var res = [row];
    left.forEach(function (r) { res.push(r); });
    return res;
  }

  /**
   * Merge ingredients across selected recipes.
   * selection: [{id, factor}], recipes: array of recipe objects.
   * Rows merge when item AND unit family match (volume, weight, same count unit+size).
   * Incompatible units become separate rows.
   */
  function mergeSelection(recipes, selection, swaps) {
    var byId = {}; recipes.forEach(function (r) { byId[r.id] = r; });
    var map = {}, order = [];
    selection.forEach(function (s) {
      var r = byId[s.id]; if (!r) return;
      r.ingredients.forEach(function (ing) {
        effectiveEntries(ing, swaps).forEach(function (e) {
          if (ALIAS[e.item]) { var a = ALIAS[e.item], e2 = {}; Object.keys(e).forEach(function (k) { e2[k] = e[k]; }); e2.item = a.item; e2.name = a.name; e = e2; }
          var key = e.item + '|' + e.fam;
          var row = map[key];
          if (!row) {
            row = map[key] = { key: key, item: e.item, name: e.name, plural: e.plural, fam: e.fam, qty: 0, cu: e.cu, size: e.size,
              noqty: e.noqty, aisle: e.aisle, staple: e.staple, optionalAll: true, recipes: [], swappedFrom: [] };
            order.push(key);
          }
          row.qty += (e.qty || 0) * s.factor;
          if (!e.optional) row.optionalAll = false;
          if (e.swappedFrom && row.swappedFrom.indexOf(e.swappedFrom) < 0) row.swappedFrom.push(e.swappedFrom);
          if (row.recipes.indexOf(r.title) < 0) row.recipes.push(r.title);
        });
      });
    });
    var rows = mergeConverted(order.map(function (k) { return map[k]; }));
    // drop "as needed / pinch / dash" rows when the same item already has a measured row
    var measured = {}; rows.forEach(function (r) { if (r.fam !== 'none') measured[r.item] = true; });
    rows = rows.filter(function (r) { return !(r.fam === 'none' && measured[r.item]); });
    rows.forEach(function (r) {
      if (!r.whole) r.amount = fmtAmount(r);
      r.label = (r.fam.indexOf('ct:') === 0 && r.qty > 1.012 && r.plural) ? r.plural : r.name;
    });
    return rows;
  }

  function capital(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  var AISLES = ['Produce', 'Meat & seafood', 'Dairy & eggs', 'Canned & jarred', 'Baking & spices', 'Pantry & grains', 'Other'];

  /** Plain-text shopping list for clipboard. have: {itemKey:true} excluded. */
  function listToText(rows, titles) {
    var out = ['Common Roots shopping list'];
    if (titles && titles.length) out.push('Recipes: ' + titles.join(', '));
    out.push('');
    AISLES.forEach(function (a) {
      var rs = rows.filter(function (r) { return r.aisle === a; });
      if (!rs.length) return;
      out.push(a.toUpperCase());
      rs.forEach(function (r) { out.push('- ' + capital(r.label) + ': ' + r.amount + (r.optionalAll ? ' (optional)' : '')); });
      out.push('');
    });
    return out.join('\n').trim() + '\n';
  }

  var api = { AISLES: AISLES, ALIAS: ALIAS, CONV: CONV, capital: capital, listToText: listToText, mergeConverted: mergeConverted, mergeSelection: mergeSelection };
  if (NODE) module.exports = api; else root.CRMerge = api;
})(typeof window !== 'undefined' ? window : globalThis);

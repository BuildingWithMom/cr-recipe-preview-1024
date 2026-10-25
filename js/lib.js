/* Common Roots: pure logic (scaling, fractions, merging). Works in browser and Node. */
(function (root) {
  'use strict';
  var UNI = { '1/2': '\u00bd', '1/3': '\u2153', '2/3': '\u2154', '1/4': '\u00bc', '3/4': '\u00be',
              '1/8': '\u215b', '3/8': '\u215c', '5/8': '\u215d', '7/8': '\u215e', '1/6': '\u2159', '5/6': '\u215a' };
  var DENS = [2, 3, 4, 6, 8, 12, 16];

  /** Format a number as a friendly mixed fraction: 1.5 -> 1½, 0.3333 -> ⅓, 2.25 -> 2¼. */
  function fmtQty(x, strict) {
    var dens = strict ? [2, 3, 4, 6, 8] : DENS;
    if (!(x > 0)) return '0';
    var whole = Math.floor(x + 1e-9), frac = x - whole;
    if (frac > 1 - 0.012) { whole += 1; frac = 0; }
    if (frac < 0.012) return String(whole);
    var best = null;
    for (var d = 0; d < dens.length && !best; d++) {
      var den = dens[d];
      for (var num = 1; num < den; num++) {
        if (Math.abs(frac - num / den) < 0.012) { best = [num, den]; break; }
      }
    }
    if (!best) {
      var r = Math.round(x * 100) / 100;
      return String(r);
    }
    var g = gcd(best[0], best[1]); var key = (best[0] / g) + '/' + (best[1] / g);
    var f = UNI[key] || key;
    if (whole === 0) return f;
    return UNI[key] ? whole + f : whole + ' ' + f;
  }
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }

  /** Parse "1 & 1/2", "1 1/2", "3/4", "2.5", "4" to a number. */
  function parseNum(tok) {
    tok = tok.replace('&', ' ').replace(/\s+/g, ' ').trim();
    var parts = tok.split(' '), v = 0;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].indexOf('/') >= 0) { var ab = parts[i].split('/'); v += Number(ab[0]) / Number(ab[1]); }
      else v += Number(parts[i]);
    }
    return v;
  }

  var NUMRE = /\d+\s*&\s*\d+\/\d+|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?/g;
  var UNITS = /^\s*(cups?|tablespoons?|tbsp|teaspoons?|tsp|oz\.?|ounces?|lbs?\.?|pounds?|g|ml|cloves?|cans?|small|medium|large|stalks?|slices?|pinch|dash|quarts?|pints?|gallons?)\b/i;
  var PKG_CAN = /^\s*(oz|ounces?|lbs?)\.?\s+can\b/i;

  var UNIT_FORMS = { cup: ['cup', 'cups'], cups: ['cup', 'cups'], tablespoon: ['tablespoon', 'tablespoons'], tablespoons: ['tablespoon', 'tablespoons'],
    teaspoon: ['teaspoon', 'teaspoons'], teaspoons: ['teaspoon', 'teaspoons'], lb: ['lb', 'lbs'], lbs: ['lb', 'lbs'], pound: ['pound', 'pounds'], pounds: ['pound', 'pounds'],
    clove: ['clove', 'cloves'], cloves: ['clove', 'cloves'], can: ['can', 'cans'], cans: ['can', 'cans'], ounce: ['ounce', 'ounces'], ounces: ['ounce', 'ounces'],
    stalk: ['stalk', 'stalks'], pinch: ['pinch', 'pinches'], dash: ['dash', 'dashes'], stalks: ['stalk', 'stalks'], slice: ['slice', 'slices'], slices: ['slice', 'slices'], quart: ['quart', 'quarts'], quarts: ['quart', 'quarts'] };
  var NOUN_FORMS = [['eggs', 'egg'], ['onions', 'onion'], ['cucumbers', 'cucumber'], ['prunes', 'prune'], ['lemons', 'lemon'], ['fillets', 'fillet'],
    ['halves', 'half'], ['roasted chickens', 'roasted chicken'], ['green peppers', 'green pepper'], ['cloves', 'clove'], ['stalks', 'stalk']];

  function fixNouns(str, v) {
    NOUN_FORMS.forEach(function (n) {
      var re = new RegExp('\\b(' + n[0] + '|' + n[1] + ')\\b' + (n[1] === 'egg' ? '(?! yolk)' : ''));
      str = str.replace(re, v > 1.012 ? n[0] : n[1]);
    });
    return str;
  }

  /** Scale quantities in an ingredient line. Leading amount, amounts followed by a unit word,
   *  and equivalents like (475ml) scale. Package sizes right after the count, e.g. "2 (14oz) can", do not.
   *  Unit words and a few count nouns are re-pluralised ("1 cup", "2 cups"). */
  function scaleText(text, f, all) {
    var pkgStart = -1, pkgEnd = -1;
    var lead = text.match(/^(\d+\s*&\s*\d+\/\d+|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/);
    if (lead && !all) {
      var rest = text.slice(lead[0].length);
      var pm = rest.match(/^\s*\(/);
      if (pm) { pkgStart = lead[0].length + pm[0].length - 1; pkgEnd = text.indexOf(')', pkgStart); }
    }
    var out = '', pos = 0, m, re = new RegExp(NUMRE.source, 'g');
    while ((m = re.exec(text)) !== null) {
      var off = m.index, tok = m[0], end = off + tok.length;
      var after = text.slice(end);
      out += text.slice(pos, off); pos = end;
      if (/^\s*%/.test(after)) { out += tok; continue; }
      if (pkgStart >= 0 && off > pkgStart && off < pkgEnd) { out += tok; continue; }
      var um = after.match(UNITS);
      var isLead = off === 0;
      var doScale = all || isLead || (um && !PKG_CAN.test(after));
      if (!doScale) { out += tok; continue; }
      var v = parseNum(tok) * f;
      var metric = um && /^\s*(g|ml)\b/i.test(after);
      out += metric ? String(Math.round(v)) : fmtQty(v);
      // re-pluralise the unit word that follows (after a package-size paren if present)
      var tail = text.slice(end), consumed = 0;
      var pk = (isLead && pkgStart >= 0) ? tail.match(/^\s*\([^)]*\)\s*/) : null;
      if (pk) { out += pk[0]; consumed = pk[0].length; re.lastIndex = end + consumed; pos = end + consumed; tail = text.slice(pos); }
      var w = tail.match(/^(\s*)([A-Za-z]+)/);
      var isUnitWord = w && UNIT_FORMS[w[2].toLowerCase()];
      if (isUnitWord && !(pkgStart >= 0 && !pk)) {
        var forms = UNIT_FORMS[w[2].toLowerCase()];
        out += w[1] + (v > 1.012 ? forms[1] : forms[0]); pos += w[0].length; re.lastIndex = pos;
      } else if (w && (/^(small|medium|large)$/i.test(w[2]) || (isLead && !um))) {
        // count noun: re-pluralise common nouns in this phrase (up to "or"/"plus")
        var cut = tail.search(/ or | plus |$/);
        out += fixNouns(tail.slice(0, cut), v); pos += cut; re.lastIndex = pos;
      }
    }
    out += text.slice(pos);
    return out;
  }

  /** Scale [[...]] amount markers inside a method step (all numbers inside a marker are amounts). */
  function scaleStep(step, f) {
    return step.replace(/\[\[(.+?)\]\]/g, function (_, inner) { return scaleText(inner, f, true); });
  }

  function niceFrac(v) { var t = fmtQty(v, true); return !/\d\.\d/.test(t); }
  function unitName(u, v) {
    if (u === 'cup') return v > 1.012 ? 'cups' : 'cup';
    return u;
  }
  function halfWhole(v) { return Math.abs(v * 2 - Math.round(v * 2)) < 0.02; }
  /** Volume (in tsp) to friendly text, e.g. 240 tsp -> "1¼ qt"; 16 tsp -> "⅓ cup"; 57 tsp -> "1 cup + 3 tbsp". */
  function fmtVol(tsp) {
    if (tsp < 0.05) return '0 tsp';
    var v;
    if (tsp >= 190) {
      v = tsp / 192;
      if (niceFrac(v)) return fmtQty(v, true) + ' qt';
      var wq = Math.floor(v + 1e-9), rq = tsp - wq * 192;
      return wq + ' qt' + (rq > 0.05 ? ' + ' + fmtVol(rq) : '');
    }
    if (tsp >= 11.9) {
      v = tsp / 48;
      if (niceFrac(v)) return fmtQty(v, true) + ' ' + (v > 1.012 ? 'cups' : 'cup');
      var tb0 = tsp / 3;
      if (tsp < 24 && halfWhole(tb0)) return fmtQty(tb0) + ' tbsp';
      var q = Math.floor(tsp / 12 + 1e-9), rem = tsp - q * 12;
      return fmtQty(q / 4, true) + ' ' + (q > 4 ? 'cups' : 'cup') + (rem > 0.05 ? ' + ' + fmtVol(rem) : '');
    }
    if (tsp >= 2.97) {
      var tb = tsp / 3;
      if (halfWhole(tb)) return fmtQty(tb) + ' tbsp';
      var w = Math.floor(tb + 1e-9), r2 = tsp - w * 3;
      return w + ' tbsp + ' + fmtQty(r2) + ' tsp';
    }
    return fmtQty(tsp) + ' tsp';
  }
  function fmtWt(oz) {
    if (oz >= 16 * 0.99) {
      var v = oz / 16;
      if (niceFrac(v)) return fmtQty(v) + ' lb';
      var w = Math.floor(v + 1e-9), rem = oz - w * 16;
      return w + ' lb' + (rem > 0.05 ? ' + ' + fmtQty(rem) + ' oz' : '');
    }
    return fmtQty(oz) + ' oz';
  }
  function fmtSize(s) { return s ? s.replace(/(\d)(oz|lb)/, '$1 $2') : ''; }

  /** Amount text for one merged row. */
  function fmtAmount(row) {
    if (row.fam === 'vol') return fmtVol(row.qty);
    if (row.fam === 'wt') return fmtWt(row.qty);
    if (row.fam === 'none') return row.noqty;
    var q = fmtQty(row.qty), u = row.cu === 'each' ? '' : ' ' + (row.qty > 1.012 ? pluralUnit(row.cu) : row.cu);
    return q + u + (row.size ? ' (' + fmtSize(row.size) + (row.qty > 1.012 ? ' each' : '') + ')' : '');
  }
  function pluralUnit(u) { return u === 'each' ? '' : (u + 's'); }


  /* ---------- substitution framework ----------
   * Conservative table of straightforward 1:1 swaps (same amount in, same amount out).
   * Keys are shopping-list item keys (the same keys used in each recipe's "m" entries).
   *  - avoid:   item people may want to avoid by default (powers the "never use" preference); first option is the default swap
   *  - match:   how the item appears in ingredient and method text
   *  - options: swap choices, first = default. Each: id (also the merge key), name (shown), aisle, staple, note (flavor/behavior)
   * Never add tree nuts as an option (family allergy). A test enforces this. */
  var SUBS = {
    'vegetable oil': { label: 'vegetable oil', avoid: true, match: /\b(?:vegetable|canola|salad) oil\b/i, options: [
      { id: 'avocado oil', name: 'avocado oil', aisle: 'Pantry & grains', staple: true,
        note: 'Mild flavor and a high smoke point, so it cooks like vegetable oil.' },
      { id: 'olive oil', name: 'olive oil', aisle: 'Pantry & grains', staple: true,
        note: 'Fruitier than vegetable oil. Fine for sautéing; in baking you may taste it.' }] },
    'sour cream': { label: 'sour cream', match: /\bsour cream\b/i, options: [
      { id: 'plain greek yogurt', name: 'plain Greek yogurt', aisle: 'Dairy & eggs', staple: false,
        note: 'Tangier and thicker. Stir it in off the heat and do not let it boil, or it can curdle.' }] },
    'chicken broth': { label: 'chicken broth', match: /\bchicken broth\b/i, options: [
      { id: 'vegetable broth', name: 'vegetable broth', aisle: 'Canned & jarred', staple: false,
        note: 'Lighter, slightly sweeter flavor.' }] }
  };
  var NUT_RE = /almond|walnut|pecan|cashew|pistachio|hazelnut|macadamia|brazil nut|pine nut|chestnut|praline|nut\b/i;

  /* ---------- manual swaps the shopper defines (saved on her device as cr.customSwaps; registered here at page load) ----------
   * { 'ground turkey': { to:'ground chicken', aisle?, note?, timeNote?, conv?:{perUnit:24, fam:'wt'}, textTo?, match?:'regex source' } }
   * A custom swap works exactly like a built-in one (shopping list, recipe text, calendar card) because it is added to SUBS as one more option
   * whose id is 'custom:<item>'. Tree-nut names are refused (family allergy), same rule as the built-in table. */
  var CUSTOM = {}, CUSTOM_BASE = {};
  function escRe(t) { return String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function customCheck(item, def) {
    if (!def || typeof def.to !== 'string') return 'Type what you are using instead.';
    var to = def.to.trim().toLowerCase();
    if (!to || to.length > 60) return 'Use a short name (up to 60 characters).';
    if (!/^[a-z0-9][a-z0-9 ,'()&\/\-]*$/.test(to)) return 'Use letters and numbers only.';
    if (NUT_RE.test(to)) return 'Common Roots keeps tree nuts out of swaps, so that name is not allowed.';
    if (to === item) return 'That is the same ingredient.';
    return '';
  }
  function setCustomSwaps(map) {
    Object.keys(CUSTOM).forEach(function (item) {
      var s = SUBS[item]; if (!s) return;
      s.options = s.options.filter(function (o) { return !o.custom; });
      if (CUSTOM_BASE[item] === false) delete SUBS[item];
    });
    CUSTOM = {}; CUSTOM_BASE = {};
    Object.keys(map || {}).forEach(function (item) {
      var d = map[item]; if (customCheck(item, d)) return;
      var to = d.to.trim().toLowerCase();
      CUSTOM_BASE[item] = !!SUBS[item];
      if (!SUBS[item]) SUBS[item] = { label: item, custom: true, match: d.match ? new RegExp(d.match, 'i') : new RegExp('\\b' + escRe(item) + 's?\\b', 'i'), options: [] };
      var opt = { id: 'custom:' + item, name: to, aisle: d.aisle || 'Other', staple: false, note: d.note || '', timeNote: d.timeNote || '', custom: true, conv: d.conv || null, textTo: d.textTo || null };
      SUBS[item].options.push(opt);
      CUSTOM[item] = opt;
    });
  }
  function customSwapsDef() { return CUSTOM; }
  function subOptions(item) { var s = SUBS[item]; return s ? s.options : []; }
  function subOption(item, optId) {
    var o = subOptions(item); for (var i = 0; i < o.length; i++) if (o[i].id === optId) return o[i]; return null;
  }
  /** Effective swaps {item: optionId}. explicit = saved choices ({item: id | 'orig'}); auto = "never use" preference on. */
  function effectiveSwaps(explicit, auto) {
    var out = {}; explicit = explicit || {};
    Object.keys(SUBS).forEach(function (item) {
      var c = explicit[item];
      if (c === 'orig') return;
      if (c && subOption(item, c)) { out[item] = c; return; }
      if (auto && SUBS[item].avoid) out[item] = SUBS[item].options[0].id;
    });
    return out;
  }
  /** Replace swapped item names in free text (ingredient line or method step). Single pass, so a swap never re-swaps. */
  function swapText(text, swaps) {
    var hits = [];
    Object.keys(swaps || {}).forEach(function (item) {
      var s = SUBS[item], o = s && subOption(item, swaps[item]); if (!o) return;
      var re = new RegExp(s.match.source, 'gi'), m;
      while ((m = re.exec(text)) !== null) hits.push({ i: m.index, len: m[0].length, to: o.textTo || o.name, src: m[0] });
    });
    hits.sort(function (a, b) { return a.i - b.i; });
    var out = '', pos = 0;
    hits.forEach(function (h) {
      if (h.i < pos) return;
      var to = /^[A-Z]/.test(h.src) ? h.to.charAt(0).toUpperCase() + h.to.slice(1) : h.to;
      out += text.slice(pos, h.i) + to; pos = h.i + h.len;
    });
    return out + text.slice(pos);
  }
  /** The wording an ingredient line used for a swappable item (e.g. "canola oil"), or null. */
  function originalWording(text, item) {
    var s = SUBS[item]; if (!s) return null; var m = text.match(s.match); return m ? m[0].toLowerCase() : null;
  }
  /** One merge entry after applying a swap (quantity and unit family are unchanged: swaps are 1:1). */
  function swapEntry(e, optId) {
    var o = subOption(e.item, optId); if (!o) return e;
    var n = {}; Object.keys(e).forEach(function (k) { n[k] = e[k]; });
    n.item = o.custom ? o.name : o.id; n.name = o.name; n.plural = undefined; n.aisle = o.aisle; n.staple = o.staple; n.swappedFrom = e.item;
    if (o.conv && o.conv.fam === 'wt' && o.conv.perUnit > 0) { n.fam = 'wt'; n.qty = (e.qty || 0) * o.conv.perUnit; n.cu = undefined; n.size = undefined; n.noqty = undefined; }
    return n;
  }
  /** The entries of an ingredient line with swaps applied. */
  function effectiveEntries(ing, swaps) {
    return ing.m.map(function (e) { return swaps && swaps[e.item] ? swapEntry(e, swaps[e.item]) : e; });
  }
  /** The first swappable item on an ingredient line, or null. */
  function swappableItem(ing) {
    for (var i = 0; i < ing.m.length; i++) if (SUBS[ing.m[i].item]) return ing.m[i].item;
    return null;
  }
  /** Which swappable items appear in which recipes (for reporting). */
  function swapIndex(recipes) {
    var out = {};
    recipes.forEach(function (r) { r.ingredients.forEach(function (ing) { ing.m.forEach(function (e) {
      if (SUBS[e.item]) { (out[e.item] = out[e.item] || []); if (out[e.item].indexOf(r.id) < 0) out[e.item].push(r.id); } }); }); });
    return out;
  }


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
    var tc = CONV[t], unit = tc.unit, counts = [], conv = {}, pools = {}, left = [], noneRows = [], measured = false;
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
    var parts = [], unitShort = unit === 'medium' ? ' medium' : (uw[1] ? ' ' + uw[1] : '');
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

  var api = { fmtQty: fmtQty, parseNum: parseNum, scaleText: scaleText, scaleStep: scaleStep, fmtVol: fmtVol, fmtWt: fmtWt,
              fmtAmount: fmtAmount, mergeSelection: mergeSelection, mergeConverted: mergeConverted, CONV: CONV, ALIAS: ALIAS, listToText: listToText,
              capital: capital, AISLES: AISLES, setCustomSwaps: setCustomSwaps, customCheck: customCheck, customSwapsDef: customSwapsDef,
              SUBS: SUBS, NUT_RE: NUT_RE, subOptions: subOptions, subOption: subOption, effectiveSwaps: effectiveSwaps, swapText: swapText,
              originalWording: originalWording, swapEntry: swapEntry, effectiveEntries: effectiveEntries, swappableItem: swappableItem, swapIndex: swapIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CRLib = api;
})(typeof window !== 'undefined' ? window : globalThis);

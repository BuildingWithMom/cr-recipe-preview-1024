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
      while ((m = re.exec(text)) !== null) hits.push({ i: m.index, len: m[0].length, to: o.name, src: m[0] });
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
    n.item = o.id; n.name = o.name; n.plural = undefined; n.aisle = o.aisle; n.staple = o.staple; n.swappedFrom = e.item;
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
    var rows = order.map(function (k) { return map[k]; });
    // drop "as needed / pinch / dash" rows when the same item already has a measured row
    var measured = {}; rows.forEach(function (r) { if (r.fam !== 'none') measured[r.item] = true; });
    rows = rows.filter(function (r) { return !(r.fam === 'none' && measured[r.item]); });
    rows.forEach(function (r) {
      r.amount = fmtAmount(r);
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

  var INSTACART_UNITS = { tsp: 'teaspoon', tbsp: 'tablespoon', cup: 'cup', qt: 'quart', oz: 'ounce', lb: 'pound', can: 'can', each: 'each', clove: 'each', stalk: 'each', slice: 'each' };
  /** Shape of the payload the Instacart shopping-list endpoint expects (not sent anywhere yet). */
  function instacartPayload(rows, title) {
    return {
      title: title || 'Common Roots shopping list', link_type: 'shopping_list',
      line_items: rows.filter(function (r) { return r.fam !== 'none' || true; }).map(function (r) {
        var meas;
        if (r.fam === 'vol') meas = [{ quantity: Math.round(r.qty / 48 * 1000) / 1000, unit: 'cup' }];
        else if (r.fam === 'wt') meas = [{ quantity: Math.round(r.qty / 16 * 1000) / 1000, unit: 'pound' }];
        else if (r.fam === 'none') meas = [{ quantity: 1, unit: 'each' }];
        else meas = [{ quantity: r.qty, unit: INSTACART_UNITS[r.cu] || 'each' }];
        return { name: r.item.replace(/^(fresh|dried) /, ''), display_text: capital(r.label), line_item_measurements: meas };
      })
    };
  }

  var api = { fmtQty: fmtQty, parseNum: parseNum, scaleText: scaleText, scaleStep: scaleStep, fmtVol: fmtVol, fmtWt: fmtWt,
              fmtAmount: fmtAmount, mergeSelection: mergeSelection, listToText: listToText, instacartPayload: instacartPayload,
              capital: capital, AISLES: AISLES,
              SUBS: SUBS, NUT_RE: NUT_RE, subOptions: subOptions, subOption: subOption, effectiveSwaps: effectiveSwaps, swapText: swapText,
              originalWording: originalWording, swapEntry: swapEntry, effectiveEntries: effectiveEntries, swappableItem: swappableItem, swapIndex: swapIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CRLib = api;
})(typeof window !== 'undefined' ? window : globalThis);

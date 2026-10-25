/* Common Roots: quantity parsing, fractions and unit-aware scaling of recipe text (pure; Node + browser). */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
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
    var pkgStart = -1;
    var lead = text.match(/^(\d+\s*&\s*\d+\/\d+|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/);
    if (lead && !all) {
      var rest = text.slice(lead[0].length);
      var pm = rest.match(/^\s*\(/);
      if (pm) pkgStart = lead[0].length + pm[0].length - 1;   // a package size such as (14 oz) right after the count is skipped below
    }
    var out = '', pos = 0, m, re = new RegExp(NUMRE.source, 'g');
    while ((m = re.exec(text)) !== null) {
      var off = m.index, tok = m[0], end = off + tok.length;
      var after = text.slice(end);
      out += text.slice(pos, off); pos = end;
      if (/^\s*%/.test(after)) { out += tok; continue; }
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
  function halfWhole(v) { return Math.abs(v * 2 - Math.round(v * 2)) < 0.02; }
  /** Volume (in tsp) to friendly text, e.g. 240 tsp -> "1¼ qt"; 16 tsp -> "⅓ cup"; 57 tsp -> "1 cup + 3 tbsp". */
  function fmtVol(tsp) {
    if (tsp < 0.05) return '0 tsp';
    var v;
    if (tsp >= 190) {
      v = tsp / 192;
      if (niceFrac(v)) return fmtQty(v, true) + ' qt';
      var wq = Math.floor(v + 1e-9), rq = tsp - wq * 192;
      return wq + ' qt + ' + fmtVol(rq);   // rq is never ~0 here: a near-whole count of quarts is a niceFrac
    }
    if (tsp >= 11.9) {
      v = tsp / 48;
      if (niceFrac(v)) return fmtQty(v, true) + ' ' + (v > 1.012 ? 'cups' : 'cup');
      var tb0 = tsp / 3;
      if (tsp < 24 && halfWhole(tb0)) return fmtQty(tb0) + ' tbsp';
      var q = Math.floor(tsp / 12 + 1e-9), rem = tsp - q * 12;
      return fmtQty(q / 4, true) + ' ' + (q > 4 ? 'cups' : 'cup') + ' + ' + fmtVol(rem);   // rem is never ~0 here (see above)
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
      return w + ' lb + ' + fmtQty(rem) + ' oz';
    }
    return fmtQty(oz) + ' oz';
  }
  function fmtSize(s) { return s ? s.replace(/(\d)(oz|lb)/, '$1 $2') : ''; }

  /** Amount text for one merged row. */
  function fmtAmount(row) {
    if (row.fam === 'vol') return fmtVol(row.qty);
    if (row.fam === 'wt') return fmtWt(row.qty);
    if (row.fam === 'none') return row.noqty;
    var q = fmtQty(row.qty), u = row.cu === 'each' ? '' : ' ' + (row.qty > 1.012 ? row.cu + 's' : row.cu);
    return q + u + (row.size ? ' (' + fmtSize(row.size) + (row.qty > 1.012 ? ' each' : '') + ')' : '');
  }

  var api = { fmtAmount: fmtAmount, fmtQty: fmtQty, fmtSize: fmtSize, fmtVol: fmtVol, fmtWt: fmtWt, parseNum: parseNum, scaleStep: scaleStep, scaleText: scaleText };
  if (NODE) module.exports = api; else root.CRScale = api;
})(typeof window !== 'undefined' ? window : globalThis);

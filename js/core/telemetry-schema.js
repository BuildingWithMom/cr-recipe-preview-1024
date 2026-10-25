/* Common Roots telemetry: the event schema. ONE source of truth for the browser (core/telemetry.js) and the collector Worker (workers/telemetry).
 * Privacy rules enforced here, not by convention:
 *   - an event or property that is not listed is dropped (never passed through);
 *   - there is no free-text type: only enums, bounded numbers, booleans, and identifiers matching a strict pattern;
 *   - ingredient names are only sent when they are in the app's own catalog (the client replaces anything else with "other");
 *   - no names, emails, addresses, notes, URLs or order contents are ever listed.
 * Each event documents WHY it exists and the QUESTION it answers (docs/TELEMETRY.md is generated from this file: `make telemetry-docs`). */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var VENDORS = ['walmart', 'tyner', 'market', 'elsewhere', 'have'];
  var PAGES = ['home', 'recipe', 'plan', 'week', 'kitchen', 'stats', 'debug', 'privacy'];
  var DAYS = ['0', '1', '2', '3', '4', '5', '6', 'pool', 'auto'];
  var TIERS = ['budget', 'better', 'best'];

  function en(v) { return { t: 'enum', v: v }; }
  function int(min, max) { return { t: 'int', min: min, max: max }; }
  function num(min, max) { return { t: 'num', min: min, max: max }; }
  var BOOL = { t: 'bool' }, RECIPE = { t: 'recipe' }, ITEM = { t: 'item' }, WID = { t: 'walmartId' }, CAT = { t: 'category' };

  var EVENTS = {
    page_view: { props: { page: en(PAGES) }, why: 'Count visits per page.', asks: 'Which pages are used? Where does the funnel start?' },
    recipe_viewed: { props: { recipe: RECIPE }, why: 'Which recipes people open.', asks: 'Which recipes attract interest (to decide which videos to make first)?' },
    recipe_filter_used: { props: { filter: CAT }, why: 'Which recipe categories are browsed.', asks: 'Which categories matter?' },
    recipe_added_to_plan: { props: { recipe: RECIPE }, why: 'Step 1 of the funnel (Pick).', asks: 'Funnel: pick -> days -> cart -> order.' },
    recipe_added_to_week: { props: { recipe: RECIPE, day: en(DAYS), from: en(['week', 'recipe']) }, why: 'A recipe was put on a day (or the waiting list).', asks: 'Do people plan days, and where do they add recipes from?' },
    day_assigned: { props: { day: en(DAYS), via: en(['chooser', 'move', 'suggestion']) }, why: 'A dinner was placed or moved to a weekday.', asks: 'Which weekdays are planned? How often do people rearrange?' },
    servings_changed: { props: { recipe: RECIPE, factor: num(0.1, 20), servings: int(1, 100) }, why: 'Servings scaling.', asks: 'Do people scale recipes, and by how much (affects pack rounding)?' },
    household_set: { props: { n: int(0, 50) }, why: 'The "Serves N" setting (a number only).', asks: 'Typical household size.' },
    pairing_accepted: { props: { recipe: RECIPE }, why: 'A suggested side was accepted.', asks: 'Are pairing suggestions useful?' },
    freshness_order_suggested: { props: { changes: int(0, 7) }, why: '"Order by freshness" was pressed.', asks: 'Is freshness ordering used? How many days would it change?' },
    freshness_order_applied: { props: {}, why: 'The suggested freshness order was applied.', asks: 'Do people accept the suggestion?' },
    order_by_banner_shown: { props: { state: en(['arrival_due', 'shop_today', 'shop_later', 'late', 'undated', 'waiting']) }, why: 'Which "when to order" message the cart showed.', asks: 'How often are items too late for their day? How many people never put recipes on days?' },
    cart_opened: { props: { recipes: int(0, 100) }, why: 'The cart step became visible.', asks: 'Funnel: how many plans reach the cart?' },
    vendor_reroute: { props: { item: ITEM, to: en(['auto'].concat(VENDORS)) }, why: 'A line was sent to another vendor from the "Where" menu.', asks: 'Which ingredients get rerouted, and to whom (e.g. chicken to the farm)?' },
    item_swapped: { props: { item: ITEM, to: ITEM, kind: en(['preset', 'custom', 'undo']) }, why: 'An ingredient swap was chosen (no typed text is sent: custom swaps only say "custom").', asks: 'Which swaps are common? Do people need custom swaps?' },
    item_swap_removed: { props: { item: ITEM }, why: 'A custom swap was removed.', asks: 'Are custom swaps sticky?' },
    preference_changed: { props: { pref: en(['no_veg_oil']), on: BOOL }, why: 'A food preference toggle.', asks: 'How many people use the no-vegetable-oil preference?' },
    pantry_marked: { props: { item: ITEM, have: BOOL }, why: 'A pantry check answer.', asks: 'Which staples do people already have (to stop selling them)?' },
    pantry_staples_marked: { props: {}, why: '"I have all staples" was tapped.', asks: 'Is the pantry check being used?' },
    pantry_done: { props: { have: int(0, 200) }, why: 'The pantry check was finished.', asks: 'How many staples do people already own?' },
    tier_changed: { props: { tier: en(TIERS) }, why: 'Walmart Budget/Better/Best choice.', asks: 'Which tier do people pick?' },
    tier_overridden: { props: { item: ITEM, tier: en(['plan'].concat(TIERS)) }, why: 'A single ingredient was moved to another tier.', asks: 'Which ingredients do people upgrade or downgrade?' },
    source_changed: { props: { source: en(['walmart', 'farm']), from: en(['user', 'oos']) }, why: 'Walmart vs farm-fresh choice.', asks: 'Do people choose farm-fresh, and is it after an out-of-stock?' },
    walmart_link_clicked: { props: { mode: en(['link', 'coming_soon', 'none_mapped']), items: int(0, 300), unmapped: int(0, 300) }, why: 'The Walmart cart link was opened.', asks: 'Where do carts fail? How many lines are unmapped per cart?' },
    walmart_checklist_opened: { props: { items: int(0, 300) }, why: 'The Walmart checklist opened Walmart.', asks: 'How often is the checklist route used instead of the plain link?' },
    item_marked_out_of_stock: { props: { walmartId: WID }, why: 'A Walmart item was reported out of stock for the shopper.', asks: 'Which Walmart items are out of stock most (to pick better backups)?' },
    walmart_substitute_chosen: { props: { walmartId: WID }, why: 'A backup Walmart product was chosen.', asks: 'Which backups get used?' },
    oos_list_cleared: { props: {}, why: 'The out-of-stock memory was cleared.', asks: 'Is the memory annoying or helpful?' },
    order_placed_tapped: { props: { vendor: en(VENDORS), lines: int(0, 300), oos: int(0, 300) }, why: '"I placed this order" was tapped.', asks: 'Funnel: how many carts become orders, per vendor?' },
    arrival_prompt_answered: { props: { vendor: en(VENDORS), got: int(0, 300), of: int(0, 300) }, why: '"Did it arrive?" was answered.', asks: 'How often do items not arrive (per vendor)?' },
    order_cancelled: { props: { vendor: en(VENDORS) }, why: 'An order record was cancelled.', asks: 'Are orders being abandoned?' },
    delivery_settings_changed: { props: {}, why: 'Delivery days/cutoffs were edited.', asks: 'Are our default vendor delivery days wrong?' },
    shop_this_week: { props: { from: en(['kitchen', 'week']), recipes: int(0, 100) }, why: '"Shop this week" was pressed.', asks: 'Funnel: days -> cart.' },
    list_copied: { props: { scope: en(['plan', 'recipe']), items: int(0, 500) }, why: 'A shopping list was copied.', asks: 'Do people take the list elsewhere?' },
    ics_exported: { props: { days: int(0, 7) }, why: 'The calendar file was downloaded.', asks: 'Is calendar export used?' },
    plan_cleared: { props: {}, why: 'The plan was cleared.', asks: 'Are people starting over?' },
    email_signup_submitted: { props: {}, why: 'The sign-up form was submitted (the address is never part of an event).', asks: 'Interest in the newsletter.' },
    consent_changed: { props: { choice: en(['off', 'local', 'remote']) }, why: 'The visitor changed their privacy choice.', asks: 'How many opt in to sharing?' },
    error: { props: { kind: en(['error', 'unhandledrejection']), message: { t: 'scrubbed', max: 300 }, stack: { t: 'scrubbed', max: 1200 }, source: { t: 'scrubbed', max: 120 }, line: int(0, 100000), col: int(0, 100000), page: en(PAGES) },
      why: 'An uncaught JavaScript error (message and stack only, scrubbed of URLs\' queries, emails and long numbers).', asks: 'Where does the app break, on which page?' }
  };

  /** Old event names (kept so the on-device counts at cr.events keep working) -> canonical event + a prop mapper. A null event is counted on this device only. */
  var ALIASES = {
    view_recipe: { event: 'recipe_viewed', map: function (p) { return { recipe: p.id }; } },
    view_plan: { event: null }, view_week: { event: null }, view_kitchen: { event: null },
    filter: { event: 'recipe_filter_used', map: function (p) { return { filter: p.f }; } },
    add_to_plan: { event: 'recipe_added_to_plan', map: function (p) { return { recipe: p.id }; } },
    add_to_week: { event: 'recipe_added_to_week', map: function (p) { return { recipe: p.id, day: p.day, from: p.from || 'recipe' }; } },
    scale_change: { event: 'servings_changed', map: function (p) { return { recipe: p.id, factor: p.f, servings: p.servings }; } },
    household: { event: 'household_set', map: function (p) { return { n: p.n }; } },
    pairing_accept: { event: 'pairing_accepted', map: function (p) { return { recipe: p.id }; } },
    order_by_freshness: { event: 'freshness_order_suggested' },
    apply_freshness_order: { event: 'freshness_order_applied' },
    reroute: { event: 'vendor_reroute' },
    swap: { event: 'item_swapped', map: function (p) { return p.undo ? { kind: 'undo' } : { item: p.item, to: p.to, kind: 'preset' }; } },
    manual_swap: { event: 'item_swapped', map: function (p) { return { item: p.item, kind: 'custom' }; } },
    manual_swap_remove: { event: 'item_swap_removed' },
    pref_never_veg_oil: { event: 'preference_changed', map: function (p) { return { pref: 'no_veg_oil', on: p.on }; } },
    pantry_toggle: { event: 'pantry_marked' }, pantry_item: { event: 'pantry_marked' },
    pantry_staples_all: { event: 'pantry_staples_marked' },
    tier_change: { event: 'tier_changed' }, tier_override: { event: 'tier_overridden' },
    source_change: { event: 'source_changed', map: function (p) { return { source: p.source, from: p.from || 'user' }; } },
    walmart_click: { event: 'walmart_link_clicked' },
    walmart_open: { event: 'walmart_checklist_opened' },
    walmart_oos: { event: 'item_marked_out_of_stock', map: function (p) { return { walmartId: p.id }; } },
    walmart_oos_reset: { event: 'oos_list_cleared' },
    walmart_swap: { event: 'walmart_substitute_chosen', map: function (p) { return { walmartId: p.to }; } },
    order_placed: { event: 'order_placed_tapped' },
    order_received: { event: 'arrival_prompt_answered' },
    order_cancel: { event: 'order_cancelled' },
    deliv_settings: { event: 'delivery_settings_changed' },
    shop_this_week: { event: 'shop_this_week' },
    copy_list: { event: 'list_copied', map: function (p) { return { scope: p.scope, items: p.items }; } },
    download_ics: { event: 'ics_exported' },
    clear_plan: { event: 'plan_cleared' },
    email_signup: { event: 'email_signup_submitted' }
  };

  var ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/, ITEM_RE = /^[a-z][a-z '-]{0,39}$/, WID_RE = /^\d{4,12}$/, CAT_RE = /^[A-Za-z][A-Za-z &\/-]{0,39}$/;

  /** Remove anything that could carry personal data from an error string: URL query/hash, emails, long digit runs; then cut to max. */
  function scrub(s, max) {
    s = String(s == null ? '' : s)
      .replace(/(https?:\/\/[^\s?#)]*)[?#][^\s)]*/g, '$1')
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
      .replace(/\d{6,}/g, '[num]');
    return s.length > max ? s.slice(0, max) : s;
  }

  /** One property value against its spec. Returns { ok:true, value } or { ok:false }. ctx.known = { recipes:{id:1}, items:{name:1}, categories:{name:1} } (optional; client only). */
  function checkValue(spec, v, ctx) {
    var known = (ctx && ctx.known) || null;
    switch (spec.t) {
      case 'enum': { var sv = typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string' ? String(v) : null; return sv !== null && spec.v.indexOf(sv) >= 0 ? { ok: true, value: sv } : { ok: false }; }
      case 'int': case 'num': {
        if (typeof v !== 'number' || !isFinite(v)) return { ok: false };
        var x = spec.t === 'int' ? Math.round(v) : Math.round(v * 1000) / 1000;
        return { ok: true, value: Math.min(spec.max, Math.max(spec.min, x)) };
      }
      case 'bool': return typeof v === 'boolean' ? { ok: true, value: v } : { ok: false };
      case 'recipe': return typeof v === 'string' && ID_RE.test(v) && (!known || known.recipes[v]) ? { ok: true, value: v } : { ok: false };
      case 'item': {
        if (typeof v !== 'string' || !ITEM_RE.test(v)) return { ok: false };
        return { ok: true, value: !known || known.items[v] ? v : 'other' };
      }
      case 'category': {
        if (typeof v !== 'string' || !CAT_RE.test(v)) return { ok: false };
        return { ok: true, value: !known || known.categories[v] ? v : 'other' };
      }
      case 'walmartId': { var ws = typeof v === 'number' ? String(v) : v; return typeof ws === 'string' && WID_RE.test(ws) ? { ok: true, value: ws } : { ok: false }; }
      default: /* scrubbed */ return typeof v === 'string' ? { ok: true, value: scrub(v, spec.max) } : { ok: false };
    }
  }

  /** Validate a canonical event. Returns { name, props } with only allowed, valid props, or null when the event is unknown. */
  function validate(name, props, ctx) {
    var def = Object.prototype.hasOwnProperty.call(EVENTS, name) ? EVENTS[name] : null;
    if (!def) return null;
    var out = {}; props = props && typeof props === 'object' ? props : {};
    Object.keys(def.props).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) return;
      var r = checkValue(def.props[k], props[k], ctx);
      if (r.ok) out[k] = r.value;
    });
    return { name: name, props: out };
  }

  /** Legacy track() name + props -> canonical { name, props } or null (device-only counter). */
  function canonical(name, props) {
    var a = Object.prototype.hasOwnProperty.call(ALIASES, name) ? ALIASES[name] : null;
    props = props && typeof props === 'object' ? props : {};
    if (a) return a.event ? { name: a.event, props: a.map ? a.map(props) : props } : null;
    return Object.prototype.hasOwnProperty.call(EVENTS, name) ? { name: name, props: props } : null;
  }

  var api = { EVENTS: EVENTS, ALIASES: ALIASES, validate: validate, canonical: canonical, scrub: scrub, checkValue: checkValue, PAGES: PAGES, VENDORS: VENDORS };
  if (NODE) module.exports = api; else root.CRTelemetrySchema = api;
})(typeof window !== 'undefined' ? window : globalThis);

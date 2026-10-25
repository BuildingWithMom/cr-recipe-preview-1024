/* Common Roots: the one flow (Pick -> Days -> Cart). Pure logic, no DOM. Works in the browser (window.CRFlow) and in Node (tests).
 *
 * What lives here
 *   - vendor lead-time planning: for every shopping line, which vendor, which delivery day, the order-by moment, and ONE "shop on" day (the longest lead wins);
 *   - day badges for the planner (Ready / Order by ... / Too late, with the first day that would work);
 *   - the shopper's own bookkeeping, all on this device: where each line comes from (cr.src), line status (cr.status), "I placed this order" records (cr.orders),
 *     pantry answers (cr.pantry, cr.pantryDone), delivery settings (cr.vendorCfg), household servings (cr.household), manual swaps (cr.customSwaps);
 *   - cart-total honesty ("N of M items priced") and "you will have leftovers" labels;
 *   - shopping reminders for the calendar file.
 * We cannot see anyone's orders: every "bought" state is something the shopper told us.
 * Dates are plain 'YYYY-MM-DD' strings and times 'HH:MM', America/New_York wall-clock time; the arithmetic is calendar arithmetic, never Date-offset arithmetic. */
/* Facade over vendors/lead-times.js, cart/state.js and calendar/reminders.js: same API as before the split. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var CRLeadTimes = NODE ? require('./vendors/lead-times.js') : root.CRLeadTimes;
  var CRCartState = NODE ? require('./cart/state.js') : root.CRCartState;
  var CRReminders = NODE ? require('./calendar/reminders.js') : root.CRReminders;
  var api = Object.assign({}, CRLeadTimes, CRCartState, CRReminders);
  if (NODE) module.exports = api; else root.CRFlow = api;
})(typeof window !== 'undefined' ? window : globalThis);

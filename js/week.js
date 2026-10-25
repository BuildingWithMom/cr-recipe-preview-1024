/* Common Roots: "My week" logic. Pure functions, no DOM. Works in the browser (window.CRWeek) and in Node (tests).
 * State shape (saved by the page as JSON in localStorage key "cr.week"):
 *   { v:1, start:'YYYY-MM-DD'|null, time:'HH:MM', tz:'America/Indiana/Indianapolis'|'floating'|..., len:60,
 *     alarms:{dinner:true, prep:true}, days:[{items:[{id,f}], pinned:false} x7 (Mon..Sun)], pool:[{id,f}] }
 * f is the same servings multiplier as the plan page uses (1 = the recipe as written).
 * Dates are plain calendar arithmetic on 'YYYY-MM-DD' strings, so daylight-saving changes cannot shift a day. */
/* Facade over planner/*.js and calendar/ics.js: same API as before the split. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var CRDates = NODE ? require('./planner/dates.js') : root.CRDates;
  var CRWeekState = NODE ? require('./planner/state.js') : root.CRWeekState;
  var CRFreshness = NODE ? require('./planner/freshness.js') : root.CRFreshness;
  var CRPairing = NODE ? require('./planner/pairing.js') : root.CRPairing;
  var CRIcs = NODE ? require('./calendar/ics.js') : root.CRIcs;
  var CRShare = NODE ? require('./planner/share.js') : root.CRShare;
  var CRVideo = NODE ? require('./planner/video.js') : root.CRVideo;
  var api = Object.assign({}, CRDates, CRWeekState, CRFreshness, CRPairing, CRIcs, CRShare, CRVideo);
  if (NODE) module.exports = api; else root.CRWeek = api;
})(typeof window !== 'undefined' ? window : globalThis);

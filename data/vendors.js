/* Common Roots: vendor delivery and ordering facts, used ONLY to plan "when to shop" in the Cart step.
 * Edit this file (or use the Delivery settings in the Cart step, saved on this device) when a fact changes.
 * Weekdays are numbered like the planner: 0 = Monday ... 6 = Sunday. Time zone for all clock times: America/New_York.
 *
 * Confidence marks (shown as a small "confirm at checkout" tag when not [V]):
 *   [V] read on the vendor's own page, or told to us by the shopper for her own address.
 *   [S] secondary source (search summary, news, review).
 *   [U] unknown: we have no source. NOT guessed: where a value is needed to plan, a clearly labeled planning buffer is used instead (see "buffer").
 *
 * cutoff = the vendor's own order deadline, relative to the arrival date: { daysBefore, time:'HH:MM' }. null = unknown.
 * buffer = OUR planning allowance when the cutoff is unknown. It is not the vendor's rule and the page says so.
 * lastArrivalOffset = how many days before dinner the order may arrive at the latest (0 = same day, e.g. pickup; 1 = by the day before).
 * frozen = arrives frozen (thaw in the fridge before cooking), so fridge shelf life does not limit how early it can arrive.
 * Sources: research notes in proposals/farm_national_options.md (Oct 25, 2026). */
(function (root) {
  var D = {
    asOf: 'Sun Oct 25, 2026',
    tz: 'America/New_York',
    order: ['tyner', 'market', 'walmart'],
    vendors: {
      walmart: {
        id: 'walmart', name: 'Walmart', short: 'Walmart', kind: 'cart-link', frozen: false,
        arriveDays: null,                      // any day: pickup or delivery slots
        lastArrivalOffset: 0,
        cutoff: null,
        buffer: { daysBefore: 1, time: '20:00', text: 'We plan on ordering the evening before. Walmart shows real pickup and delivery slots for your store once the cart opens.' },
        minOrder: null,
        confidence: 'U', confidenceNote: 'Slots depend on your store. The timing is a planning allowance.',
        buttonLabel: 'Open Walmart link'
      },
      tyner: {
        id: 'tyner', name: 'Tyner Pond Farm', short: 'Tyner', kind: 'cart-link', frozen: true,
        arriveDays: [1, 3],                    // Tuesday and Thursday to your house (told to us by you)
        lastArrivalOffset: 1,
        cutoff: null,                          // not published and not confirmed
        buffer: { daysBefore: 2, time: '23:59', text: 'Their order cutoff is not published and we have not confirmed it. We plan on ordering two days before delivery to be safe. Tell us the real cutoff in Delivery settings.' },
        minOrder: null,                        // $63 vs "about $99": unconfirmed, see minNote
        minNote: 'We have seen $63 (an earlier copy of their site) and "usually around $99" (their Dec 2025 blog). Unconfirmed: check at checkout.',
        confidence: 'V', confidenceNote: 'Delivery days Tuesday and Thursday come from you for your address. Cutoff and minimum are unconfirmed.',
        buttonLabel: 'Open Tyner cart'
      },
      market: {
        id: 'market', name: 'Market Wagon (Westfield)', short: 'Market Wagon', kind: 'checklist', frozen: false,
        arriveDays: [3],                       // Thursday only for Westfield 46074
        lastArrivalOffset: 1,
        cutoff: { daysBefore: 1, time: '01:00' },   // orders close Wednesday 1:00 AM for Thursday delivery
        buffer: null,
        minOrder: null, minNote: 'Flat delivery fee; amount not confirmed.',
        confidence: 'S', confidenceNote: 'Thursday delivery and the Wednesday 1:00 AM close come from Market Wagon\u2019s Westfield page (via search) and your own Thursday; confirm at checkout.',
        buttonLabel: 'Open the Market Wagon checklist'
      }
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = D; else root.CR_VENDORS = D;
})(typeof window !== 'undefined' ? window : globalThis);

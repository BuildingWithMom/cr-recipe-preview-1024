/* Common Roots: the vendor adapter registry. Every vendor the cart can route to implements ONE interface (docs/ADDING_A_VENDOR.md):
 *   { id, label, kind: 'cart-link' | 'checklist' | 'placeholder', flag: string|null, groupUrl(group, ctx) -> string|null }
 * 'flag' names a feature flag (data/flags.js); an adapter whose flag is off is listed but never enabled. Pure; Node + browser. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var KINDS = ['cart-link', 'checklist', 'placeholder'];

  function createRegistry() {
    var byId = {}, order = [];
    function register(a) {
      if (!a || typeof a.id !== 'string' || !a.id) throw new Error('vendor adapter needs an id');
      if (KINDS.indexOf(a.kind) < 0) throw new Error('vendor adapter ' + a.id + ': unknown kind ' + a.kind);
      if (typeof a.groupUrl !== 'function') throw new Error('vendor adapter ' + a.id + ': groupUrl(group, ctx) is required');
      if (byId[a.id]) throw new Error('vendor adapter ' + a.id + ' is already registered');
      byId[a.id] = a; order.push(a.id); return a;
    }
    function get(id) { return byId[id] || null; }
    function enabled(a, isOn) { return !a.flag || !!(isOn && isOn(a.flag)); }
    function list() { return order.map(function (id) { return byId[id]; }); }
    function ids(isOn) { return list().filter(function (a) { return enabled(a, isOn); }).map(function (a) { return a.id; }); }
    return { register: register, get: get, list: list, ids: ids, enabled: enabled, KINDS: KINDS };
  }
  var api = { createRegistry: createRegistry, KINDS: KINDS };
  if (NODE) { api.registry = createRegistry(); module.exports = api; }
  else { api.registry = createRegistry(); root.CRVendorRegistry = api; }
})(typeof window !== 'undefined' ? window : globalThis);

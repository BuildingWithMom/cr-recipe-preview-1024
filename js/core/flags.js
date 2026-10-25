/* Common Roots: feature flags. Defaults come from data/flags.js; a visitor's own device can override with localStorage "cr.flags" (set from debug.html). */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var Store = NODE ? require('./storage.js') : root.CRStorage;
  var KEY = 'cr.flags';
  /** createFlags(defaults, storage) -> { isOn(name), all(), setOverride(name, on|null), overrides() } */
  function createFlags(defaults, storage) {
    function overrides() { var o = Store.rd(storage, KEY, {}); return Store.isObj(o) ? o : {}; }
    function isOn(name) {
      var o = overrides();
      if (Object.prototype.hasOwnProperty.call(o, name)) return o[name] === true;
      return defaults[name] === true;
    }
    function all() { var out = {}; Object.keys(defaults).forEach(function (k) { out[k] = isOn(k); }); return out; }
    function setOverride(name, on) {
      if (!Object.prototype.hasOwnProperty.call(defaults, name)) return false;
      var o = overrides(); if (on === null) delete o[name]; else o[name] = !!on;
      return Store.wr(storage, KEY, o);
    }
    return { isOn: isOn, all: all, setOverride: setOverride, overrides: overrides, KEY: KEY };
  }
  var api = { createFlags: createFlags, KEY: KEY };
  if (NODE) module.exports = api; else {
    root.CRFlagsLib = api;
    root.CRFlags = createFlags(root.CR_FLAGS, Store.local());
  }
})(typeof window !== 'undefined' ? window : globalThis);

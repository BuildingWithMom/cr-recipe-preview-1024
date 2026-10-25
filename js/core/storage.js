/* Common Roots: safe JSON storage helpers. Works with anything that has getItem/setItem (window.localStorage, or a test double).
 * A storage that throws (private mode, quota, blocked) never breaks the app: reads fall back to the default, writes return false. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  function rd(storage, k, d) { try { var v = storage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function wr(storage, k, v) { try { storage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  /** The page's own store: JSON values in window.localStorage under the cr.* keys (key names are a public contract, see docs/ARCHITECTURE.md). */
  /** window.localStorage / sessionStorage, or null when the browser blocks them (reading the property can throw). */
  function local() { try { return root.localStorage; } catch (e) { return null; } }
  function session() { try { return root.sessionStorage; } catch (e) { return null; } }
  var store = {
    get: function (k, d) { return rd(local(), k, d); },
    set: function (k, v) { wr(local(), k, v); }
  };
  var api = { rd: rd, wr: wr, isObj: isObj, store: store, local: local, session: session };
  if (NODE) module.exports = api; else root.CRStorage = api;
})(typeof window !== 'undefined' ? window : globalThis);

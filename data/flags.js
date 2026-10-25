/* Common Roots feature flags. Edit here; one line per flag, with a comment. A visitor can override a flag on their own device from debug.html
 * (stored at localStorage "cr.flags", e.g. {"kroger": true}); the file default is what everyone else gets.
 * Rules: a flag guards a whole feature, never a single bug fix; delete the flag when the feature ships for good. */
(function (root) {
  var D = {
    telemetry: true,    // Master switch for telemetry. false = no events recorded at all, no banner. (Remote sending also needs an endpoint + opt-in.)
    debugPage: true,    // debug.html shows the local event log. Turn off to make the page say "disabled".
    kroger: false,      // Kroger vendor adapter (placeholder only; no Kroger code runs while this is false). Kroger terms: see docs/ADDING_A_VENDOR.md.
    preferences: false  // Reserved for the coming Preferences + substitution engine (docs/ARCHITECTURE.md).
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = D; else root.CR_FLAGS = D;
})(typeof window !== 'undefined' ? window : globalThis);

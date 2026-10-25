/* Common Roots telemetry config. endpoint is EMPTY by default: events stay on this device. To enable opt-in remote sending, deploy
 * workers/telemetry (needs the owner's Cloudflare login) and put its https URL here, e.g. 'https://telemetry.example.workers.dev/v1/events'.
 * Even then, nothing is sent unless the visitor chooses "Share anonymously" on the privacy page or banner. */
(function (root) {
  var D = { endpoint: '', ringSize: 300, flushAt: 10, flushMs: 10000, level: 'info', version: '0.1.0' };
  if (typeof module !== 'undefined' && module.exports) module.exports = D; else root.CR_TELEMETRY_CONFIG = D;
})(typeof window !== 'undefined' ? window : globalThis);

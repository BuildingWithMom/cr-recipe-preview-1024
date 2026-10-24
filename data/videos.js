/* Common Roots: cooking videos, one line per recipe. EMPTY on purpose: nothing is linked until a real video exists.
 *
 * How to add one (see README.md): add a line  'recipe-id': 'https://...'  inside the object below.
 * Accepted: a YouTube link (watch, youtu.be or embed), a Vimeo link, or a direct .mp4 link (https:// or a path in this site).
 * Optional chapters, as an object instead of a string:
 *   'cod-dijon': { url: 'https://youtu.be/XXXXXXXXXXX', chapters: [ { t: '0:00', label: 'Mix the sauce' }, { t: '1:30', label: 'Bake' } ] }
 * Recipe ids are the file names in recipes/ without .html.
 */
(function () {
  var V = {
    // 'recipe-id': 'https://www.youtube.com/watch?v=VIDEO_ID',
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = V; else window.CR_VIDEOS = V;
})();

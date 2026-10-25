/* Common Roots: video link parsing for recipe video slots (YouTube-nocookie, Vimeo, mp4). Pure. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  /* ---------- video slots ---------- */
  function videoUrlOf(entry) { return typeof entry === 'string' ? entry : (entry && typeof entry.url === 'string' ? entry.url : null); }
  function parseClock(t) {
    if (t == null || t === '') return null;   // no time given is not 0:00
    var p = String(t).split(':').map(Number); if (!p.length || p.length > 3 || p.some(function (x) { return !isFinite(x) || x < 0; })) return null;
    return p.reduce(function (a, x) { return a * 60 + x; }, 0);
  }
  /** Turn a videos.js entry (string or {url, chapters}) into something safe to embed, or null. Only https (or a site-relative .mp4) is accepted. */
  function parseVideo(entry) {
    var url = videoUrlOf(entry); if (!url) return null; url = url.trim();
    var chapters = (entry && Array.isArray(entry.chapters) ? entry.chapters : []).map(function (c) { var s = c ? parseClock(c.t) : null; return s === null || !c.label ? null : { t: String(c.t), seconds: s, label: String(c.label) }; }).filter(Boolean);
    var m, base = { url: url, chapters: chapters };
    if ((m = /^https:\/\/(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)([\w-]{11})(?:[&?#].*)?$/i.exec(url)) || (m = /^https:\/\/youtu\.be\/([\w-]{11})(?:[?#].*)?$/i.exec(url))) {
      return Object.assign(base, { type: 'youtube', id: m[1], embed: function (start) { return 'https://www.youtube-nocookie.com/embed/' + m[1] + (start ? '?start=' + Math.floor(start) : ''); } });
    }
    if ((m = /^https:\/\/(?:www\.)?vimeo\.com\/(?:video\/)?(\d{6,12})(?:[\/?#].*)?$/i.exec(url)) || (m = /^https:\/\/player\.vimeo\.com\/video\/(\d{6,12})(?:[?#].*)?$/i.exec(url))) {
      return Object.assign(base, { type: 'vimeo', id: m[1], embed: function (start) { return 'https://player.vimeo.com/video/' + m[1] + '?dnt=1' + (start ? '#t=' + Math.floor(start) + 's' : ''); } });
    }
    if (/^(https:\/\/|(?!\/\/)(?![a-z][a-z0-9+.-]*:)[^\s])[^\s]*\.mp4(?:[?#][^\s]*)?$/i.test(url)) return Object.assign(base, { type: 'mp4', src: url });
    return null;
  }

  var api = { parseVideo: parseVideo, videoUrlOf: videoUrlOf };
  if (NODE) module.exports = api; else root.CRVideo = api;
})(typeof window !== 'undefined' ? window : globalThis);

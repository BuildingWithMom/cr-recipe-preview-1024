/* Common Roots: tiny DOM helpers (element builder, toast, copy to clipboard). */
(function () {
  'use strict';
  /* ---------- helpers ---------- */
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function toast(msg) {
    var t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg; t.hidden = false; clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 3500);
  }
  function copyText(text) {
    return new Promise(function (resolve) {
      function fallback() {
        try {
          var ta = el('textarea', { 'aria-hidden': 'true' }); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); document.body.removeChild(ta); resolve(ok);
        } catch (e) { resolve(false); }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { resolve(true); }, fallback);
      else fallback();
    });
  }

  window.CRDom = { copyText: copyText, el: el, toast: toast };
})();

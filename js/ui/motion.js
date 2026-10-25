/* Common Roots: FLIP list reordering (Web Animations API, off under prefers-reduced-motion). */
(function () {
  'use strict';
  /* ---------- motion: FLIP list reordering (no libraries) ---------- */
  var MOTION = { ms: 300, ease: 'cubic-bezier(.2,.8,.25,1)' };
  var rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
  function reducedMotion() { return rmq.matches; }
  /**
   * Runs mutate() (which re-renders the list) and animates every [data-flip] element from where it was to where it is now.
   * Elements are matched by their data-flip key, so the DOM may be rebuilt. Positions are read with getBoundingClientRect,
   * which includes any in-flight transform, so rapid repeated clicks continue smoothly from where rows currently appear.
   * opts.key = the toggled element's key (gets a quick fade and sits above the others while it travels); opts.have = its new state.
   */
  function flip(root, mutate, opts) {
    if (reducedMotion()) { mutate(); return; }
    var first = {}, active = document.activeElement, activeKey = null, activeTag = active.tagName.toLowerCase();
    root.querySelectorAll('[data-flip]').forEach(function (e) { first[e.getAttribute('data-flip')] = e.getBoundingClientRect(); });
    var holder = active.closest('[data-flip]');
    if (holder && root.contains(holder)) activeKey = holder.getAttribute('data-flip');
    mutate();
    root.querySelectorAll('[data-flip]').forEach(function (e) {
      var k = e.getAttribute('data-flip'), f = first[k], isKey = k === opts.key;
      if (activeKey === k) e.querySelector(activeTag === 'select' ? 'select' : 'input').focus({ preventScroll: true });
      var anims = [];
      if (!f) anims.push(e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' }));
      else {
        var l = e.getBoundingClientRect(), dx = f.left - l.left, dy = f.top - l.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          anims.push(e.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }], { duration: MOTION.ms, easing: MOTION.ease }));
        }
      }
      if (isKey) {
        anims.push(e.animate(opts.have ? [{ opacity: 1 }, { opacity: 0.6 }] : [{ opacity: 0.6 }, { opacity: 1 }], { duration: MOTION.ms, easing: 'ease-out' }));
        if (opts.have) e.querySelector('input[type=checkbox]').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
        e.style.position = 'relative'; e.style.zIndex = '3';
        var done = function () { e.style.position = ''; e.style.zIndex = ''; };
        anims[0].onfinish = done; anims[0].oncancel = done;
      }
    });
  }

  window.CRMotion = { flip: flip };
})();

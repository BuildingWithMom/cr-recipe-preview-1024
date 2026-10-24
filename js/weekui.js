/* Common Roots: browser side of "My week", "My Kitchen", the Add-to-my-week chooser, video slots and printable cards.
 * Everything is stored in this browser (localStorage "cr.week"). No server, nothing is sent anywhere, and the site never touches anyone's calendar:
 * it only builds a .ics file and Google Calendar links for the shopper to use. */
(function () {
  'use strict';
  var W = window.CRWeek, L = window.CRLib, CRapp = window.CR, RECIPES = window.CR_RECIPES || [];
  if (!W || !L || !CRapp) return;
  var byId = {}; RECIPES.forEach(function (r) { byId[r.id] = r; });
  var page = window.CR_PAGE;
  var ROOT = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/js\/weekui\.js(\?.*)?$/, '') : location.href.replace(/[^\/]*$/, ''); })();

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function track(n, p) { try { CRapp.track(n, p); } catch (e) {} }
  function today() { return W.localDateStr(new Date()); }
  function ctx() { return { recipes: RECIPES, L: L, swaps: CRapp.swaps(), fresh: window.CR_FRESH || { items: {}, prep: {} }, videos: window.CR_VIDEOS || {}, baseUrl: ROOT }; }
  function loadState() { return W.load(localStorage, RECIPES); }
  function saveState(s) { if (!s.start && W.plannedCount(s)) s.start = W.weekStart(s, today()); W.save(localStorage, s); updateWeekBadge(s); }
  function updateWeekBadge(s) {
    var b = document.getElementById('week-count'); if (!b) return; s = s || loadState();
    var n = W.plannedCount(s); b.textContent = n; b.hidden = n === 0;
  }
  function dateLabel(s, i) { return W.fmtDate(W.dayDate(s, i, today())); }
  function dayLong(s, i) { return W.DAYS[i] + ' ' + W.fmtDate(W.dayDate(s, i, today())).replace(/^\w+, /, ''); }

  /* ---------- video ---------- */
  var VIDEO_ICON = 'Video';
  function videoOf(id) { var v = (window.CR_VIDEOS || {})[id]; return v ? W.parseVideo(v) : null; }
  function addVideoBadges() {
    document.querySelectorAll('.card[data-id]').forEach(function (card) {
      if (!videoOf(card.getAttribute('data-id')) || card.querySelector('.vbadge')) return;
      var band = card.querySelector('.card-band'); if (band) band.appendChild(el('span', { class: 'vbadge', text: VIDEO_ICON }));
    });
  }
  function renderVideoSlot(slot, id) {
    var v = videoOf(id); if (!v) { slot.hidden = true; slot.innerHTML = ''; return; }
    slot.innerHTML = ''; slot.hidden = false;
    slot.appendChild(el('h2', { text: 'Video' }));
    var frameBox = el('div', { class: 'video-frame' });
    var title = byId[id] ? 'How to make ' + byId[id].title : 'Recipe video';
    function mount(start) {
      frameBox.innerHTML = '';
      if (v.type === 'mp4') {
        var vid = el('video', { controls: 'controls', preload: 'none', playsinline: 'playsinline', 'aria-label': title });
        vid.appendChild(el('source', { src: v.src, type: 'video/mp4' }));
        vid.appendChild(document.createTextNode('Your browser cannot play this video.'));
        frameBox.appendChild(vid);
        if (start) vid.addEventListener('loadedmetadata', function () { vid.currentTime = start; }, { once: true });
      } else {
        frameBox.appendChild(el('iframe', { src: v.embed(start), title: title, loading: 'lazy', allow: 'accelerometer; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: 'allowfullscreen', referrerpolicy: 'strict-origin-when-cross-origin' }));
      }
    }
    mount(0); slot.appendChild(frameBox);
    if (v.chapters.length) {
      var ul = el('ul', { class: 'chapters', 'aria-label': 'Chapters' });
      v.chapters.forEach(function (c) {
        ul.appendChild(el('li', {}, [el('button', { type: 'button', class: 'linkbtn chapter', 'data-seconds': String(c.seconds), onclick: function () {
          if (v.type === 'mp4') { var vd = frameBox.querySelector('video'); if (vd) { vd.currentTime = c.seconds; vd.play && vd.play().catch(function () {}); } } else mount(c.seconds);
        } }, [c.t + ' ']), c.label]));
      });
      slot.appendChild(ul);
    }
  }

  /* ---------- add to my week: day chooser ---------- */
  var openPop = null;
  function closePop() { if (openPop) { var b = openPop.btn; openPop.node.remove(); openPop = null; if (b) b.setAttribute('aria-expanded', 'false'); } }
  function refreshAddButtons() {
    var s = loadState();
    document.querySelectorAll('.week-add').forEach(function (b) {
      var id = b.getAttribute('data-id'), d = W.dayOf(s, id), lbl;
      if (d === -1) lbl = '+ Add to my week'; else if (d === 'pool') lbl = '\u2713 In my week (day open)'; else lbl = '\u2713 In my week: ' + W.SHORT[d];
      var multi = W.allItems(s).filter(function (x) { return x.id === id; }).length > 1;
      b.textContent = multi ? '\u2713 In my week (' + W.allItems(s).filter(function (x) { return x.id === id; }).length + ' days)' : lbl; b.classList.toggle('on', d !== -1);
    });
  }
  function openChooser(btn) {
    closePop();
    var id = btn.getAttribute('data-id'), s = loadState(), r = byId[id]; if (!r) return;
    var node = el('div', { class: 'week-pop', role: 'dialog', 'aria-label': 'Add ' + r.title + ' to my week' });
    node.appendChild(el('p', { class: 'week-pop-h', text: 'Which day for ' + r.title + '?' }));
    var status = el('p', { class: 'small week-pop-status', role: 'status', 'aria-live': 'polite' });
    var grid = el('div', { class: 'week-pop-days' });
    function choose(day) {
      var st = loadState(), f = CRapp.factorOf(id);
      W.addItem(st, id, day, f); saveState(st); refreshAddButtons(); track('add_to_week', { id: id, day: day });
      var where = day === 'auto' ? 'waiting for a day (use Order by freshness)' : dateLabel(st, day);
      status.textContent = ''; status.appendChild(document.createTextNode('Added to ' + where + '. ')); status.appendChild(el('a', { href: ROOT + 'week.html', text: 'Open My week' }));
      if (page === 'week') { window.dispatchEvent(new CustomEvent('cr-week-changed')); }
    }
    for (var i = 0; i < 7; i++) (function (i) {
      var has = s.days[i].items.some(function (x) { return x.id === id; });
      grid.appendChild(el('button', { type: 'button', class: 'week-day-choice' + (has ? ' has' : ''), 'data-day': String(i), 'aria-label': dayLong(s, i) + (has ? ' (already planned)' : ''), onclick: function () { choose(i); } },
        [el('strong', { text: W.SHORT[i] }), el('span', { class: 'small', text: W.dayDate(s, i, today()).slice(5).replace('-', '/') })]));
    })(i);
    node.appendChild(grid);
    node.appendChild(el('button', { type: 'button', class: 'btn small ghost week-day-choice auto', 'data-day': 'auto', onclick: function () { choose('auto'); } }, ['Let freshness pick the day']));
    node.appendChild(status);
    node.appendChild(el('button', { type: 'button', class: 'linkbtn', onclick: closePop }, ['Close']));
    btn.insertAdjacentElement('afterend', node); btn.setAttribute('aria-expanded', 'true');
    openPop = { node: node, btn: btn };
    var first = node.querySelector('button'); if (first) first.focus();
  }
  function wireAddButtons() {
    document.querySelectorAll('.week-add').forEach(function (b) {
      b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false');
      b.addEventListener('click', function (e) { e.preventDefault(); if (openPop && openPop.btn === b) closePop(); else openChooser(b); });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openPop) { var b = openPop.btn; closePop(); if (b) b.focus(); } });
    document.addEventListener('click', function (e) { if (openPop && !openPop.node.contains(e.target) && e.target !== openPop.btn) closePop(); });
    refreshAddButtons();
  }

  /* ---------- printable cards ---------- */
  function cardNode(d) {
    var n = el('article', { class: 'print-dish' });
    n.appendChild(el('h3', { text: d.title })); n.appendChild(el('p', { class: 'small', text: d.serves + (d.source ? ' \u00b7 ' + d.source : '') }));
    var ul = el('ul', { class: 'p-ings' }), g = null;
    d.ingredients.forEach(function (i) { if (i.group && i.group !== g) ul.appendChild(el('li', { class: 'grp', text: i.group })); g = i.group; ul.appendChild(el('li', { text: i.text })); });
    var two = el('div', { class: 'p-two' }, [el('section', {}, [el('h4', { text: 'Ingredients' }), ul]), el('section', {}, [el('h4', { text: 'Method' }), el('ol', { class: 'p-steps' }, d.steps.map(function (s) { return el('li', { text: s }); }))])]);
    n.appendChild(two);
    if (d.tips.length) n.appendChild(el('p', { class: 'small', text: 'Good to know: ' + d.tips.join(' ') }));
    n.appendChild(el('p', { class: 'small p-links', text: 'Recipe: ' + d.url + (d.video ? '   Video: ' + d.video : '') }));
    return n;
  }
  function renderPrint(host, spec) {
    var s = loadState(), c = ctx(); host.innerHTML = '';
    var cards = [];
    if (spec.indexOf('recipe-') === 0) {
      var id = spec.slice(7), r = byId[id]; if (!r) { host.appendChild(el('p', { text: 'That recipe was not found.' })); return false; }
      var it = null; W.allItems(s).forEach(function (x) { if (x.id === id && !it) it = x; });
      var d = W.dishCard(c, id, it ? it.f : CRapp.factorOf(id));
      cards.push({ head: el('h2', { text: d.title }), sub: '', dishes: [d], extra: [] });
    } else {
      var days = spec === 'week' ? [0, 1, 2, 3, 4, 5, 6] : [Number(spec.replace('day-', ''))];
      days.forEach(function (i) {
        if (!(i >= 0 && i <= 6) || !s.days[i].items.length) return;
        var card = W.dayCard(c, s, i, today());
        var extra = []; if (card.pairing.text) extra.push(card.pairing.text); if (card.freshness.level === 'first' || card.freshness.level === 'warn') extra.push('Freshness: ' + card.freshness.text);
        card.prep.forEach(function (p) { extra.push('Start ahead: ' + p.title + '. ' + p.basis); });
        cards.push({ head: el('h2', { text: W.fmtDateLong(card.date) + ' \u00b7 dinner at ' + W.fmtTime(card.time) }), sub: card.titles.join(' + '), dishes: card.dishes, extra: extra });
      });
    }
    if (!cards.length) { host.appendChild(el('p', { class: 'empty', text: 'Nothing planned for that day yet.' })); return false; }
    cards.forEach(function (cd) {
      var sec = el('section', { class: 'print-card' }, [cd.head]);
      if (cd.sub) sec.appendChild(el('p', { class: 'p-menu', text: cd.sub }));
      cd.dishes.forEach(function (d) { sec.appendChild(cardNode(d)); });
      cd.extra.forEach(function (t) { sec.appendChild(el('p', { class: 'p-extra', text: t })); });
      sec.appendChild(el('p', { class: 'small', text: 'Freshness numbers assume you buy fresh at the start of the week; freezing extends it.' }));
      host.appendChild(sec);
    });
    return true;
  }

  /* ---------- the My week page ---------- */
  function initWeek() {
    var root = document.getElementById('week-app'), printHost = document.getElementById('print-view'), printBar = document.getElementById('print-bar');
    var state = loadState(), proposal = null, clearArm = false, banner = document.getElementById('wk-banner');
    var statusEl = document.getElementById('wk-status');
    function say(msg) { statusEl.textContent = msg; statusEl.hidden = !msg; clearTimeout(say._t); if (msg) say._t = setTimeout(function () { statusEl.hidden = true; }, 6000); }
    function commit(opts) { proposal = (opts && opts.keepProposal) ? proposal : null; saveState(state); render(); }
    function startStr() { return W.weekStart(state, today()); }

    /* controls */
    var startIn = document.getElementById('wk-start'), timeIn = document.getElementById('wk-time'), tzSel = document.getElementById('wk-tz'), lenSel = document.getElementById('wk-len');
    Object.keys(W.TZS).forEach(function (k) { tzSel.appendChild(el('option', { value: k, text: W.TZS[k].label + (W.TZS[k].floating ? '' : ' (' + k.replace(/_/g, ' ') + ')') })); });
    startIn.addEventListener('change', function () {
      var v = startIn.value; if (!W.parseDate(v)) return;
      var idx = W.weekdayIdx(v), mon = W.addDays(v, -idx);
      state.start = mon; if (idx !== 0) say('Weeks start on Monday, so the plan now starts ' + W.fmtDate(mon) + '.'); commit();
    });
    timeIn.addEventListener('change', function () { if (timeIn.value) { state.time = timeIn.value; commit(); } });
    tzSel.addEventListener('change', function () { state.tz = tzSel.value; commit(); });
    lenSel.addEventListener('change', function () { state.len = Number(lenSel.value); commit(); });
    document.getElementById('wk-alarm-dinner').addEventListener('change', function (e) { state.alarms.dinner = e.target.checked; commit({ keepProposal: true }); });
    document.getElementById('wk-alarm-prep').addEventListener('change', function (e) { state.alarms.prep = e.target.checked; commit({ keepProposal: true }); });
    document.getElementById('wk-today-next').addEventListener('click', function () { state.start = W.comingMonday(today()); say('Plan moved to the week starting ' + W.fmtDate(state.start) + '.'); commit(); });

    /* add row */
    var addRecipe = document.getElementById('wk-add-recipe'), addDay = document.getElementById('wk-add-day');
    var groups = {}; RECIPES.forEach(function (r) { (groups[r.category] = groups[r.category] || []).push(r); });
    Object.keys(groups).forEach(function (cat) { var og = el('optgroup', { label: cat }); groups[cat].forEach(function (r) { og.appendChild(el('option', { value: r.id, text: r.title })); }); addRecipe.appendChild(og); });
    document.getElementById('wk-add-btn').addEventListener('click', function () {
      var id = addRecipe.value; if (!id) { say('Pick a recipe first.'); return; }
      var d = addDay.value === 'auto' ? 'auto' : Number(addDay.value);
      W.addItem(state, id, d, CRapp.factorOf(id)); track('add_to_week', { id: id, day: d, from: 'week' }); say('Added ' + byId[id].title + '.'); commit();
    });
    window.addEventListener('cr-week-changed', function () { state = loadState(); proposal = null; render(); });

    /* actions */
    document.getElementById('wk-order').addEventListener('click', function () {
      if (!W.plannedCount(state)) { say('Add a few recipes first.'); return; }
      proposal = W.orderByFreshness(ctx(), state); track('order_by_freshness', { changes: proposal.changes.length }); render();
    });
    document.getElementById('wk-ics').addEventListener('click', function () {
      var ics = W.buildICS(ctx(), state, { now: new Date(), today: today() });
      if (!ics) { say('Plan at least one meal first.'); return; }
      var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' }), url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: 'common-roots-week-' + startStr() + '.ics' }); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000); track('download_ics', { days: state.days.filter(function (d) { return d.items.length; }).length });
      say('Calendar file downloaded. Open it to add the meals to your calendar app.');
    });
    document.getElementById('wk-print-all').addEventListener('click', function () { if (!W.plannedCount(state)) { say('Plan at least one meal first.'); return; } location.hash = '#print=week'; });
    document.getElementById('wk-shop').addEventListener('click', function () {
      var sel = W.shoppingSelection(state); if (!sel.ids.length) { say('Plan at least one recipe first.'); return; }
      var f = CRapp.store.get('cr.factors', {}); sel.ids.forEach(function (id) { f[id] = sel.factors[id]; }); CRapp.store.set('cr.factors', f);
      CRapp.setPlan(sel.ids); track('shop_this_week', { recipes: sel.ids.length }); location.href = ROOT + 'plan.html';
    });
    document.getElementById('wk-export').addEventListener('click', function () {
      var blob = new Blob([W.exportJSON(state)], { type: 'application/json' }), url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: 'common-roots-week.json' }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      say('Week saved as a small JSON file.');
    });
    var fileIn = document.getElementById('wk-import-file');
    document.getElementById('wk-import').addEventListener('click', function () { fileIn.click(); });
    fileIn.addEventListener('change', function () {
      var f = fileIn.files && fileIn.files[0]; if (!f) return;
      var rd = new FileReader(); rd.onload = function () {
        var res = W.importJSON(String(rd.result), RECIPES);
        if (!res.ok) { say(res.error); return; }
        state = res.state; say('Imported ' + res.count + ' planned dish' + (res.count === 1 ? '' : 'es') + '.'); commit(); fileIn.value = '';
      }; rd.readAsText(f);
    });
    document.getElementById('wk-share').addEventListener('click', function () {
      var url = ROOT + 'week.html#w=' + W.encodeShare(state);
      var done = function (ok) { say(ok ? 'Share link copied. Open it on another device to load this week.' : 'Copy this link: ' + url); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(false); }); else done(false);
      document.getElementById('wk-share-url').value = url;
    });
    var clearBtn = document.getElementById('wk-clear');
    clearBtn.addEventListener('click', function () {
      if (!clearArm) { clearArm = true; clearBtn.textContent = 'Tap again to clear the whole week'; setTimeout(function () { clearArm = false; clearBtn.textContent = 'Clear week'; }, 4000); return; }
      clearArm = false; clearBtn.textContent = 'Clear week'; W.clearWeek(state); say('Week cleared.'); commit();
    });

    /* day card */
    function dishRow(d, where, it) {
      var r = byId[it.id], cur = it.f;
      var sel = el('select', { 'aria-label': 'Servings for ' + r.title, class: 'wk-serv' });
      var opts = [0.5, 1, 1.5, 2, 3]; if (opts.indexOf(cur) < 0) opts.push(cur); opts.sort(function (a, b) { return a - b; });
      opts.forEach(function (f) { var o = el('option', { value: String(f), text: W.servesText(r, f, L) }); if (Math.abs(f - cur) < 0.0005) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', function () { W.setFactor(state, where, it.id, Number(sel.value)); commit(); });
      var move = el('select', { 'aria-label': 'Move ' + r.title + ' to another day', class: 'wk-move' });
      move.appendChild(el('option', { value: '', text: 'Move to\u2026' }));
      for (var i = 0; i < 7; i++) if (i !== where) move.appendChild(el('option', { value: String(i), text: dayLong(state, i) }));
      if (where !== 'pool') move.appendChild(el('option', { value: 'auto', text: 'Leave the day open' }));
      move.addEventListener('change', function () { if (move.value === '') return; W.moveItem(state, where, it.id, move.value === 'auto' ? 'auto' : Number(move.value)); commit(); });
      var ctl = [sel];
      if (where !== 'pool') {
        ctl.push(el('button', { type: 'button', class: 'iconbtn wk-up', 'aria-label': 'Move ' + r.title + ' to the previous day', disabled: where === 0 ? 'disabled' : false, onclick: function () { W.moveItem(state, where, it.id, where - 1); commit(); } }, ['\u2191 Earlier']));
        ctl.push(el('button', { type: 'button', class: 'iconbtn wk-down', 'aria-label': 'Move ' + r.title + ' to the next day', disabled: where === 6 ? 'disabled' : false, onclick: function () { W.moveItem(state, where, it.id, where + 1); commit(); } }, ['\u2193 Later']));
      }
      ctl.push(move);
      ctl.push(el('button', { type: 'button', class: 'iconbtn wk-remove', 'aria-label': 'Remove ' + r.title, onclick: function () { W.removeItem(state, where, it.id); commit(); } }, ['Remove']));
      var badge = videoOf(r.id) ? el('span', { class: 'vbadge inline', text: VIDEO_ICON }) : null;
      return el('li', { class: 'dish-row', 'data-id': it.id }, [el('div', { class: 'dish-top' }, [el('a', { href: ROOT + 'recipes/' + it.id + '.html', class: 'dish-title', text: r.title }), badge, el('span', { class: 'pill', text: r.category + (r.sub ? ' \u00b7 ' + r.sub : '') })]), el('div', { class: 'dish-ctl' }, ctl)]);
    }
    function dayCardNode(i) {
      var c = ctx(), d = state.days[i], date = W.dayDate(state, i, today()), isToday = date === today();
      var node = el('article', { class: 'day-card' + (isToday ? ' tonight' : '') + (d.pinned ? ' pinned' : '') + (d.items.length ? '' : ' empty'), 'data-day': String(i), 'data-date': date, 'aria-label': W.DAYS[i] + ' ' + W.fmtDate(date) });
      var pin = el('button', { type: 'button', class: 'pin btn small ghost' + (d.pinned ? ' on' : ''), 'aria-pressed': d.pinned ? 'true' : 'false', 'aria-label': (d.pinned ? 'Unpin ' : 'Pin ') + W.DAYS[i], onclick: function () { W.setPinned(state, i, !d.pinned); commit(); } }, [d.pinned ? 'Pinned' : 'Pin day']);
      node.appendChild(el('header', { class: 'day-head' }, [el('h3', {}, [W.DAYS[i] + ' ', el('span', { class: 'date', text: W.fmtDate(date).replace(/^\w+, /, '') })]), isToday ? el('span', { class: 'badge tonight-badge', text: 'Tonight' }) : null, pin]));
      if (!d.items.length) { node.appendChild(el('p', { class: 'empty small', text: 'Nothing planned. Add a dish above, or tap a suggestion.' })); }
      else {
        node.appendChild(el('ul', { class: 'dish-list' }, d.items.map(function (it) { return dishRow(null, i, it); })));
        var note = W.dayNote(c, i, d.items);
        if (note.text) node.appendChild(el('p', { class: 'fresh-note ' + note.level, text: note.text }));
        c.fresh.prep && d.items.forEach(function (it) { var p = c.fresh.prep[it.id]; if (p && state.alarms.prep) node.appendChild(el('p', { class: 'prep-note small', text: 'Start ahead: ' + byId[it.id].title + '. ' + p.basis })); });
      }
      var pair = W.suggestPairings(c, state, i);
      if (pair.suggestions.length) {
        var box = el('div', { class: 'pair' }, [el('p', { class: 'small pair-text' }, [el('strong', { text: 'Suggested pairing' }), ' (by recipe category only, not flavor): ' + (pair.mode === 'mains' ? 'try a main like ' : 'add ')])]);
        var pt = box.firstChild; var lst = el('span', { class: 'pair-btns' });
        pair.suggestions.forEach(function (sg) {
          lst.appendChild(el('button', { type: 'button', class: 'chip pair-add', 'data-id': sg.id, 'aria-label': 'Add ' + byId[sg.id].title + ' to ' + W.DAYS[i], onclick: function () {
            W.addItem(state, sg.id, i, W.matchFactor(c, state, i, sg.id)); track('pairing_accept', { id: sg.id }); commit();
          } }, ['+ ' + byId[sg.id].title + ' (' + sg.label.replace(/^an? /, '') + ')']));
        });
        box.appendChild(lst); node.appendChild(box);
      }
      if (d.items.length) {
        var url = W.gcalUrl(c, state, i, { today: today() });
        node.appendChild(el('div', { class: 'day-actions' }, [
          el('a', { class: 'btn small gcal', href: url, target: '_blank', rel: 'noopener', text: 'Add to Google Calendar' }),
          el('a', { class: 'btn small ghost print-day', href: '#print=day-' + i, text: 'Print card' })]));
      }
      return node;
    }

    function render() {
      // controls reflect state
      startIn.value = startStr(); timeIn.value = state.time; tzSel.value = state.tz; lenSel.value = String(state.len);
      document.getElementById('wk-alarm-dinner').checked = state.alarms.dinner; document.getElementById('wk-alarm-prep').checked = state.alarms.prep;
      addDay.innerHTML = '';
      for (var i = 0; i < 7; i++) addDay.appendChild(el('option', { value: String(i), text: dayLong(state, i) }));
      addDay.appendChild(el('option', { value: 'auto', text: 'Let freshness pick' }));
      var stale = W.addDays(startStr(), 6) < today();
      document.getElementById('wk-stale').hidden = !stale;
      // pool
      var pool = document.getElementById('wk-pool'); pool.innerHTML = ''; pool.hidden = !state.pool.length;
      if (state.pool.length) {
        pool.appendChild(el('h2', { text: 'Waiting for a day (' + state.pool.length + ')' }));
        pool.appendChild(el('p', { class: 'small', text: 'Pick a day for each, or press Order by freshness to suggest days.' }));
        pool.appendChild(el('ul', { class: 'dish-list' }, state.pool.map(function (it) { return dishRow(null, 'pool', it); })));
      }
      // proposal
      var pb = document.getElementById('wk-proposal'); pb.innerHTML = ''; pb.hidden = !proposal;
      if (proposal) {
        if (!proposal.changed) { pb.appendChild(el('p', { class: 'ok-line', text: 'Your order already puts the shortest-lived ingredients first. Nothing to change.' })); pb.appendChild(el('button', { type: 'button', class: 'linkbtn', onclick: function () { proposal = null; render(); } }, ['Dismiss'])); }
        else {
          pb.appendChild(el('h3', { text: 'Suggested order (nothing changes until you apply it)' }));
          var ul = el('ul', { class: 'prop-list' });
          for (var j = 0; j < 7; j++) {
            var titles = proposal.days[j].items.map(function (x) { return byId[x.id].title; });
            var before = state.days[j].items.map(function (x) { return byId[x.id].title; });
            var chg = titles.join(' + ') !== before.join(' + ');
            var nn = proposal.days[j].items.length ? W.dayNote(ctx(), j, proposal.days[j].items) : null;
            if (!titles.length && !chg) continue;
            ul.appendChild(el('li', { class: chg ? 'chg' : '' }, [el('strong', { text: W.SHORT[j] + ': ' }), titles.join(' + ') || '(open)', proposal.days[j].pinned ? ' (pinned, unchanged)' : '', nn && nn.text && (nn.level === 'first' || nn.level === 'warn') ? el('span', { class: 'small', text: ' \u2014 ' + nn.text }) : null]));
          }
          pb.appendChild(ul);
          if (proposal.pool.length) pb.appendChild(el('p', { class: 'small', text: proposal.pool.length + ' dish' + (proposal.pool.length === 1 ? '' : 'es') + ' could not be placed because there are no free unpinned days. They stay in the waiting list.' }));
          pb.appendChild(el('div', { class: 'actions' }, [
            el('button', { type: 'button', id: 'wk-apply', class: 'btn small', onclick: function () { W.applyProposal(state, proposal); track('apply_freshness_order'); say('Order applied.'); commit(); } }, ['Apply this order']),
            el('button', { type: 'button', id: 'wk-discard', class: 'btn small ghost', onclick: function () { proposal = null; render(); } }, ['Keep my order'])]));
        }
      }
      // days
      var days = document.getElementById('wk-days'); days.innerHTML = '';
      for (var k = 0; k < 7; k++) days.appendChild(dayCardNode(k));
      document.getElementById('wk-count-line').textContent = W.plannedCount(state) + ' dish' + (W.plannedCount(state) === 1 ? '' : 'es') + ' planned';
      updateWeekBadge(state);
    }

    /* share-link banner */
    function checkShareHash() {
      var m = /^#w=(.+)$/.exec(location.hash); if (!m) { banner.hidden = true; return; }
      var res = W.decodeShare(m[1], RECIPES); banner.innerHTML = ''; banner.hidden = false;
      if (!res.ok) { banner.appendChild(document.createTextNode(res.error + ' ')); banner.appendChild(el('button', { type: 'button', class: 'linkbtn', onclick: function () { history.replaceState(null, '', location.pathname); banner.hidden = true; } }, ['Dismiss'])); return; }
      banner.appendChild(el('strong', { text: 'A shared week is ready: ' + res.count + ' planned dish' + (res.count === 1 ? '' : 'es') + '. ' }));
      banner.appendChild(document.createTextNode('Loading it replaces the week saved on this device. '));
      banner.appendChild(el('button', { type: 'button', id: 'wk-load-shared', class: 'btn small', onclick: function () { state = res.state; history.replaceState(null, '', location.pathname); banner.hidden = true; say('Shared week loaded.'); commit(); } }, ['Load it']));
      banner.appendChild(document.createTextNode(' '));
      banner.appendChild(el('button', { type: 'button', class: 'btn small ghost', onclick: function () { history.replaceState(null, '', location.pathname); banner.hidden = true; } }, ['Ignore']));
    }
    function route() {
      var m = /^#print=(.+)$/.exec(location.hash);
      if (m) {
        var ok = renderPrint(printHost, decodeURIComponent(m[1]));
        document.body.classList.add('print-mode'); root.hidden = true; printHost.hidden = false; printBar.hidden = false; window.scrollTo(0, 0);
        document.title = 'Recipe card \u00b7 Common Roots';
      } else {
        document.body.classList.remove('print-mode'); root.hidden = false; printHost.hidden = true; printBar.hidden = true; printHost.innerHTML = '';
        state = loadState(); render(); checkShareHash();
      }
    }
    document.getElementById('print-now').addEventListener('click', function () { window.print(); });
    document.getElementById('print-back').addEventListener('click', function (e) { e.preventDefault(); history.pushState(null, '', location.pathname); route(); });
    window.addEventListener('hashchange', route);
    track('view_week'); route();
  }

  /* ---------- My Kitchen ---------- */
  function initKitchen() {
    var s = loadState(), c = ctx(), t = today(), host = document.getElementById('kitchen-week');
    var start = W.weekStart(s, t), inWeek = t >= start && t <= W.addDays(start, 6), todayIdx = inWeek ? W.weekdayIdx(t) : -1;
    // tonight
    var tn = document.getElementById('k-tonight'); tn.innerHTML = '';
    var items = todayIdx >= 0 ? s.days[todayIdx].items : [];
    if (items.length) {
      var card = W.dayCard(c, s, todayIdx, t);
      tn.classList.add('has');
      tn.appendChild(el('h2', { text: 'Tonight' }));
      tn.appendChild(el('p', { class: 'k-menu', text: card.titles.join(' + ') + ' \u00b7 dinner at ' + W.fmtTime(s.time) }));
      card.prep.forEach(function (p) { tn.appendChild(el('p', { class: 'small prep-note', text: 'Start ahead: ' + p.title + '. ' + p.basis })); });
      if (card.pairing.text && card.dishes.length < 2) tn.appendChild(el('p', { class: 'small', text: card.pairing.text }));
      tn.appendChild(el('div', { class: 'actions' }, [el('a', { class: 'btn small', id: 'k-open-card', href: ROOT + 'week.html#print=day-' + todayIdx, text: 'Open tonight\u2019s recipe card' })].concat(card.dishes.map(function (d) { return el('a', { class: 'btn small ghost', href: ROOT + 'recipes/' + d.id + '.html', text: d.title }); }))));
    } else {
      tn.appendChild(el('h2', { text: 'Tonight' }));
      tn.appendChild(el('p', { text: W.plannedCount(s) ? 'Nothing planned for tonight.' : 'No dinner planned yet.' }));
      tn.appendChild(el('p', {}, [el('a', { class: 'btn small', href: ROOT + 'week.html', text: W.plannedCount(s) ? 'Open My week' : 'Plan your week' })]));
    }
    // week at a glance
    host.innerHTML = '';
    for (var i = 0; i < 7; i++) (function (i) {
      var d = s.days[i], date = W.addDays(start, i), isT = date === t;
      var row = el('li', { class: 'k-day' + (isT ? ' tonight' : '') + (d.items.length ? '' : ' empty'), 'data-day': String(i) }, [
        el('span', { class: 'k-dow' }, [el('strong', { text: W.SHORT[i] }), el('span', { class: 'small', text: ' ' + W.fmtDate(date).replace(/^\w+, /, '') })]),
        isT ? el('span', { class: 'badge', text: 'Tonight' }) : null,
        el('span', { class: 'k-dishes' }, d.items.length ? d.items.map(function (it, n) { return el('span', {}, [n ? ' + ' : '', el('a', { href: ROOT + 'recipes/' + it.id + '.html', text: byId[it.id].title }), videoOf(it.id) ? el('span', { class: 'vbadge inline', text: VIDEO_ICON }) : null]); }) : [el('span', { class: 'small', text: 'Nothing planned' })])]);
      host.appendChild(row);
    })(i);
    document.getElementById('k-pool').textContent = s.pool.length ? s.pool.length + ' dish' + (s.pool.length === 1 ? '' : 'es') + ' still waiting for a day.' : '';
    // next shopping action
    var next = document.getElementById('k-next'); next.innerHTML = '';
    var sel = W.shoppingSelection(s), plan = CRapp.getPlan(), factors = CRapp.store.get('cr.factors', {});
    var same = sel.ids.length && plan.length === sel.ids.length && sel.ids.every(function (id) { return plan.indexOf(id) >= 0 && Math.abs((factors[id] || 1) - sel.factors[id]) < 0.001; });
    next.appendChild(el('h2', { text: 'Next shopping step' }));
    if (!sel.ids.length && !plan.length) { next.appendChild(el('p', { text: 'Plan a few dinners first, then send them to a shopping list.' })); next.appendChild(el('a', { class: 'btn small', href: ROOT + 'week.html', text: 'Plan my week' })); }
    else if (sel.ids.length && same) { next.appendChild(el('p', { text: 'Your shopping list matches this week (' + sel.ids.length + ' recipe' + (sel.ids.length === 1 ? '' : 's') + ').' })); next.appendChild(el('a', { class: 'btn small', id: 'k-open-plan', href: ROOT + 'plan.html', text: 'Open shopping list' })); }
    else if (sel.ids.length) {
      next.appendChild(el('p', { text: sel.ids.length + ' recipe' + (sel.ids.length === 1 ? '' : 's') + ' planned this week are not on your shopping list yet.' }));
      next.appendChild(el('button', { class: 'btn small', id: 'k-shop', type: 'button', onclick: function () {
        var f = CRapp.store.get('cr.factors', {}); sel.ids.forEach(function (id) { f[id] = sel.factors[id]; }); CRapp.store.set('cr.factors', f); CRapp.setPlan(sel.ids); track('shop_this_week', { from: 'kitchen' }); location.href = ROOT + 'plan.html';
      } }, ['Shop this week']));
      next.appendChild(el('p', { class: 'small', text: 'This replaces the recipes on your current shopping list.' }));
    } else { next.appendChild(el('p', { text: 'Your shopping list has ' + plan.length + ' recipe' + (plan.length === 1 ? '' : 's') + '.' })); next.appendChild(el('a', { class: 'btn small', href: ROOT + 'plan.html', text: 'Open shopping list' })); }
    // videos
    var vh = document.getElementById('k-videos'); vh.innerHTML = '';
    var withV = RECIPES.filter(function (r) { return videoOf(r.id); });
    if (!withV.length) vh.appendChild(el('p', { class: 'small', id: 'k-novideo', text: 'No cooking videos yet. When a recipe has one, it shows up here with a Video badge.' }));
    else { var g = el('div', { class: 'grid' }); withV.forEach(function (r) { g.appendChild(el('article', { class: 'card', 'data-id': r.id }, [el('a', { class: 'card-link', href: ROOT + 'recipes/' + r.id + '.html' }, [el('div', { class: 'card-band' }, [el('span', { class: 'tag', text: r.category }), el('span', { class: 'vbadge', text: VIDEO_ICON })]), el('h3', { text: r.title })])])); }); vh.appendChild(g); }
    track('view_kitchen');
  }

  /* ---------- recipe page extras ---------- */
  function initRecipePage() {
    var slot = document.getElementById('video-slot'); if (slot) renderVideoSlot(slot, window.CR_RECIPE_ID);
    var tr = document.querySelector('.tag-row'); if (tr && videoOf(window.CR_RECIPE_ID) && !tr.querySelector('.vbadge')) tr.appendChild(el('span', { class: 'vbadge inline', text: VIDEO_ICON }));
  }

  (function () { var a = document.querySelector('nav a[data-nav="' + page + '"]'); if (a) a.setAttribute('aria-current', 'page'); })();
  updateWeekBadge();
  wireAddButtons();
  addVideoBadges();
  if (page === 'week') initWeek(); else if (page === 'kitchen') initKitchen(); else if (page === 'recipe') initRecipePage();
  window.CRWeekUI = { renderVideoSlot: renderVideoSlot, videoOf: videoOf };
})();

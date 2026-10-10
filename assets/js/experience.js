// Experience: two rows, each its own carousel.
// The heading reads like   Baja SAE  < Midnight Sun >  SHAD
// The open experience always sits in the middle with its neighbours faded either side.
// Click the < > or a faded name and everything moves one place: the names slide along
// and the text below slides the same way, the same distance, at the same speed.
// Rows of 3 or more wrap around (the name leaving one side comes back in on the other).
// A row of 2 just flips between them, and the arrow with nothing on its side shakes.
// Phones can also swipe. Speed and curve: --slide-time / --slide-ease in style.css.
(function () {
  'use strict';

  var mount = document.getElementById('experience-rows');
  if (!mount) return;

  Site.data.then(function (data) {
    var rows = {};
    data.section('experience').forEach(function (e) {
      var r = e.meta.row || 1;
      (rows[r] = rows[r] || []).push(e);
    });
    Object.keys(rows).sort().forEach(function (r) { mount.appendChild(buildRow(rows[r])); });
  });

  var each = Array.prototype.forEach;

  function buildRow(list) {
    var wrap = list.length > 2;
    var i = Math.max(0, list.findIndex(function (e) { return e.meta.show_first; }));
    var busy = false; // true while a switch is animating

    var row = Site.el('article', 'xrow');
    var head = Site.el('div', 'xhead');
    var left = arrow('&lt;', 'Previous experience');
    var right = arrow('&gt;', 'Next experience');
    var names = list.map(function (e) {   // one name per experience, moved between the slots
      var b = Site.el('button', 'xname');
      b.type = 'button';
      b.textContent = e.meta.label;
      b.addEventListener('click', function () {
        if (b.dataset.slot === 'prev') go(-1, left);
        if (b.dataset.slot === 'next') go(1, right);
      });
      return b;
    });
    var stage = Site.el('div', 'xstage');
    stage.setAttribute('aria-live', 'polite');
    var bodies = list.map(buildBody); // built once, reused when switching back
    row.appendChild(head);
    row.appendChild(stage);

    // The experience n places from the open one, or null past the end of a row that doesn't wrap
    function along(n) {
      var k = i + n;
      if (wrap) return ((k % list.length) + list.length) % list.length;
      return k >= 0 && k < list.length ? k : null;
    }

    // Put the names in their slots:  prev  <  current  >  next   and show the open one's text
    function render() {
      var p = along(-1), n = along(1);
      head.textContent = '';
      names.forEach(function (b) { b.dataset.slot = ''; });
      if (p !== null) head.appendChild(slot(names[p], 'prev'));
      head.appendChild(left);
      head.appendChild(slot(names[i], 'current'));
      head.appendChild(right);
      if (n !== null) head.appendChild(slot(names[n], 'next'));
      left.setAttribute('aria-disabled', String(p === null));
      right.setAttribute('aria-disabled', String(n === null));
      stage.textContent = '';
      stage.appendChild(bodies[i]);
    }

    function slot(b, s) {
      var on = s === 'current';
      b.dataset.slot = s;
      b.classList.toggle('current', on);
      b.classList.toggle('side', !on);
      if (on) { b.setAttribute('aria-current', 'true'); b.removeAttribute('aria-label'); }
      else { b.removeAttribute('aria-current'); b.setAttribute('aria-label', 'Show ' + b.textContent); }
      return b;
    }

    // step 1 = next (everything moves left), step -1 = previous (everything moves right)
    function go(step, arrowBtn) {
      if (busy) return;
      var n = along(step);
      if (n === null) { Site.shake(arrowBtn); return; }

      // Remember where every name and arrow was, and which slot each name was in
      var headBox = head.getBoundingClientRect();
      var before = new Map();
      each.call(head.children, function (el) {
        before.set(el, { box: el.getBoundingClientRect(), slot: el.dataset.slot || '' });
      });
      var oldBody = bodies[i], oldH = stage.offsetHeight;

      i = n;
      render();
      var m = Site.motion('slide');
      if (!m.duration) return;
      busy = true;

      // Everything travels as far as the newly opened name moved to reach the middle
      var dist = Math.abs(before.get(names[i]).box.left - names[i].getBoundingClientRect().left) || 60;
      var out = -step * dist;   // where leaving things go; arriving things come from -out

      // Names still showing glide from their old spot (one slot over). Anything new to its slot
      // (including a name that wrapped around) slides in from the far side. The < > would cross
      // the moving names, so they blink out and back in at their new spots instead.
      var moves = step > 0 ? { current: 'prev', next: 'current' } : { current: 'next', prev: 'current' };
      each.call(head.children, function (el) {
        var was = before.get(el), box = el.getBoundingClientRect();
        if (el === left || el === right) {
          el.animate([{ opacity: 1 }, { opacity: 0, offset: 0.2 }, { opacity: 0, offset: 0.8 }, { opacity: 1 }], m);
        } else if (was && moves[was.slot] === el.dataset.slot) {
          el.animate([
            { transform: 'translate(' + (was.box.left - box.left) + 'px, ' + (was.box.top - box.top) + 'px)' },
            { transform: 'none' }
          ], m);
        } else {
          slideIn(el, m, out);
        }
      });

      // The name falling off the far side slides out as a copy, since the real one may be back on the other side
      var gone = step > 0 ? 'prev' : 'next';
      before.forEach(function (was, el) {
        if (was.slot !== gone) return;
        var ghost = el.cloneNode(true);
        ghost.classList.add('ghost');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.tabIndex = -1;
        ghost.style.left = (was.box.left - headBox.left) + 'px';
        ghost.style.top = (was.box.top - headBox.top) + 'px';
        head.appendChild(ghost);
        slideOut(ghost, m, out).finished.then(function () { ghost.remove(); });
      });

      // The text does the same: old text slides out, new text slides in, and the height eases between them
      oldBody.classList.add('leaving');
      stage.appendChild(oldBody);
      stage.classList.add('moving');
      stage.animate([{ height: oldH + 'px' }, { height: stage.offsetHeight + 'px' }], m);
      slideIn(bodies[i], m, out);
      slideOut(oldBody, m, out).finished.then(function () {
        oldBody.classList.remove('leaving');
        oldBody.remove();
        stage.classList.remove('moving');
        busy = false;
      });
    }

    left.addEventListener('click', function () { go(-1, left); });
    right.addEventListener('click', function () { go(1, right); });

    // Keyboard: left/right arrow keys while focus is inside the row
    row.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1, left); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1, right); }
    });

    // Phones: swipe left/right on the text
    var x0 = null;
    stage.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 60 && !e.target.closest('.gallery')) go(dx < 0 ? 1 : -1, dx < 0 ? right : left);
    });

    render();
    return row;
  }

  function arrow(symbol, label) {
    var b = Site.el('button', 'xarrow', symbol);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    return b;
  }

  // Leaving fades out in the first half of the move and arriving fades in during the second,
  // so old and new text never sit on top of each other
  function slideOut(el, m, out) {
    return el.animate([
      { transform: 'none', opacity: 1 },
      { opacity: 0, offset: 0.5 },
      { transform: 'translateX(' + out + 'px)', opacity: 0 }
    ], m);
  }
  function slideIn(el, m, out) {
    return el.animate([
      { transform: 'translateX(' + (-out) + 'px)', opacity: 0 },
      { opacity: 0, offset: 0.5 },
      { transform: 'none', opacity: 1 }
    ], m);
  }

  function buildBody(e) {
    var m = e.meta;
    var body = Site.el('div', 'xbody');
    var text = Site.el('div', 'xtext');

    // Under the < Name > heading: Role (Month, Year - Month, Year)
    var sub = Site.el('p', 'entry-sub');
    var when = Site.dates(m);
    sub.textContent = (m.role || '') + (when ? ' (' + when + ')' : '');

    var ul = Site.el('ul', 'bullets');
    e.bullets.forEach(function (b) { ul.appendChild(Site.el('li', null, b)); });

    text.appendChild(sub);
    text.appendChild(ul);
    body.appendChild(text);

    var g = Site.gallery(e.media, m.label);
    if (g) {
      var photos = Site.el('div', 'xphotos');
      photos.appendChild(g);
      body.appendChild(photos);
    } else {
      body.classList.add('no-photos');
    }
    return body;
  }
})();

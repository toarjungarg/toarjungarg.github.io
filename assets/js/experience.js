// Experience: two rows, each its own carousel.
// The heading reads like   Baja SAE  < Midnight Sun >  SHAD
// with the neighbours faded. Click the < > or a faded name to switch; clicking an
// arrow with nothing on that side shakes it. Phones can also swipe.
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

  function buildRow(list) {
    var i = Math.max(0, list.findIndex(function (e) { return e.meta.show_first; }));
    var row = Site.el('article', 'xrow');
    var head = Site.el('div', 'xhead');
    var prevName = Site.el('button', 'xname side');
    var left = Site.el('button', 'xarrow', '&lt;');
    var current = Site.el('h3', 'xname current');
    var right = Site.el('button', 'xarrow', '&gt;');
    var nextName = Site.el('button', 'xname side');
    prevName.type = left.type = right.type = nextName.type = 'button';
    left.setAttribute('aria-label', 'Previous experience');
    right.setAttribute('aria-label', 'Next experience');
    [prevName, left, current, right, nextName].forEach(function (n) { head.appendChild(n); });

    var stage = Site.el('div', 'xstage');
    stage.setAttribute('aria-live', 'polite');
    var bodies = list.map(buildBody); // built once, reused when switching back
    row.appendChild(head);
    row.appendChild(stage);

    function go(step, arrow) {
      var n = i + step;
      if (n < 0 || n >= list.length) { Site.shake(arrow); return; }
      var old = bodies[i];
      i = n;
      old.classList.add(step > 0 ? 'out-left' : 'out-right');
      head.classList.add('switching');
      setTimeout(function () {
        old.classList.remove('out-left', 'out-right');
        render(step > 0 ? 'in-right' : 'in-left');
      }, Site.reduced ? 0 : 180);
    }

    function render(enter) {
      var prev = list[i - 1], next = list[i + 1];
      current.textContent = list[i].meta.label;
      prevName.textContent = prev ? prev.meta.label : '';
      nextName.textContent = next ? next.meta.label : '';
      prevName.hidden = !prev;
      nextName.hidden = !next;
      left.setAttribute('aria-disabled', String(!prev));
      right.setAttribute('aria-disabled', String(!next));
      prevName.setAttribute('aria-label', prev ? 'Show ' + prev.meta.label : '');
      nextName.setAttribute('aria-label', next ? 'Show ' + next.meta.label : '');

      var body = bodies[i];
      stage.innerHTML = '';
      if (enter) body.classList.add(enter);
      stage.appendChild(body);
      void body.offsetWidth;
      body.classList.remove('in-right', 'in-left');
      head.classList.remove('switching');
    }

    left.addEventListener('click', function () { go(-1, left); });
    right.addEventListener('click', function () { go(1, right); });
    prevName.addEventListener('click', function () { go(-1, left); });
    nextName.addEventListener('click', function () { go(1, right); });

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

  function buildBody(e) {
    var m = e.meta;
    var body = Site.el('div', 'xbody');
    var text = Site.el('div', 'xtext');

    var role = Site.el('p', 'xrole');
    role.textContent = m.role || '';
    var info = Site.el('p', 'xinfo');
    var org = Site.el(m.link ? 'a' : 'span');
    org.textContent = m.organization || '';
    if (m.link) { org.href = m.link; org.target = '_blank'; org.rel = 'noopener'; }
    info.appendChild(org);
    [m.location, Site.dates(m)].forEach(function (part) {
      if (part) info.appendChild(document.createTextNode(' · ' + part));
    });

    var ul = Site.el('ul', 'bullets');
    e.bullets.forEach(function (b) { ul.appendChild(Site.el('li', null, b)); });

    text.appendChild(role);
    text.appendChild(info);
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

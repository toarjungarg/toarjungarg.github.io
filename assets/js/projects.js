// Projects: one project at a time, with a ^ above it and a v below it.
// Each project turns around a circle whose centre sits to the left of the page, so
// clicking ^ rolls the project up and away along that curve while the next one rolls in
// from below; v does the opposite.
(function () {
  'use strict';

  var mount = document.getElementById('project-wheel');
  if (!mount) return;

  var EXIT = 0.7;     // how far (in radians) a project rolls before it's gone
  var CENTRE = 260;   // how far left of the project the circle's centre is, in px
  var GAP = 22;       // space between the project and its arrows, in px

  Site.data.then(function (data) {
    var list = data.section('projects');
    if (list.length) build(list);
  });

  // About a 93 degree point, like a big < > turned on its side
  function chevron(up) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chev';
    b.setAttribute('aria-label', up ? 'Next project (roll up)' : 'Previous project (roll down)');
    b.innerHTML = '<svg viewBox="0 0 84 42" aria-hidden="true"><path d="' +
      (up ? 'M 2 40 L 42 2 L 82 40' : 'M 2 2 L 42 40 L 82 2') + '"/></svg>';
    return b;
  }

  function build(list) {
    var cards = list.map(buildCard);
    var up = chevron(true), down = chevron(false);
    cards.concat([up, down]).forEach(function (c) { mount.appendChild(c); });

    var i = 0, top = 0, arrowH = 40;

    // Turn a project around the circle's centre (0 = in front, negative = rolled up)
    function place(card, angle) {
      card.style.transform = 'rotate(' + angle + 'rad)';
    }

    function layout() {
      var small = mount.clientWidth < 600;
      var arrowW = small ? 56 : 80;
      arrowH = arrowW / 2;
      up.style.width = down.style.width = arrowW + 'px';
      up.style.height = down.style.height = arrowH + 'px';

      top = arrowH + GAP + 8;                       // every project starts just under the ^
      mount.style.transition = 'none';              // no growing animation when the page first lays out

      cards.forEach(function (c, n) {
        var h = c.offsetHeight;
        c.style.top = top + 'px';
        c.style.transformOrigin = (-CENTRE) + 'px ' + (h / 2) + 'px'; // the circle's centre
        c.style.transition = 'none';
        place(c, n === i ? 0 : EXIT);
      });
      fit();
      void mount.offsetWidth;
      cards.forEach(function (c) { c.style.transition = ''; });
      mount.style.transition = '';
    }

    // The ^ stays under the heading; the v sits just under whichever project is showing,
    // and the section is only as tall as that project, so a short one leaves no gap below
    function fit() {
      var h = cards[i].offsetHeight;
      up.style.top = (top - GAP - arrowH) + 'px';
      down.style.top = (top + h + GAP) + 'px';
      mount.style.height = (h + 2 * (GAP + arrowH) + 16) + 'px';
    }

    function show(n) {
      cards.forEach(function (c, k) {
        var on = k === n;
        c.classList.toggle('on', on);
        c.inert = !on;
      });
    }

    // dir = 1: roll up (the project leaves upward, the next comes in from below)
    // dir = -1: roll down (the project leaves downward, the previous comes in from above)
    function go(dir) {
      if (list.length < 2) { Site.shake(dir > 0 ? up : down); return; }
      var from = cards[i];
      i = (i + dir + list.length) % list.length;
      var to = cards[i];
      // the new one starts on the side it comes from, without animating there
      to.style.transition = 'none';
      place(to, dir > 0 ? EXIT : -EXIT);
      void to.offsetWidth;
      to.style.transition = '';
      place(to, 0);
      place(from, dir > 0 ? -EXIT : EXIT);
      show(i);
      fit();
    }

    up.addEventListener('click', function () { go(1); });
    down.addEventListener('click', function () { go(-1); });
    mount.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); go(-1); }
    });

    show(0);
    layout();
    var lastW = mount.clientWidth;
    new ResizeObserver(function () {
      if (mount.clientWidth !== lastW) { lastW = mount.clientWidth; layout(); } // only when the width changes
    }).observe(mount);
    mount.querySelectorAll('img').forEach(function (img) { img.addEventListener('load', layout); });
    document.fonts.ready.then(layout); // text height changes once the font arrives
  }

  function buildCard(e) {
    var m = e.meta;
    var card = Site.el('article', 'pcard');
    var text = Site.el('div', 'ptext');

    // Heading, two lines:  Project  /  Deliverable (Month Year - Month Year)
    var name = Site.el('p', 'entry-name');
    name.textContent = m.title || '';
    var sub = Site.el('p', 'entry-sub');
    var when = Site.dates(m);
    sub.textContent = (m.deliverable || '') + (when ? ' (' + when + ')' : '');
    text.appendChild(name);
    text.appendChild(sub);

    var ul = Site.el('ul', 'bullets');
    e.bullets.forEach(function (b) { ul.appendChild(Site.el('li', null, b)); });
    text.appendChild(ul);

    if (m.tools && m.tools.length) {
      var tools = Site.el('p', 'ptools');
      tools.textContent = m.tools.join(', ');
      text.appendChild(tools);
    }
    if (m.link) {
      var a = Site.el('a', 'plink');
      a.href = m.link;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'more →';
      text.appendChild(a);
    }

    card.appendChild(text);
    var g = Site.gallery(e.media, m.title || 'Project');
    if (g) {
      var photos = Site.el('div', 'xphotos');
      photos.appendChild(g);
      card.appendChild(photos);
    } else {
      card.classList.add('no-photos');
    }
    return card;
  }
})();

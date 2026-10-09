// Projects: one project at a time on a "wheel".
// A wide ^ above and v below, each with two fainter arrows that curve off to the left.
// Everything sits on a big circle whose centre is far to the left, so when you click,
// the project rolls along that curve and away while the next one rolls in.
(function () {
  'use strict';

  var mount = document.getElementById('project-wheel');
  if (!mount) return;

  var EXIT = 0.95;   // how far (in radians) a project rolls before it's gone
  var GAP = 34;      // space between the project and the main arrow, in px
  var STEP = 30;     // space between the faded arrows, in px

  Site.data.then(function (data) {
    var list = data.section('projects');
    if (list.length) build(list);
  });

  function chevron(up, cls) {
    var b = document.createElement(cls === 'main' ? 'button' : 'span');
    b.className = 'chev ' + cls;
    b.innerHTML = '<svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path d="' +
      (up ? 'M 0 10 L 50 0 L 100 10' : 'M 0 0 L 50 10 L 100 0') + '" vector-effect="non-scaling-stroke"/></svg>';
    if (cls === 'main') {
      b.type = 'button';
      b.setAttribute('aria-label', up ? 'Previous project' : 'Next project');
    } else {
      b.setAttribute('aria-hidden', 'true');
    }
    return b;
  }

  function build(list) {
    var cards = list.map(function (e, n) { return buildCard(e, n, list.length); });
    var ups = [chevron(true, 'main'), chevron(true, 'ghost g1'), chevron(true, 'ghost g2')];
    var downs = [chevron(false, 'main'), chevron(false, 'ghost g1'), chevron(false, 'ghost g2')];
    cards.concat(ups, downs).forEach(function (c) { mount.appendChild(c); });

    var i = 0, R = 700, cardH = 0;

    // Put an element on the wheel at an angle (0 = front and centre, negative = up, positive = down)
    function place(node, angle, extra) {
      node.style.transform = 'translate(-50%, -50%) translateX(' + (-R) + 'px) rotate(' + angle + 'rad) translateX(' + R + 'px)' + (extra || '');
    }

    function layout() {
      var w = mount.clientWidth;
      R = Math.max(380, w * 0.75);
      cardH = Math.max.apply(null, cards.map(function (c) { return c.offsetHeight; }));
      mount.style.height = (cardH + 2 * (GAP + 2 * STEP + 44)) + 'px';
      placeArrows();
      cards.forEach(function (c, n) {
        c.style.transition = 'none';
        place(c, n === i ? 0 : EXIT);
      });
      void mount.offsetWidth;
      cards.forEach(function (c) { c.style.transition = ''; });
    }

    // Main arrows sit straight above and below the project showing now; the faded ones
    // step away and curve a little to the left
    function placeArrows() {
      var w = mount.clientWidth, h = cards[i].offsetHeight;
      [ups, downs].forEach(function (set, k) {
        var sign = k === 0 ? -1 : 1;
        set.forEach(function (c, n) {
          c.style.width = Math.min(w * 0.7, 560) * (1 - n * 0.1) + 'px';
          var y = sign * (h / 2 + GAP + n * STEP);
          var x = -n * n * 16;
          c.style.transform = 'translate(-50%, -50%) translate(' + x + 'px, ' + y + 'px) rotate(' + (sign * n * 5) + 'deg)';
        });
      });
    }

    function show(n) {
      cards.forEach(function (c, k) {
        var on = k === n;
        c.classList.toggle('on', on);
        c.inert = !on;
      });
    }

    function go(step) {
      if (list.length < 2) { Site.shake(step < 0 ? ups[0] : downs[0]); return; }
      var from = cards[i];
      i = (i + step + list.length) % list.length;
      var to = cards[i];
      // the new one starts on the side it comes from, without animating there
      to.style.transition = 'none';
      place(to, step > 0 ? EXIT : -EXIT);
      void to.offsetWidth;
      to.style.transition = '';
      place(to, 0);
      place(from, step > 0 ? -EXIT : EXIT);
      show(i);
      placeArrows();
      nudge(step > 0 ? downs : ups);
    }

    // The arrows on the side you clicked give a small push along the curve
    function nudge(set) {
      if (Site.reduced) return;
      set.forEach(function (c, n) {
        c.animate([{ opacity: c === set[0] ? 1 : 0.6 - n * 0.2 }, { opacity: 1 }, { opacity: getComputedStyle(c).opacity }],
          { duration: 420, delay: n * 70 });
      });
    }

    ups[0].addEventListener('click', function () { go(-1); });
    downs[0].addEventListener('click', function () { go(1); });
    mount.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp') { e.preventDefault(); go(-1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); go(1); }
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

  function buildCard(e, n, total) {
    var m = e.meta;
    var card = Site.el('article', 'pcard');
    var text = Site.el('div', 'ptext');

    var count = Site.el('p', 'pcount');
    count.textContent = String(n + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
    var title = Site.el('h3', 'ptitle');
    title.textContent = m.label || m.title || '';
    var info = Site.el('p', 'xinfo');
    info.textContent = [m.period, m.award].filter(Boolean).join(' · ');
    text.appendChild(count);
    text.appendChild(title);
    text.appendChild(info);

    var ul = Site.el('ul', 'bullets');
    e.bullets.forEach(function (b) { ul.appendChild(Site.el('li', null, b)); });
    text.appendChild(ul);

    if (m.tools && m.tools.length) {
      var tools = Site.el('p', 'ptools');
      tools.textContent = m.tools.join(' · ');
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
    var g = Site.gallery(e.media, m.label || m.title || 'Project');
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

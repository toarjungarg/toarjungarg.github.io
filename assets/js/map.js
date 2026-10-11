// Trips Map: a pencil-style world outline with a pin for every trip folder in content/TripsMap/
// (each folder: about.md with the pin and my sentence, plus that trip's photos).
// The outline draws itself the first time the map scrolls into view, then the pins drop in.
// Clicking a pin slides a panel in from the left with the trip, the place, my sentence and the
// photos (the same gallery as Experience); the map narrows to make room. On phones the panel
// opens under the map. Click the same pin again, the empty map, or press Esc to close it.
(function () {
  'use strict';

  var mount = document.getElementById('trip-map');
  if (!mount) return;

  // Must match the numbers used to make assets/world.svg
  var LAT_MAX = 84, LAT_MIN = -58;

  Promise.all([
    Site.data,
    fetch('assets/world.svg').then(function (r) { return r.text(); })
  ]).then(function (res) {
    build(res[0].section('TripsMap'), res[1]);
  });

  function build(trips, svgText) {
    var frame = Site.el('div', 'map-frame');
    var wrap = Site.el('div', 'map-wrap');
    var panel = Site.el('aside', 'trip-panel');
    panel.setAttribute('aria-live', 'polite');
    var stage = Site.el('div', 'map-stage');
    stage.innerHTML = svgText;
    var svg = stage.querySelector('svg');
    svg.setAttribute('class', 'world');
    svg.setAttribute('aria-hidden', 'true');
    wrap.appendChild(panel);   // first, so it sits on the left
    wrap.appendChild(stage);
    frame.appendChild(wrap);
    mount.appendChild(frame);

    var cards = trips.map(buildCard); // built once, reused when a pin is clicked again
    var openPin = -1;

    var buttons = trips.map(function (t, n) {
      var m = t.meta;
      var b = Site.el('button', 'pin' + (m.type === 'want' ? ' want' : ''));
      b.type = 'button';
      b.style.left = (m.lon + 180) / 360 * 100 + '%';
      b.style.top = (LAT_MAX - m.lat) / (LAT_MAX - LAT_MIN) * 100 + '%';
      b.style.setProperty('--n', n);
      b.setAttribute('aria-label', m.trip + ', ' + m.place);
      b.setAttribute('aria-expanded', 'false');
      b.innerHTML = '<svg viewBox="0 0 20 28" aria-hidden="true"><path d="M10 27 C10 27 1 15.5 1 9.5 a9 9 0 0 1 18 0 C19 15.5 10 27 10 27 Z"/><circle cx="10" cy="9.5" r="3.2"/></svg>';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (openPin === n) close(); else open(n);
      });
      stage.appendChild(b);
      return b;
    });

    function mark(n) {
      buttons.forEach(function (b, k) {
        b.classList.toggle('active', k === n);
        b.setAttribute('aria-expanded', String(k === n));
      });
    }

    function open(n) {
      var switching = openPin >= 0;
      var from = stopResize();
      openPin = n;
      mark(n);
      panel.textContent = '';
      panel.appendChild(cards[n]);
      var to = heightWhen(true);
      if (switching) cards[n].animate([{ opacity: 0 }, { opacity: 1 }], Site.motion('slide'));
      wrap.classList.add('open');
      resize(from, to);
      // On phones the panel is under the map: bring it into view once it has opened
      if (window.matchMedia('(max-width: 720px)').matches) {
        setTimeout(function () { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); },
          Site.motion('slide').duration);
      }
    }

    // The trip stays in the panel while it slides shut, then leaves so the box fits the map again
    function close() {
      var from = stopResize();
      openPin = -1;
      mark(-1);
      var to = heightWhen(false);
      wrap.classList.remove('open');
      resize(from, to, function () { if (openPin < 0) panel.textContent = ''; });
    }

    // How tall the map area will be open or closed, measured without showing it
    function heightWhen(isOpen) {
      var was = wrap.classList.contains('open');
      var card = panel.firstChild;
      wrap.classList.add('measuring');               // no transitions while measuring
      wrap.classList.toggle('open', isOpen);
      if (card && !isOpen) card.style.display = 'none';
      var h = wrap.offsetHeight;
      wrap.classList.toggle('open', was);
      if (card) card.style.display = '';
      void wrap.offsetHeight;
      wrap.classList.remove('measuring');
      return h;
    }

    // Ease the map area's height in step with the panel sliding, instead of jumping.
    // after() runs at the end of the slide, before the next frame is drawn, unless a newer click took over.
    var sizing = null, resizes = 0;
    function resize(from, to, after) {
      var m = Site.motion('slide'), mine = ++resizes;
      if (!m.duration || from === to) {
        if (after) setTimeout(function () { if (mine === resizes) after(); }, m.duration);
        return;
      }
      wrap.classList.add('resizing');
      sizing = wrap.animate([{ height: from + 'px' }, { height: to + 'px' }], m);
      sizing.onfinish = function () {
        if (after) after();
        wrap.classList.remove('resizing');
        sizing = null;
      };
    }

    // The height on screen right now; stops a height animation that's still running
    function stopResize() {
      var h = wrap.offsetHeight;
      if (sizing) { sizing.onfinish = null; sizing.cancel(); sizing = null; }
      wrap.classList.remove('resizing');
      return h;
    }

    stage.addEventListener('click', function (e) { if (!e.target.closest('.pin')) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openPin >= 0) close(); });

    // Draw the outline the first time the map comes into view
    var path = svg.querySelector('path');
    if (Site.reduced) { frame.classList.add('drawn'); return; }
    var len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;

    function check() {
      var r = frame.getBoundingClientRect();
      if (r.top > window.innerHeight * 0.95 || r.bottom < 0) return; // not on screen yet
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      void path.getBoundingClientRect();
      path.style.transition = 'stroke-dashoffset 0.9s ease-out, fill 0.5s ease';
      path.style.strokeDashoffset = '0';
      setTimeout(function () { frame.classList.add('drawn'); }, 650);
    }
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    setTimeout(check, 300);
  }

  // The panel for one trip: name, place, my sentence, then the photos
  function buildCard(t) {
    var m = t.meta;
    var card = Site.el('div', 'trip-inner');
    var name = Site.el('p', 'trip-name');
    name.textContent = m.trip || '';
    var place = Site.el('p', 'trip-place');
    place.textContent = m.place || '';
    card.appendChild(name);
    card.appendChild(place);
    t.paragraphs.forEach(function (p) { card.appendChild(Site.el('p', 'trip-text', p)); });
    var g = Site.gallery(t.media, m.trip || 'Trip', m.focus);
    if (g) card.appendChild(g);
    return card;
  }
})();

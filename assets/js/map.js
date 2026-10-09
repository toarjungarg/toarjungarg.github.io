// Trips Map: a pencil-style world outline with pins from content/map.md.
// The outline draws itself the first time the map scrolls into view, then the pins drop in.
// Clicking a pin shows the trip and my note.
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
    var file = res[0].file('content/map.md');
    build(file ? file.meta.pins || [] : [], res[1]);
  });

  function build(pins, svgText) {
    var frame = Site.el('div', 'map-frame');
    var stage = Site.el('div', 'map-stage');
    stage.innerHTML = svgText;
    var svg = stage.querySelector('svg');
    svg.setAttribute('class', 'world');
    svg.setAttribute('aria-hidden', 'true');
    frame.appendChild(stage);
    mount.appendChild(frame);

    var popup = Site.el('div', 'pin-note');
    popup.hidden = true;
    stage.appendChild(popup);
    var openPin = null;

    var buttons = pins.map(function (p, n) {
      var b = Site.el('button', 'pin' + (p.type === 'want' ? ' want' : ''));
      b.type = 'button';
      b.style.left = (p.lon + 180) / 360 * 100 + '%';
      b.style.top = (LAT_MAX - p.lat) / (LAT_MAX - LAT_MIN) * 100 + '%';
      b.style.setProperty('--n', n);
      b.setAttribute('aria-label', p.trip + ', ' + p.place);
      b.innerHTML = '<svg viewBox="0 0 20 28" aria-hidden="true"><path d="M10 27 C10 27 1 15.5 1 9.5 a9 9 0 0 1 18 0 C19 15.5 10 27 10 27 Z"/><circle cx="10" cy="9.5" r="3.2"/></svg>';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (openPin === b) { close(); return; }
        open(b, p);
      });
      stage.appendChild(b);
      return b;
    });

    function open(b, p) {
      openPin = b;
      buttons.forEach(function (x) { x.classList.toggle('active', x === b); });
      popup.innerHTML = '';
      var t = Site.el('p', 'pin-trip');
      t.textContent = p.trip;
      var pl = Site.el('p', 'pin-place');
      pl.textContent = p.place;
      popup.appendChild(t);
      popup.appendChild(pl);
      if (p.note) {
        var nt = Site.el('p', 'pin-text');
        nt.textContent = p.note;
        popup.appendChild(nt);
      }
      popup.hidden = false;
      // keep the note inside the map: flip to the left of the pin on the right half
      var leftHalf = parseFloat(b.style.left) < 55;
      popup.style.left = leftHalf ? b.style.left : '';
      popup.style.right = leftHalf ? '' : (100 - parseFloat(b.style.left)) + '%';
      popup.style.top = b.style.top;
      popup.classList.toggle('flip', !leftHalf);
    }

    function close() {
      openPin = null;
      popup.hidden = true;
      buttons.forEach(function (x) { x.classList.remove('active'); });
    }

    document.addEventListener('click', function (e) { if (!popup.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

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
})();

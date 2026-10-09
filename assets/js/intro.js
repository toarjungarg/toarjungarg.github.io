// Loading animation for the header box.
// The border draws like a pencil sketch (every line at the same speed), each line
// gets dimensioned as soon as it finishes, then the letters slide together and
// the nav and links fade in. Clicking, scrolling or pressing a key skips it.
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var root = document.documentElement;
  var hero = document.querySelector('.hero');
  var svg = hero.querySelector('.sketch');
  var nameEl = hero.querySelector('.name');

  var LONGEST_LINE_MS = 1300; // the longest line takes this long; shorter ones finish sooner
  var DIM_MS = 260;           // how long a dimension takes to draw

  // ----- Font / colour comparison: ?font=serif and ?accent=red, plus a switch on this Mac -----
  var params = new URLSearchParams(location.search);
  if (params.get('font')) root.dataset.font = params.get('font');
  if (params.get('accent')) root.dataset.accent = params.get('accent');
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') addCompareSwitch();

  // ----- Split the name into one span per letter so each can move on its own -----
  var text = nameEl.textContent.trim();
  nameEl.setAttribute('aria-label', text);
  nameEl.textContent = '';
  var letters = Array.from(text).map(function (c) {
    var s = document.createElement('span');
    s.className = 'ch';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = c === ' ' ? ' ' : c;
    nameEl.appendChild(s);
    return s;
  });
  // A zero-size marker sitting on the text baseline, used to measure where the baseline is
  var probe = document.createElement('span');
  probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  nameEl.appendChild(probe);

  var timers = [];
  var anims = [];
  var state = 'waiting'; // waiting -> playing -> done

  // ----- Small helpers -----

  function make(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  // Position of an element relative to the top-left corner of the header box
  function rel(el) {
    var h = hero.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    return { x: r.left - h.left, y: r.top - h.top, right: r.right - h.left, bottom: r.bottom - h.top };
  }

  // Ink measurements of one character in the name's font
  var ctx = document.createElement('canvas').getContext('2d');
  function ink(ch) {
    var cs = getComputedStyle(nameEl);
    ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    var m = ctx.measureText(ch);
    return { left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight, up: m.actualBoundingBoxAscent, down: m.actualBoundingBoxDescent };
  }

  // The four sides of the rounded box, each with one corner, drawn clockwise
  function borderPaths(w, h) {
    var r = Math.min(14, h / 4);
    var arc = ' A ' + r + ' ' + r + ' 0 0 1 ';
    return [
      'M 0 ' + r + arc + r + ' 0 H ' + (w - r),             // top
      'M ' + (w - r) + ' 0' + arc + w + ' ' + r + ' V ' + (h - r), // right
      'M ' + w + ' ' + (h - r) + arc + (w - r) + ' ' + h + ' H ' + r, // bottom
      'M ' + r + ' ' + h + arc + '0 ' + (h - r) + ' V ' + r        // left
    ];
  }

  function drawFinalBorder() {
    svg.innerHTML = '';
    borderPaths(hero.offsetWidth, hero.offsetHeight).forEach(function (d) {
      make('path', { d: d, class: 'edge' }, svg);
    });
  }

  // Draw a path from nothing to full length, at a set duration
  function drawIn(el, ms) {
    var len = el.getTotalLength();
    el.style.strokeDasharray = len;
    el.style.strokeDashoffset = len;
    var a = el.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: ms, easing: 'linear', fill: 'forwards' });
    anims.push(a);
    return a;
  }

  // ----- Dimensions (engineering-drawing style) -----

  function arrowHead(g, x, y, angle) {
    var s = 6, w = 2.2;
    var c = Math.cos(angle), n = Math.sin(angle);
    // tip at (x, y), pointing in the direction of angle
    var d = 'M ' + x + ' ' + y +
      ' L ' + (x - s * c - w * n) + ' ' + (y - s * n + w * c) +
      ' L ' + (x - s * c + w * n) + ' ' + (y - s * n - w * c) + ' Z';
    make('path', { d: d, class: 'head' }, g);
  }

  // A straight dimension between two points, with extension lines and arrows at both ends.
  // (x1, y1) and (x2, y2) are where the dimension line sits; ext lists extension lines to draw.
  function linearDim(x1, y1, x2, y2, label, ext) {
    var g = make('g', { class: 'dim temp' }, svg);
    (ext || []).forEach(function (e) { make('line', { x1: e[0], y1: e[1], x2: e[2], y2: e[3] }, g); });
    make('line', { x1: x1, y1: y1, x2: x2, y2: y2 }, g);
    var angle = Math.atan2(y2 - y1, x2 - x1);
    arrowHead(g, x2, y2, angle);
    arrowHead(g, x1, y1, angle + Math.PI);
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    // On short dimensions the number sits beside the line instead of on it, so the arrows stay visible
    if (Math.hypot(x2 - x1, y2 - y1) < 90) {
      mx += 9 * Math.sin(angle);
      my -= 9 * Math.cos(angle);
      if (Math.abs(x2 - x1) < 1) mx = x1 - 9; // vertical: put the number on the left
    }
    var deg = angle * 180 / Math.PI;
    if (deg >= 90 || deg < -90) deg += 180; // keep text readable (vertical text reads bottom to top)
    var t = make('text', { x: mx, y: my, 'text-anchor': 'middle', 'dominant-baseline': 'central', transform: 'rotate(' + deg + ' ' + mx + ' ' + my + ')' }, g);
    t.textContent = label;
    showDim(g);
    return g;
  }

  function showDim(g) {
    g.querySelectorAll('line, path:not(.head), circle').forEach(function (el) { drawIn(el, DIM_MS); });
    g.querySelectorAll('.head, text').forEach(function (el) {
      anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: DIM_MS * 0.6, fill: 'backwards' }));
    });
  }

  function px(n) { return Math.round(n) + 'px'; }

  // Height of the whole box, outside on the left (only if there's room on screen)
  function dimBoxHeight(w, h) {
    if (hero.getBoundingClientRect().left < 40) return;
    var x = -22;
    linearDim(x, 0, x, h, px(h), [[-4, 0, x - 6, 0], [-4, h, x - 6, h]]);
  }

  // Overall width, under the box
  function dimBoxWidth(w, h) {
    var y = h + 48; // below the corner-radius callout
    linearDim(0, y, w, y, px(w), [[0, h + 4, 0, y + 6], [w, h + 4, w, y + 6]]);
  }

  // Corner radius callout on the bottom-right corner
  function dimRadius(w, h) {
    var r = Math.min(14, h / 4);
    var px0 = w - r + r * Math.SQRT1_2, py0 = h - r + r * Math.SQRT1_2;
    var g = make('g', { class: 'dim temp' }, svg);
    make('path', { d: 'M ' + (px0 - 20) + ' ' + (py0 + 30) + ' L ' + px0 + ' ' + py0 }, g);
    make('path', { d: 'M ' + (px0 - 20) + ' ' + (py0 + 30) + ' H ' + (px0 - 62) }, g);
    arrowHead(g, px0, py0, Math.atan2(-30, 20));
    var t = make('text', { x: px0 - 61, y: py0 + 25 }, g);
    t.textContent = 'R' + Math.round(r);
    showDim(g);
  }

  // Cap height of the name, plus the gap between the first two letters
  function dimName() {
    var base = rel(probe).y;
    var a = rel(letters[0]), b = rel(letters[1]);
    var inkA = ink(text[0]), inkB = ink(text[1]);
    var aLeft = a.x - inkA.left, aRight = a.x + inkA.right;
    var capTop = base - inkA.up;
    var x = aLeft - 14;
    linearDim(x, capTop, x, base, px(inkA.up), [[aLeft - 3, capTop, x - 5, capTop], [aLeft - 3, base, x - 5, base]]);

    var bLeft = b.x - inkB.left, bTop = base - inkB.up;
    var y = capTop - 12;
    if (bLeft - aRight > 12) {
      linearDim(aRight, y, bLeft, y, px(bLeft - aRight), [[aRight, capTop - 3, aRight, y - 5], [bLeft, bTop - 3, bLeft, y - 5]]);
    }
  }

  // Diameter of the G
  function dimG() {
    var i = text.indexOf('G');
    if (i < 0) return;
    var p = rel(letters[i]), m = ink('G'), base = rel(probe).y;
    var cx = p.x + (m.right - m.left) / 2;
    var cy = base - (m.up - m.down) / 2;
    var d = Math.max(m.left + m.right, m.up + m.down);
    var r = d / 2 + 4;
    var g = make('g', { class: 'dim temp' }, svg);
    make('circle', { cx: cx, cy: cy, r: r, 'stroke-dasharray': '3 3' }, g);
    var lx = cx + r * Math.SQRT1_2, ly = cy - r * Math.SQRT1_2;
    make('path', { d: 'M ' + lx + ' ' + ly + ' L ' + (lx + 16) + ' ' + (ly - 18) + ' H ' + (lx + 58) }, g);
    var t = make('text', { x: lx + 18, y: ly - 23 }, g);
    t.textContent = '⌀' + Math.round(d);
    showDim(g);
  }

  // ----- The sequence -----

  function play() {
    if (state !== 'waiting') return;
    state = 'playing';
    clearTimeout(window.introFallback);

    var w = hero.offsetWidth, h = hero.offsetHeight;
    svg.innerHTML = '';

    // Spread the letters out (without moving anything else on the page)
    var fs = parseFloat(getComputedStyle(nameEl).fontSize);
    var nameW = letters[letters.length - 1].getBoundingClientRect().right - letters[0].getBoundingClientRect().left;
    var cs = getComputedStyle(hero);
    var inner = hero.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var gap = Math.max(0, Math.min(fs * 0.45, (inner - nameW) / (letters.length - 1)));
    letters.forEach(function (s, i) {
      s.style.transition = 'none';
      s.style.transform = 'translateX(' + (i * gap) + 'px)';
      s.style.opacity = '0';
    });
    void nameEl.offsetWidth; // apply that before turning transitions back on
    letters.forEach(function (s, i) {
      s.style.transition = '';
      later(function () { s.style.opacity = '1'; }, 60 + i * 70);
    });
    nameEl.style.visibility = 'visible';

    // Lines to draw, and the dimension that appears when each one finishes
    var base = rel(probe).y;
    var first = rel(letters[0]), last = rel(letters[letters.length - 1]);
    var edges = borderPaths(w, h);
    var lines = [
      { d: edges[0], cls: 'edge', then: dimG },
      { d: edges[1], cls: 'edge', then: function () { dimRadius(w, h); } },
      { d: edges[2], cls: 'edge', then: function () { dimBoxWidth(w, h); } },
      { d: edges[3], cls: 'edge', then: function () { dimBoxHeight(w, h); } },
      { d: 'M ' + (first.x - 18) + ' ' + base + ' H ' + (last.right + 18), cls: 'construction temp', then: dimName }
    ];

    var els = lines.map(function (l) { return make('path', { d: l.d, class: l.cls }, svg); });
    var longest = Math.max.apply(null, els.map(function (e) { return e.getTotalLength(); }));
    var speed = longest / LONGEST_LINE_MS; // px per ms, the same for every line

    els.forEach(function (el, i) {
      var ms = el.getTotalLength() / speed;
      drawIn(el, ms);
      later(lines[i].then, ms);
    });

    // Letters come together, dimensions clear, then nav (top to bottom) and links (left to right)
    var t = LONGEST_LINE_MS + DIM_MS + 420;
    later(function () {
      letters.forEach(function (s) { s.style.transform = 'translateX(0)'; });
      svg.querySelectorAll('.temp').forEach(function (el) { el.classList.add('gone'); });
    }, t);
    later(function () {
      staggerIn(hero.querySelectorAll('.nav-row'), 140);
      staggerIn(hero.querySelectorAll('.links li'), 120);
      staggerIn([hero.querySelector('.tagline')], 0);
      staggerIn(document.querySelectorAll('.sections, .footer'), 0, 300);
      root.classList.remove('intro');
    }, t + 650);
    later(cleanUp, t + 1400);
  }

  function staggerIn(list, step, start) {
    Array.prototype.forEach.call(list, function (el, i) {
      el.style.transitionDelay = ((start || 0) + i * step) + 'ms';
    });
  }

  function cleanUp() {
    state = 'done';
    timers.forEach(clearTimeout);
    anims.forEach(function (a) { a.cancel(); });
    timers = [];
    anims = [];
    drawFinalBorder();
    letters.forEach(function (s) { s.style.transition = 'none'; s.style.transform = ''; s.style.opacity = ''; });
    void nameEl.offsetWidth;
    letters.forEach(function (s) { s.style.transition = ''; });
    nameEl.style.visibility = 'visible';
    document.querySelectorAll('[style*="transition-delay"]').forEach(function (el) { el.style.transitionDelay = ''; });
    root.classList.remove('intro');
    stopListening();
  }

  // Skip straight to the end
  function skip() {
    if (state === 'done') return;
    clearTimeout(window.introFallback);
    cleanUp();
  }

  var skipEvents = ['pointerdown', 'wheel', 'touchmove', 'keydown'];
  function stopListening() { skipEvents.forEach(function (e) { window.removeEventListener(e, skip); }); }
  skipEvents.forEach(function (e) { window.addEventListener(e, skip, { passive: true }); });

  // Keep the border the right size if the window changes size
  var lastSize = '';
  new ResizeObserver(function () {
    var size = hero.offsetWidth + 'x' + hero.offsetHeight;
    if (size === lastSize) return;
    var first = lastSize === '';
    lastSize = size;
    if (state === 'done') drawFinalBorder();
    else if (state === 'playing' && !first) skip();
  }).observe(hero);

  // Start once the fonts have loaded (so the measurements are right), but never wait long
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || location.hash) {
    skip();
  } else {
    nameEl.style.visibility = 'hidden';
    Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 1500); })]).then(play);
  }

  function addCompareSwitch() {
    var box = document.createElement('div');
    box.className = 'compare';
    [['font', 'mono', 'serif'], ['accent', 'none', 'red']].forEach(function (opt) {
      var b = document.createElement('button');
      b.type = 'button';
      function label() { b.textContent = opt[0] + ': ' + (root.dataset[opt[0]] || opt[1]); }
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        root.dataset[opt[0]] = root.dataset[opt[0]] === opt[2] ? opt[1] : opt[2];
        label();
      });
      label();
      box.appendChild(b);
    });
    document.body.appendChild(box);
  }
})();

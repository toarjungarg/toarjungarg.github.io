// Loading animation for the header box.
// The border draws like a pencil sketch (every line at the same speed), each line gets
// dimensioned as soon as it finishes, every letter of the name gets its own dimension, then
// the letters slide together and the nav and links fade in. Clicking, scrolling or pressing
// a key skips it. The drawing itself is done by assets/js/draft.js.
(function () {
  'use strict';

  var root = document.documentElement;
  var hero = document.querySelector('.hero');
  var nameEl = hero.querySelector('.name');

  var LONGEST_LINE_MS = 560;  // the longest border line takes this long; shorter ones finish sooner
  var SWEEP_MS = 850;         // time for the letter sweep to cross the whole box
  var HOLD_MS = 650;          // how long the finished drawing stays up before the letters close up
  var DIM_MS = 260;           // how long a dimension takes to draw (matches draft.js)

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

  var sheet = Draft.sheet(hero);
  var timers = [];
  var state = 'waiting'; // waiting -> playing -> done

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function px(n) { return Math.round(n) + 'px'; }

  // The rounded box as one closed outline, clockwise from the end of the top-left corner
  function outline(w, h) {
    var r = corner(h);
    var arc = ' A ' + r + ' ' + r + ' 0 0 1 ';
    return 'M ' + r + ' 0 H ' + (w - r) + arc + w + ' ' + r + ' V ' + (h - r) + arc + (w - r) + ' ' + h +
      ' H ' + r + arc + '0 ' + (h - r) + ' V ' + r + arc + r + ' 0 Z';
  }
  function corner(h) { return Math.min(14, h / 4); }

  // Where the border starts drawing from. Any points work (each snaps to the nearest spot on the
  // border), so later these can follow the cursor. Now: the bottom-left and top-right corners.
  function borderStarts(w, h) {
    return [[0, h], [w, 0]];
  }

  // Distance ranges of each side along the outline, for knowing when a side is finished
  function sideRanges(w, h) {
    var r = corner(h), q = Math.PI * r / 2, W = w - 2 * r, H = h - 2 * r;
    return {
      top: [0, W],
      right: [W + q, W + q + H],
      brCorner: [W + q + H, W + 2 * q + H],
      bottom: [W + 2 * q + H, 2 * W + 2 * q + H],
      left: [2 * W + 3 * q + H, 2 * W + 3 * q + 2 * H]
    };
  }

  function drawFinalBorder() {
    sheet.clear();
    sheet.line(outline(hero.offsetWidth, hero.offsetHeight));
  }

  // ----- What gets dimensioned -----

  var base = 0;                                    // baseline of the name (set when the animation starts)
  function box(i) { return sheet.glyph(letters[i], base, text[i]); }
  function lastG() { return text.lastIndexOf('g'); }

  // Height of the whole box, outside on the left (only if there's room on screen)
  function dimBoxHeight(w, h) {
    if (hero.getBoundingClientRect().left < 40) return;
    sheet.vertical([0, 0], [0, h], -22, px(h));
  }

  // Overall width, under the box
  function dimBoxWidth(w, h) {
    sheet.horizontal([0, h], [w, h], h + 48, px(w));
  }

  // Fillet on the bottom-right corner: leader out to the right (down and left on a narrow phone)
  function dimFillet(w, h) {
    var r = corner(h);
    var tip = [w - r + r * Math.SQRT1_2, h - r + r * Math.SQRT1_2];
    var room = window.innerWidth - hero.getBoundingClientRect().right > 70;
    sheet.leader(tip, 'R' + Math.round(r), { dx: room ? 1 : -1, dy: 1 });
  }

  // Gap between the first two letters
  function dimGap() {
    var a = box(0), b = box(1);
    if (b.l - a.r > 12) sheet.horizontal([a.r, a.top], [b.l, b.top], a.top - 12, px(b.l - a.r));
  }

  // Full height of the name (top of the capitals to the bottom of the descenders), on the right
  function dimNameHeight() {
    var all = letters.map(function (s, i) { return text[i] === ' ' ? null : box(i); }).filter(Boolean);
    var top = Math.min.apply(null, all.map(function (b) { return b.top; }));
    var bottom = Math.max.apply(null, all.map(function (b) { return b.bottom; }));
    var right = all[all.length - 1].r;
    if (hero.offsetWidth - right < 40) return;
    sheet.vertical([right, top], [right, bottom], right + 18, px(bottom - top));
  }

  // Diameter of the round part of the last g: the leader's arrow just touches its edge
  function dimBowl() {
    var i = lastG();
    if (i < 0) return;
    var p = sheet.rel(letters[i]), o = sheet.ink(nameEl, 'o');
    var d = o.left + o.right;
    var cx = p.x + (o.right - o.left) / 2, cy = base - o.up / 2;
    var tip = [cx - (d / 2) * Math.SQRT1_2, cy - (d / 2) * Math.SQRT1_2];
    sheet.leader(tip, '⌀' + Math.round(d), { dx: -1, dy: -1 });
  }

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  // Pick the dimensions for every letter, mixed up differently on each visit.
  // Half of the letters (chosen at random) get both a width and a height; the rest get one.
  // The A always gets an angled dimension along its long / stroke.
  // Each letter's choice: { h: 'below' | 'above' | null, v: 'right' | 'left' | null, angled }
  function pickStyles() {
    var g = lastG();
    var idx = [];
    text.split('').forEach(function (c, i) { if (c !== ' ') idx.push(i); });
    var both = {};
    idx.slice().sort(function () { return Math.random() - 0.5; })
      .slice(0, Math.round(idx.length / 2)).forEach(function (i) { both[i] = true; });

    var styles = [];
    idx.forEach(function (i) {
      var b = box(i), s = { h: null, v: null, angled: false };
      var next = text[i + 1] && text[i + 1] !== ' ' ? box(i + 1).l : Infinity;
      var prevR = i > 0 && text[i - 1] !== ' ' ? box(i - 1).r : -Infinity;
      var prev = styles[i - 1];
      // keep clear of the A-r gap dimension, the g's leader, and the name's height on the right
      var hOpts = i > 1 && i < g - 1 ? ['below', 'above'] : ['below'];
      var vOpts = [];
      if (i < g - 1 && next - b.r > 26) vOpts.push('right');
      if (i > 1 && i !== g && b.l - prevR > 26 && !(prev && prev.v === 'right')) vOpts.push('left');

      if (i === 0 && text[0] === 'A') {
        s.angled = true;
        if (both[i]) s.h = 'below';
      } else if (both[i] && vOpts.length) {
        s.h = pick(hOpts);
        s.v = pick(vOpts);
      } else if (vOpts.length && Math.random() < 0.5) {
        s.v = pick(vOpts);
      } else {
        s.h = pick(hOpts);
      }
      styles[i] = s;
    });
    return styles;
  }

  function dimLetter(i, s, rows) {
    var b = box(i);
    if (b.r - b.l < 2) return;
    var width = String(Math.round(b.r - b.l)), height = String(Math.round(b.bottom - b.top));
    if (s.h === 'below') sheet.horizontal([b.l, b.bottom], [b.r, b.bottom], rows.below, width);
    if (s.h === 'above') sheet.horizontal([b.l, b.top], [b.r, b.top], rows.above, width);
    if (s.v === 'right') sheet.vertical([b.r, b.top], [b.r, b.bottom], b.r + 9, height);
    if (s.v === 'left') sheet.vertical([b.l, b.top], [b.l, b.bottom], b.l - 9, height);
    if (s.angled) {
      // along the long left stroke: from the bottom-left foot up to the top point
      var foot = [b.l, b.base], apex = [(b.l + b.r) / 2, b.top];
      sheet.aligned(foot, apex, 16, String(Math.round(Math.hypot(apex[0] - foot[0], apex[1] - foot[1]))));
    }
  }

  // ----- The sequence -----

  function play() {
    if (state !== 'waiting') return;
    state = 'playing';
    clearTimeout(window.introFallback);

    var w = hero.offsetWidth, h = hero.offsetHeight;
    sheet.clear();

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
    base = sheet.baseline(nameEl);

    // The border: lines run both ways from each start point at the same speed and stop where they
    // meet; each side gets dimensioned the moment it's finished
    var longestSide = Math.max(w, h);
    var drawing = sheet.trace(outline(w, h), borderStarts(w, h), { speed: longestSide / LONGEST_LINE_MS });
    function doneAt(range) {
      var t = 0;
      for (var s = range[0]; s <= range[1]; s += 4) t = Math.max(t, drawing.timeAt(s));
      return Math.max(t, drawing.timeAt(range[1]));
    }
    var sides = sideRanges(w, h);
    later(dimBowl, doneAt(sides.top));
    later(function () { dimFillet(w, h); }, doneAt(sides.brCorner));
    later(function () { dimBoxWidth(w, h); }, doneAt(sides.bottom));
    later(function () { dimBoxHeight(w, h); }, doneAt(sides.left));

    // The letters: an invisible sweep moves left to right at its own steady pace, and each letter
    // gets its dimension the moment the sweep passes it
    var start = box(0).l - 18;
    var sweepSpeed = w / SWEEP_MS;
    var rows = {
      below: base + Math.max(sheet.ink(nameEl, 'g').down, sheet.ink(nameEl, 'j').down) + 16,
      above: base - sheet.ink(nameEl, 'A').up - 14
    };
    var styles = pickStyles();
    var sweepEnd = 0;
    letters.forEach(function (s, i) {
      if (!styles[i]) return;
      var t = (box(i).r - start) / sweepSpeed;
      sweepEnd = Math.max(sweepEnd, t);
      later(function () { dimLetter(i, styles[i], rows); }, t);
    });
    later(function () { dimGap(); dimNameHeight(); }, sweepEnd + 120);

    // Letters come together, dimensions clear, then nav (top to bottom) and links (left to right)
    var t = Math.max(LONGEST_LINE_MS, sweepEnd + 120) + DIM_MS + HOLD_MS;
    later(function () {
      letters.forEach(function (s) { s.style.transform = 'translateX(0)'; });
      sheet.fade();
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
    timers = [];
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
  function listen() { skipEvents.forEach(function (e) { window.addEventListener(e, skip, { passive: true }); }); }
  function stopListening() { skipEvents.forEach(function (e) { window.removeEventListener(e, skip); }); }
  listen();

  // Press r (anywhere on the page) to watch the animation again
  function replay() {
    stopListening();
    timers.forEach(clearTimeout);
    timers = [];
    sheet.clear();
    window.scrollTo({ top: 0, behavior: 'instant' });
    root.classList.add('intro');
    nameEl.style.visibility = 'hidden';
    state = 'waiting';
    // start on the next tick, so the r key press itself doesn't count as "skip"
    setTimeout(function () { listen(); play(); }, 30);
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'r' && e.key !== 'R') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;       // leave Cmd+R (reload) alone
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return; // typing in a box
    replay();
  });

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
})();

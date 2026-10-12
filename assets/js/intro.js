// Loading animation: the page draws itself like an engineering drawing.
// The header box's border draws like a pencil sketch (every line at the same speed) and each side
// gets dimensioned as soon as it's finished. At the same time all the text on the page spreads out
// as an invisible line sweeps across it, and the resume, the Spotify player and the map come in from
// left to right with it. The name and the section titles get every letter dimensioned, the projects'
// ^ v get their width, height and angle, and each section's boxes (the text of an experience row or
// of the project showing, the resume, the player, the map) get their width and height, without the
// boxes being drawn. The (notes) by the titles fade in in the second half. Then everything closes
// back up and the nav, the tagline, the linkedin / email / github links and the photos fade in.
// It plays once when the page loads, and after that only when r is pressed. While it plays, only
// scrolling works (and r): nothing can be clicked, and the hidden section stays shut.
// "(press r to run animation again)" shows at the right while it draws.
// The text part is assets/js/textdims.js; the drawing tools are assets/js/draft.js.
(function () {
  'use strict';

  var root = document.documentElement;
  var hero = document.querySelector('.hero');
  var nameEl = hero.querySelector('.name');

  // All the text that spreads out and closes up. The nav, the tagline and the contact links are left
  // out on purpose: they fade in at the end.
  var TEXT = [
    '.section-title',   // section headings (every letter dimensioned), with their (notes)
    '.resume-hint',     // (click to open)
    '.xhead',           // Baja SAE < Midnight Sun > SHAD, the < > included
    '.entry-name', '.entry-sub', '.bullets li', '.ptools', '.plink',
    '.trip-inner p',    // the Trips Map panel, if one is open
    '.footer'
  ].join(', ');
  // The (notes): no dimensions, and they fade in in the second half
  var NOTES = '.title-note, .resume-hint';
  // Boxes that get their width and height, without the boxes being drawn: around the text in each
  // experience row and the project showing (as it sits before it stretches)...
  var TEXT_BOXES = '.xrow, .pcard.on';
  // ...and around the resume, the Spotify player and the map, which come in from left to right
  // with the text (the only things that do; the photos come in at the end)
  var ATTACHED = '.resume-box, .spotify, .map-frame';

  var TITLE_GAP = 1;          // em between a section title's spread-out letters (more than other text, so their numbers are easy to read)
  var LONGEST_LINE_MS = 560;  // the longest border line takes this long; shorter ones finish sooner
  var SWEEP_MS = 850;         // time for the dimension sweep to cross the page
  var WRITE_SPEED = 1;        // px per ms: the text appears from left to right at this pace
  var NOTES_SPEED = 3;        // px per ms: the (notes) appear from left to right at this pace
  var HOLD_MS = 350;          // how long the finished drawing stays up before everything closes up
  var DIM_MS = 260;           // how long a dimension takes to draw (matches draft.js)

  var sheet = Draft.sheet(hero);
  var timers = [];
  var state = 'waiting';  // waiting -> playing -> done
  var run = null;         // all the text being drawn (assets/js/textdims.js)
  var N = null;           // the name's piece of that: its letters, their ink boxes, its baseline
  var boxSheets = [];     // the sheets the boxes' and arrows' dimensions are drawn on, one per section
  var wipes = [];         // the resume, player and map coming in from left to right
  var speed = 1;          // px per ms of the dimension sweep (set when it plays)

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function px(n) { return Math.round(n) + 'px'; }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function none() { return []; }

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

  // ----- The header box's dimensions -----

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

  // ----- The name's dimensions (the section titles get TextDims' usual ones) -----

  function box(i) { return N.chars[i].box; }
  function lastG() { return N.text.lastIndexOf('g'); }

  // Gap between the first two letters
  function dimGap() {
    var a = box(0), b = box(1);
    if (b.l - a.r > 12) sheet.horizontal([a.r, a.top], [b.l, b.top], a.top - 12, px(b.l - a.r));
  }

  // Full height of the name (top of the capitals to the bottom of the descenders), on the right
  function dimNameHeight() {
    var all = N.chars.filter(function (c) { return c.box; }).map(function (c) { return c.box; });
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
    var p = sheet.rel(N.chars[i].span), o = sheet.ink(nameEl, 'o');
    var d = o.left + o.right;
    var cx = p.x + (o.right - o.left) / 2, cy = N.base - o.up / 2;
    var tip = [cx - (d / 2) * Math.SQRT1_2, cy - (d / 2) * Math.SQRT1_2];
    sheet.leader(tip, '⌀' + Math.round(d), { dx: -1, dy: -1 });
  }

  // Pick the dimensions for every letter, mixed up differently on each visit.
  // Half of the letters (chosen at random) get both a width and a height; the rest get one.
  // The A always gets an angled dimension along its long / stroke.
  // Each letter's choice: { h: 'below' | 'above' | null, v: 'right' | 'left' | null, angled }
  function pickStyles() {
    var text = N.text, g = lastG();
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

  // Every letter as the sweep passes it, then the gap between the first two letters and the
  // name's full height once the sweep is past the name
  function nameDims(p) {
    var rows = {
      below: p.base + Math.max(sheet.ink(nameEl, 'g').down, sheet.ink(nameEl, 'j').down) + 16,
      above: p.base - sheet.ink(nameEl, 'A').up - 14
    };
    var jobs = [], end = 0;
    pickStyles().forEach(function (s, i) {
      if (!s) return;
      end = Math.max(end, box(i).r);
      jobs.push({ x: p.left + box(i).r, draw: function () { dimLetter(i, s, rows); } });
    });
    jobs.push({ x: p.left + end + 120 * speed, draw: function () { dimGap(); dimNameHeight(); } });
    return jobs;
  }

  // ----- The sections' boxes and the projects' arrows -----

  // One sheet over each whole section to draw them on (so a project's aren't cut off by the wheel)
  function sectionSheet(el) {
    var host = el.closest('.section') || el.parentElement;
    var own = boxSheets.filter(function (b) { return b.sheet.host === host; })[0];
    if (!own) {
      own = { made: getComputedStyle(host).position === 'static' };
      if (own.made) host.style.position = 'relative';
      own.sheet = Draft.sheet(host);
      boxSheets.push(own);
    }
    return own.sheet;
  }

  // A box's overall width under it, and its height on its left (only if there's room on screen).
  // If one of the projects' arrows sits right under the box, the width goes over it instead.
  // text: the box around the text inside, where it sits before it stretches
  function boxDims(el, text) {
    var S = sectionSheet(el), h = S.host.getBoundingClientRect(), b = el.getBoundingClientRect();
    if (text) {
      b = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
      run.pieces.forEach(function (p) {
        if (!el.contains(p.el)) return;
        p.items.forEach(function (it) {
          b.left = Math.min(b.left, it.rest.left);
          b.top = Math.min(b.top, it.rest.top);
          b.right = Math.max(b.right, it.rest.right);
          b.bottom = Math.max(b.bottom, it.rest.bottom);
        });
      });
      if (b.left === Infinity) return [];
    }
    var r = { x: b.left - h.left, y: b.top - h.top, right: b.right - h.left, bottom: b.bottom - h.top };
    var under = Array.prototype.every.call(S.host.querySelectorAll('.chev'), function (c) {
      var a = S.rel(c);
      return a.x > r.right || a.right < r.x || a.y > r.bottom + 36 || a.bottom < r.bottom;
    });
    var edge = under ? r.bottom : r.y, y = under ? r.bottom + 22 : r.y - 16;
    // a text box's dimensions stay up until its text has closed back into them
    function stay(g) { if (text) g.classList.add('late'); }
    var jobs = [{ x: h.left + r.right, draw: function () {
      stay(S.horizontal([r.x, edge], [r.right, edge], y, px(r.right - r.x)));
    } }];
    if (b.left >= 40) {
      jobs.push({ x: h.left + r.x, draw: function () {
        stay(S.vertical([r.x, r.y], [r.x, r.bottom], r.x - 22, px(r.bottom - r.y)));
      } });
    }
    return jobs;
  }

  // The projects' ^ and v: overall width (over the ^, under the v), height, and the angle of the point
  function arrowDims(chevs) {
    return chevs.map(function (b) {
      var S = sectionSheet(b), left = S.host.getBoundingClientRect().left;
      // the arrow is drawn on an 84 x 42 grid: an end, the point, the other end
      var r = S.rel(b), s = (r.right - r.x) / 84;
      var n = b.querySelector('path').getAttribute('d').match(/[\d.]+/g).map(Number);
      var p1 = [r.x + n[0] * s, r.y + n[1] * s], tip = [r.x + n[2] * s, r.y + n[3] * s], p2 = [r.x + n[4] * s, r.y + n[5] * s];
      var side = tip[1] < p1[1] ? -1 : 1; // ^ has its point above its ends, v below
      var turn = Math.abs(Math.atan2(p2[1] - tip[1], p2[0] - tip[0]) - Math.atan2(p1[1] - tip[1], p1[0] - tip[0]));
      var deg = Math.round(Math.min(turn, 2 * Math.PI - turn) * 180 / Math.PI);
      return { x: left + p2[0] + 14, draw: function () {
        S.horizontal(p1, p2, tip[1] + side * 12, String(Math.round(p2[0] - p1[0])));
        S.vertical(tip, p2, p2[0] + 14, String(Math.round(Math.abs(p2[1] - tip[1]))));
        S.angle(tip, p1, p2, 15, deg + '°');
      } };
    });
  }

  // The resume, the Spotify player and the map come in from left to right with the text: their left
  // edge as the sweep reaches it, and the rest uncovered at the sweep's pace
  function wipeIn(el, at) {
    var r = el.getBoundingClientRect();
    wipes.push(el.animate([
      { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
      { opacity: 1, offset: 0.2 },
      { clipPath: 'inset(0 0% 0 0)', opacity: 1 }
    ], { duration: r.width / WRITE_SPEED, delay: at(r.left), easing: 'linear', fill: 'backwards' }));
  }

  // Only what's on screen right now (not a hidden project, a closed panel or the hidden section)
  function showing(el) {
    return el.getClientRects().length > 0 &&
      !el.closest('[hidden], [inert], .ghost, .leaving, .pcard:not(.on), .map-wrap:not(.open) .trip-panel, .shh');
  }

  // While it plays only scrolling works: nothing on the page or in the hidden section can be
  // clicked, focused or typed into (r still replays, and hidden.js keeps the hidden section shut)
  function freeze(on) {
    root.classList.toggle('animating', on);
    document.querySelectorAll('.page, .shh').forEach(function (el) { el.inert = on; });
  }

  // ----- The sequence -----

  function play() {
    state = 'playing';
    clearTimeout(window.introFallback);
    root.classList.add('intro', 'sketching');

    var w = hero.offsetWidth, h = hero.offsetHeight;
    sheet.clear();
    speed = w / SWEEP_MS;

    // All the text: split up, spread out and hidden. The name has its own dimensions, the section
    // titles spread out more and get every letter dimensioned (not their notes), and the rest only
    // spreads out.
    function all(selector) { return Array.prototype.filter.call(document.querySelectorAll(selector), showing); }
    var texts = [nameEl].concat(all(TEXT)), textBoxes = all(TEXT_BOXES), attached = all(ATTACHED), chevs = all('.chev');
    run = TextDims.start(texts, function (el) {
      if (el === nameEl) return { sheet: sheet, dims: nameDims };
      if (el.matches('.section-title')) return { every: [1], noDims: NOTES, gap: TITLE_GAP };
      return { dims: none };
    });
    N = run.pieces.filter(function (p) { return p.el === nameEl; })[0];
    root.classList.remove('waiting');

    // An invisible line sweeps from just left of the page to the right at a steady pace: the text
    // (and the resume, player and map) appears as it passes, and each dimension draws the moment
    // the sweep reaches its right end
    var x0 = hero.getBoundingClientRect().left - 18;
    function writeAt(x) { return 60 + Math.max(0, x - x0) / WRITE_SPEED; }
    var jobs = run.jobs().concat(arrowDims(chevs));
    textBoxes.forEach(function (el) { jobs = jobs.concat(boxDims(el, true)); });
    attached.forEach(function (el) { jobs = jobs.concat(boxDims(el, false)); wipeIn(el, writeAt); });
    var sweepEnd = 0;
    jobs.forEach(function (job) {
      var t = Math.max(0, (job.x - x0) / speed);
      sweepEnd = Math.max(sweepEnd, t);
      later(job.draw, t);
    });
    var t = Math.max(LONGEST_LINE_MS, sweepEnd + 120) + DIM_MS + HOLD_MS;
    // The (notes) start fading in once the drawing is finished, a little faster
    run.appear(function (x, span) {
      return span.closest(NOTES) ? t - HOLD_MS + Math.max(0, x - x0) / NOTES_SPEED : writeAt(x);
    }, later);
    freeze(true);

    // The border: lines run both ways from each start point at the same speed and stop where they
    // meet; each side gets dimensioned the moment it's finished
    var drawing = sheet.trace(outline(w, h), borderStarts(w, h), { speed: Math.max(w, h) / LONGEST_LINE_MS });
    function doneAt(range) {
      var t = 0;
      for (var s = range[0]; s <= range[1]; s += 4) t = Math.max(t, drawing.timeAt(s));
      return Math.max(t, drawing.timeAt(range[1]));
    }
    var sides = sideRanges(w, h);
    if (N) later(dimBowl, doneAt(sides.top));
    later(function () { dimFillet(w, h); }, doneAt(sides.brCorner));
    later(function () { dimBoxWidth(w, h); }, doneAt(sides.bottom));
    later(function () { dimBoxHeight(w, h); }, doneAt(sides.left));

    // Everything closes up and the dimensions and the "press r" hint fade (the text boxes' once the
    // text has finished closing), then the nav (top to bottom), the tagline and links (top to
    // bottom, left to right) and the photos come in
    later(function () {
      run.close();
      sheet.fade();
      boxSheets.forEach(function (b) { b.sheet.fade('.late'); });
      root.classList.remove('sketching');
    }, t);
    later(function () {
      boxSheets.forEach(function (b) { b.sheet.fade(); });
    }, t + Site.motion('close').duration);
    later(function () {
      staggerIn(hero.querySelectorAll('.nav-row'), 140);
      staggerIn(hero.querySelectorAll('.tagline, .links li'), 120);
      staggerIn(document.querySelectorAll('.xphotos'), 0, 150);
      root.classList.remove('intro');
    }, t + 650);
    later(finish, t + 1400);
  }

  function staggerIn(list, step, start) {
    Array.prototype.forEach.call(list, function (el, i) {
      el.style.transitionDelay = ((start || 0) + i * step) + 'ms';
    });
  }

  // Stop wherever it is: plain text back, the finished border, everything showing and working
  function finish() {
    timers.forEach(clearTimeout);
    timers = [];
    if (run) { run.restore(); run = null; }
    N = null;
    boxSheets.forEach(function (b) {
      b.sheet.remove();
      if (b.made) b.sheet.host.style.position = '';
    });
    boxSheets = [];
    wipes.forEach(function (a) { a.cancel(); });
    wipes = [];
    drawFinalBorder();
    document.querySelectorAll('[style*="transition-delay"]').forEach(function (el) { el.style.transitionDelay = ''; });
    root.classList.remove('intro', 'waiting', 'sketching');
    freeze(false);
    state = 'done';
  }

  // Press r (anywhere on the page) to watch it again, from wherever you are on the page. Anything
  // with its own entrance (the map drawing its outline and dropping its pins) plays that again too.
  function replay() {
    finish();
    document.dispatchEvent(new Event('intro-replay'));
    play();
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'r' && e.key !== 'R') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;       // leave Cmd+R (reload) alone
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return; // typing in a box
    replay();
  });

  // Keep the border the right size if the window changes size; mid-drawing, start it again at the new size
  var lastSize = '';
  new ResizeObserver(function () {
    var size = hero.offsetWidth + 'x' + hero.offsetHeight;
    if (size === lastSize) return;
    var first = lastSize === '';
    lastSize = size;
    if (first) return;
    if (state === 'done') drawFinalBorder();
    else if (state === 'playing') replay();
  }).observe(hero);

  // Start once the fonts (so the measurements are right) and the page's content have loaded, but
  // never wait long. Visitors who asked their device for less motion get the finished page.
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finish();
  } else {
    Promise.all([
      Promise.race([document.fonts.ready, wait(1500)]),
      Promise.race([Site.data.catch(function () {}), wait(3000)])
    ]).then(function () { requestAnimationFrame(play); });
  }
})();

// Draft: engineering-drawing lines and dimensions, drawn on an SVG layer over any element.
// Made for the header's loading animation, but written so anything can be dimensioned later
// (the name art, a heading, a project photo).
//
//   var sheet = Draft.sheet(element);        // SVG layer over the element (give it position: relative)
//   sheet.line('M 0 0 H 200', { ms: 800 });  // a line that draws itself in 800 ms
//   sheet.trace(outline, [[0, 90], [200, 0]], { speed: 1.5 });  // draw a closed outline from several points at once
//   sheet.horizontal([0, 50], [200, 50], 80, '200px');  // width between two points, dimension line at y = 80
//   sheet.vertical([0, 0], [0, 60], -20, '60px');       // height between two points, dimension line at x = -20
//   sheet.aligned([0, 60], [30, 0], 16, '67');          // along a slanted edge, 16 px off to one side
//   sheet.leader([40, 40], 'R14', { dx: 1, dy: 1 });     // arrow touching a point, then a landing line, then text
//   sheet.glyph(span, baseY)                             // ink box of a one-letter <span>
//   sheet.baseline(textElement)                          // y of a text element's baseline
//   sheet.fade()  /  sheet.stop()  /  sheet.clear()
//
// Every point is in px from the element's top-left corner. Dimensions get the class "dim temp",
// so sheet.fade() clears them all at once.
window.Draft = (function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var DIM_MS = 260; // how long one dimension takes to draw
  var ctx = document.createElement('canvas').getContext('2d');

  function make(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function sheet(host) {
    var svg = host.querySelector('svg.sketch') || make('svg', { class: 'sketch', 'aria-hidden': 'true' }, host);
    var anims = [];

    // ----- position helpers -----

    function rel(el) {
      var h = host.getBoundingClientRect(), r = el.getBoundingClientRect();
      return { x: r.left - h.left, y: r.top - h.top, right: r.right - h.left, bottom: r.bottom - h.top };
    }

    // y of a text element's baseline (a zero-size marker sitting on it)
    function baseline(textEl) {
      var probe = textEl.querySelector('.baseline-probe');
      if (!probe) {
        probe = document.createElement('span');
        probe.className = 'baseline-probe';
        probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
        textEl.appendChild(probe);
      }
      return rel(probe).y;
    }

    // Ink measurements of a character in an element's font
    function ink(el, ch) {
      var cs = getComputedStyle(el);
      ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      var m = ctx.measureText(ch);
      return { left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight, up: m.actualBoundingBoxAscent, down: m.actualBoundingBoxDescent };
    }

    // The box the ink of a one-letter span actually covers
    function glyph(span, base, ch) {
      var p = rel(span), m = ink(span, ch || span.textContent);
      return { l: p.x - m.left, r: p.x + m.right, top: base - m.up, bottom: base + m.down, base: base };
    }

    // ----- drawing -----

    function drawIn(el, ms) {
      var len = el.getTotalLength();
      el.style.strokeDasharray = len;
      el.style.strokeDashoffset = len;
      var a = el.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: ms, easing: 'linear', fill: 'forwards' });
      anims.push(a);
      return a;
    }

    function line(d, o) {
      o = o || {};
      var p = make('path', { d: d, class: o.cls || 'edge' }, svg);
      if (o.ms) drawIn(p, o.ms);
      return p;
    }

    // A dimension draws its lines in, then its arrowheads and number fade in
    function reveal(g) {
      g.querySelectorAll('line, path:not(.head)').forEach(function (el) { drawIn(el, DIM_MS); });
      g.querySelectorAll('.head, text').forEach(function (el) {
        anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: DIM_MS * 0.6, fill: 'backwards' }));
      });
      return g;
    }

    // Filled arrowhead with its tip at (x, y), pointing in the direction of angle
    function head(g, x, y, angle) {
      var s = 6, w = 2.2, c = Math.cos(angle), n = Math.sin(angle);
      make('path', {
        class: 'head',
        d: 'M ' + x + ' ' + y +
          ' L ' + (x - s * c - w * n) + ' ' + (y - s * n + w * c) +
          ' L ' + (x - s * c + w * n) + ' ' + (y - s * n - w * c) + ' Z'
      }, g);
    }

    // Core of every linear dimension: p1, p2 are the points being measured,
    // a, b are the ends of the dimension line. Extension lines run from each point to past its end.
    function dim(p1, p2, a, b, text) {
      var g = make('g', { class: 'dim temp' }, svg);
      var out = [0, 0]; // average direction from the object toward the dimension line
      [[p1, a], [p2, b]].forEach(function (pair) {
        var p = pair[0], q = pair[1], dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy);
        if (d < 1) return;
        var ux = dx / d, uy = dy / d;
        out[0] += ux; out[1] += uy;
        make('line', { x1: p[0] + ux * 3, y1: p[1] + uy * 3, x2: q[0] + ux * 5, y2: q[1] + uy * 5 }, g);
      });
      make('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, g);
      var ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      head(g, b[0], b[1], ang);
      head(g, a[0], a[1], ang + Math.PI);

      // the number sits on the line, or just outside it when the dimension is short
      var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 70) {
        var ol = Math.hypot(out[0], out[1]);
        var ox = ol ? out[0] / ol : Math.sin(ang), oy = ol ? out[1] / ol : -Math.cos(ang);
        mx += ox * 10; my += oy * 10;
      }
      var deg = ang * 180 / Math.PI;
      if (deg >= 90 || deg < -90) deg += 180; // keep text readable (vertical reads bottom to top)
      var t = make('text', { x: mx, y: my, 'text-anchor': 'middle', 'dominant-baseline': 'central', transform: 'rotate(' + deg + ' ' + mx + ' ' + my + ')' }, g);
      t.textContent = text;
      return reveal(g);
    }

    function horizontal(p1, p2, y, text) { return dim(p1, p2, [p1[0], y], [p2[0], y], text); }
    function vertical(p1, p2, x, text) { return dim(p1, p2, [x, p1[1]], [x, p2[1]], text); }

    // Along the slant from p1 to p2, `offset` px to the side (positive = to the left when walking p1 -> p2)
    function aligned(p1, p2, offset, text) {
      var dx = p2[0] - p1[0], dy = p2[1] - p1[1], len = Math.hypot(dx, dy);
      var nx = dy / len, ny = -dx / len;
      return dim(p1, p2, [p1[0] + nx * offset, p1[1] + ny * offset], [p2[0] + nx * offset, p2[1] + ny * offset], text);
    }

    // Leader (like a CAD multileader): arrow touching `tip`, an angled line, a flat landing line,
    // then the text right after the landing line ends.
    // dx: 1 = heads right, -1 = heads left. dy: -1 = up, 1 = down.
    function leader(tip, text, o) {
      o = o || {};
      var dx = o.dx || 1, dy = o.dy || -1, run = o.run || 16, rise = o.rise || 20, land = o.land || 26;
      var k = [tip[0] + dx * run, tip[1] + dy * rise];
      var e = [k[0] + dx * land, k[1]];
      var g = make('g', { class: 'dim temp' }, svg);
      make('path', { d: 'M ' + e[0] + ' ' + e[1] + ' L ' + k[0] + ' ' + k[1] + ' L ' + tip[0] + ' ' + tip[1] }, g);
      head(g, tip[0], tip[1], Math.atan2(tip[1] - k[1], tip[0] - k[0]));
      var t = make('text', { x: e[0] + dx * 4, y: e[1], 'text-anchor': dx > 0 ? 'start' : 'end', 'dominant-baseline': 'central' }, g);
      t.textContent = text;
      return reveal(g);
    }

    // Trace a closed outline from any number of starting points at once. From each start a line
    // runs both ways around the outline, and neighbouring lines stop exactly where they meet.
    //   d:      the outline as an SVG path (closed)
    //   starts: points [x, y] anywhere; each one snaps to the nearest spot on the outline
    //           (so later they can come from the cursor position)
    //   o.speed: px per ms (every line moves at this speed)
    // Returns { total, timeAt(distance) }: timeAt tells when the drawing reaches a given
    // distance along the outline (measured from where the path starts), in ms.
    function trace(d, starts, o) {
      o = o || {};
      var guide = make('path', { d: d, style: 'fill:none;stroke:none' }, svg); // only for measuring
      var total = guide.getTotalLength();
      function wrap(s) { return ((s % total) + total) % total; }
      function at(s) { return guide.getPointAtLength(wrap(s)); }
      function snap(pt) {
        var best = 0, bestD = Infinity;
        for (var s = 0; s < total; s += 2) {
          var p = at(s), dd = (p.x - pt[0]) * (p.x - pt[0]) + (p.y - pt[1]) * (p.y - pt[1]);
          if (dd < bestD) { bestD = dd; best = s; }
        }
        return best;
      }
      var pos = starts.map(snap).sort(function (a, b) { return a - b; });
      var segs = [];
      pos.forEach(function (s, k) {
        var next = k === pos.length - 1 ? pos[0] + total : pos[k + 1];
        var half = (next - s) / 2;
        segs.push({ from: s, dir: 1, len: half });      // forwards from this start...
        segs.push({ from: next, dir: -1, len: half });  // ...and backwards from the next one, to meet in the middle
      });
      segs.forEach(function (seg) {
        var pts = [];
        for (var t = 0; t < seg.len; t += 2) pts.push(at(seg.from + seg.dir * t));
        pts.push(at(seg.from + seg.dir * seg.len));
        var pd = 'M ' + pts.map(function (p) { return p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' L ');
        line(pd, { cls: o.cls || 'edge', ms: seg.len / o.speed });
      });
      guide.remove();

      function timeAt(s) {
        var best = Infinity;
        segs.forEach(function (seg) {
          var t = wrap(seg.dir > 0 ? s - seg.from : seg.from - s);
          if (t <= seg.len + 0.5) best = Math.min(best, t / o.speed);
        });
        return best;
      }
      return { total: total, timeAt: timeAt };
    }

    // ----- housekeeping -----

    function fade() { svg.querySelectorAll('.temp').forEach(function (el) { el.classList.add('gone'); }); }
    function stop() { anims.forEach(function (a) { a.cancel(); }); anims = []; }
    function clear() { stop(); svg.innerHTML = ''; }

    return {
      svg: svg, rel: rel, baseline: baseline, ink: ink, glyph: glyph,
      line: line, trace: trace, horizontal: horizontal, vertical: vertical, aligned: aligned, leader: leader,
      fade: fade, stop: stop, clear: clear
    };
  }

  return { sheet: sheet };
})();

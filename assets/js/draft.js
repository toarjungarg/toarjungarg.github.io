// Draft: engineering-drawing lines and dimensions, drawn on an SVG layer over any element.
// The loading animation uses it for the header box (assets/js/intro.js) and, through
// assets/js/textdims.js, for all the other text on the page.
//
//   var sheet = Draft.sheet(element);                   // SVG layer over the element (give it position: relative)
//   var sheet = Draft.sheet(element, { fine: true });   // smaller arrowheads and numbers, for small text
//   sheet.line('M 0 0 H 200', { ms: 800 });             // a line that draws itself in 800 ms
//   sheet.trace(outline, [[0, 90], [200, 0]], { speed: 1.5 });  // draw a closed outline from several points at once
//   sheet.horizontal([0, 50], [200, 50], 80, '200');    // width between two points, dimension line at y = 80
//   sheet.vertical([0, 0], [0, 60], -20, '60');         // height between two points, dimension line at x = -20
//   sheet.aligned([0, 60], [30, 0], 16, '67');          // along a slanted edge, 16 px off to one side
//   sheet.angle([42, 2], [2, 40], [82, 40], 15, '93°');  // the angle where two lines meet (at the first point)
//   sheet.leader([40, 40], 'R14', { dx: 1, dy: 1 });    // arrow touching a point, then a landing line, then text
//   sheet.box(span)                                     // ink box and baseline of the text in an inline-block span
//   sheet.size.row, .beside, .room                      // where widths and heights go next to text, and the room they need
//   sheet.fade()  /  sheet.stop()  /  sheet.clear()  /  sheet.remove()
//
// Every point is in px from the element's top-left corner. Dimensions get the class "dim temp",
// so sheet.fade() clears them all at once.
window.Draft = (function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var DIM_MS = 260; // how long one dimension takes to draw
  // Sizes of a dimension: arrowhead length and width, the gap before an extension line starts,
  // how far it runs past the dimension line, how far the number sits outside a short dimension,
  // and what counts as short. Next to text: a row of widths runs `row` px above or below it, a
  // height sits `beside` px to its side, and either one takes up `room` px, its numbers included.
  var SIZES = {
    normal: { head: 6, headW: 2.2, gap: 3, over: 5, out: 10, short: 70, row: 8, beside: 8, room: 26 },
    fine: { head: 4, headW: 1.5, gap: 2, over: 3, out: 7, short: 40, row: 6, beside: 5, room: 20 }
  };
  var ctx = document.createElement('canvas').getContext('2d');

  function make(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // Ink measurements of some text in an element's font, plus the font's own ascent and descent
  function ink(el, text) {
    var cs = getComputedStyle(el);
    ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    var m = ctx.measureText(text);
    return {
      left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight,
      up: m.actualBoundingBoxAscent, down: m.actualBoundingBoxDescent,
      ascent: m.fontBoundingBoxAscent, descent: m.fontBoundingBoxDescent
    };
  }

  function sheet(host, o) {
    o = o || {};
    var S = o.fine ? SIZES.fine : SIZES.normal;
    var svg = host.querySelector(':scope > svg.sketch') ||
      make('svg', { class: 'sketch' + (o.fine ? ' fine' : ''), 'aria-hidden': 'true' }, host);
    var anims = [];

    // ----- position helpers -----

    function rel(el) {
      var h = host.getBoundingClientRect(), r = el.getBoundingClientRect();
      return { x: r.left - h.left, y: r.top - h.top, right: r.right - h.left, bottom: r.bottom - h.top };
    }

    // The box the ink of an inline-block span's text (one letter or one word) covers, and its baseline.
    // An inline-block is exactly one line tall, so the baseline sits half of the room the font
    // doesn't fill below its top, plus the font's ascent.
    function box(span, text) {
      var p = rel(span), m = ink(span, text || span.textContent);
      var base = p.y + (p.bottom - p.y - m.ascent - m.descent) / 2 + m.ascent;
      return { l: p.x - m.left, r: p.x + m.right, top: base - m.up, bottom: base + m.down, base: base };
    }

    // ----- drawing -----

    // A straight line's length is quick to work out here; asking the browser for every one is slow
    function lengthOf(el) {
      if (el.tagName !== 'line') return el.getTotalLength();
      return Math.hypot(el.x2.baseVal.value - el.x1.baseVal.value, el.y2.baseVal.value - el.y1.baseVal.value);
    }

    function drawIn(el, ms) {
      var len = lengthOf(el);
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
      var s = S.head, w = S.headW, c = Math.cos(angle), n = Math.sin(angle);
      make('path', {
        class: 'head',
        d: 'M ' + x + ' ' + y +
          ' L ' + (x - s * c - w * n) + ' ' + (y - s * n + w * c) +
          ' L ' + (x - s * c + w * n) + ' ' + (y - s * n - w * c) + ' Z'
      }, g);
    }

    // The number on a dimension: on the line, or just outside it when the dimension is short
    function label(g, mx, my, ang, len, out, text) {
      if (len < S.short) {
        var ol = Math.hypot(out[0], out[1]);
        var ox = ol ? out[0] / ol : Math.sin(ang), oy = ol ? out[1] / ol : -Math.cos(ang);
        mx += ox * S.out; my += oy * S.out;
      }
      var deg = ang * 180 / Math.PI;
      if (deg >= 90 || deg < -90) deg += 180; // keep text readable (vertical reads bottom to top)
      var t = make('text', { x: mx, y: my, 'text-anchor': 'middle', 'dominant-baseline': 'central', transform: 'rotate(' + deg + ' ' + mx + ' ' + my + ')' }, g);
      t.textContent = text;
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
        make('line', { x1: p[0] + ux * S.gap, y1: p[1] + uy * S.gap, x2: q[0] + ux * S.over, y2: q[1] + uy * S.over }, g);
      });
      var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      var ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      if (len < S.head * 2.5) {
        // Too short for arrowheads between the extension lines: they sit outside, pointing in,
        // like on a real drawing
        var c = Math.cos(ang), n = Math.sin(ang), run = S.head + 3;
        make('line', { x1: a[0] - c * run, y1: a[1] - n * run, x2: b[0] + c * run, y2: b[1] + n * run }, g);
        head(g, b[0], b[1], ang + Math.PI);
        head(g, a[0], a[1], ang);
      } else {
        make('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, g);
        head(g, b[0], b[1], ang);
        head(g, a[0], a[1], ang + Math.PI);
      }
      label(g, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ang, len, out, text);
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

    // The angle where two lines meet at v, one toward p1 and one toward p2: an arc of radius r
    // between them with an arrowhead at each end, and the number just past the middle of the arc
    function angle(v, p1, p2, r, text) {
      var g = make('g', { class: 'dim temp' }, svg);
      var a1 = Math.atan2(p1[1] - v[1], p1[0] - v[0]);
      var d = Math.atan2(p2[1] - v[1], p2[0] - v[0]) - a1;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI; // the short way round
      var a2 = a1 + d, dir = d > 0 ? 1 : -1;
      function at(a, dist) { return [v[0] + dist * Math.cos(a), v[1] + dist * Math.sin(a)]; }
      var s = at(a1, r), e = at(a2, r);
      make('path', { d: 'M ' + s.join(' ') + ' A ' + r + ' ' + r + ' 0 0 ' + (d > 0 ? 1 : 0) + ' ' + e.join(' ') }, g);
      head(g, e[0], e[1], a2 + dir * Math.PI / 2);
      head(g, s[0], s[1], a1 - dir * Math.PI / 2);
      var m = at(a1 + d / 2, r + S.out + 3);
      var t = make('text', { x: m[0], y: m[1], 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
      t.textContent = text;
      return reveal(g);
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
    function remove() { stop(); svg.remove(); }

    return {
      host: host, svg: svg, size: S, rel: rel, box: box, ink: ink,
      line: line, trace: trace, horizontal: horizontal, vertical: vertical, aligned: aligned, angle: angle, leader: leader,
      fade: fade, stop: stop, clear: clear, remove: remove
    };
  }

  return { sheet: sheet };
})();

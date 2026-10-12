// TextDims: the text part of the loading animation. Text spreads out, gets dimensioned like an
// engineering drawing as an invisible sweep passes over it, then closes back up and turns back into
// plain text. assets/js/intro.js runs it on the name and on all the other text on the page at once;
// the lines and numbers are drawn by assets/js/draft.js.
//
//   var run = TextDims.start(elements, optionsFor, follow);  // split each element's text up, spread it out, hide it
//   run.pieces               // one per element: { el, text, chars, base, left, ... }
//   run.appear(when, later)  // each letter or word fades in at when(x), x = its left edge on screen
//   run.jobs()               // the dimensions to draw: [{ x, draw }], x = their right end on screen
//   run.close()              // everything slides back together and the dimensions fade
//   run.restore()            // the original text comes back exactly as it was
//
// Text spreads out both ways: along each line, and the lines of each section move apart from the top
// down, a little everywhere and more where a row of widths sits between two lines. `follow` lists
// anything else that should move down with the lines around it (the projects' ^ v).
//
// Text on one line (titles, names, roles, dates) spreads letter by letter like the name. Going along
// it, the next letter dimensioned is 1, 2 or 3 letters on (picked at random each time), and each one
// gets its width above or below it, or its height beside it (the gap it sits in widens to fit it).
// Longer text (bullets) would run off the page if its letters spread, so its words spread into the
// room left on each line, and each line gets either every word dimensioned (a few get their height)
// or one dimension across the whole line. All of it is mixed up differently on every visit. Where
// there isn't room to spread into, some dimensions are left out rather than drawn over the text.
//
// optionsFor(element) can return (or return nothing for the usual):
//   sheet: a Draft sheet to draw on (normally each element gets its own, inside it)
//   rows:  where widths may go: ['below', 'above'] (the usual), or just one of them
//   dims:  function (piece) returning its own dimensions instead of the usual ones (its letters
//          then spread out evenly)
//   still: true to only fade it in: it doesn't spread out or get dimensioned
//   every: how many letters on the next dimensioned letter can be (the usual [1, 2, 3]; [1] = every letter)
//   noDims: letters inside elements matching this selector spread out but don't get dimensioned
//   gap:   widest gap between its spread-out letters, in em (instead of LETTER_GAP)
//
// run.appear's when(x, span) also gets the letter or word's span, so some can appear at other times.
window.TextDims = (function () {
  'use strict';

  // ----- The look, in one place -----
  var LETTER_GAP = 0.45;       // widest gap between spread-out letters, in em
  var WORD_GAP = 0.8;          // widest extra gap between spread-out words in longer text, in em
  var LINE_GAP = 0;            // extra space between the lines of a section while they're spread out, in em
                               // (0: lines only move apart where a row of widths needs the room)
  var LINE_ROOM = 0.5;         // share of the empty space under a section that its lines may spread into
  var EVERY = [1, 2, 3];       // the next letter dimensioned is this many letters on (picked at random each time)
  var HEIGHT_SHARE = 0.5;      // share of those letters that get their height instead of their width, when there's room
  var WORD_HEIGHT_SHARE = 0.2; // same for the words in longer text
  var LINE_SHARE = 0.4;        // share of the lines in longer text that get one dimension across the whole line
  var LINE_HEIGHT_SHARE = 0.3; // share of lines that also get their full height at the end, when there's room
  var FINE_UNDER = 19;         // text smaller than this (px) gets the smaller arrowheads and numbers
  // Text can spread sideways as far as the edge of the closest of these around it
  var ROOM = '.hero, .xbody, .pcard, .trip-inner, .resume-head, .section, .footer';
  // The lines in each of these spread apart together. Inside one that cuts off whatever sticks out
  // of it (the Trips Map panel) they can't move, so they only keep the widths that already fit.
  var GROUP = '.trip-panel, .hero, .section, .footer';
  // Never split up: the nav and contact links, screen-reader copies, drawings
  var SKIP = '.nav, .links, .sr-only, svg, script, style';

  var each = Array.prototype.forEach;
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function px(n) { return n.toFixed(1) + 'px'; }
  function make(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ----- The whole run -----
  // Reads and writes are done in rounds (all pieces read, then all write) so the browser only has
  // to work out the page layout a few times, not once per piece.

  function start(elements, optionsFor, follow) {
    // 1. Read: what each element holds and how it sits right now
    var pieces = elements.map(function (el) {
      var cs = getComputedStyle(el), nodes = textNodes(el);
      return {
        el: el, o: optionsFor(el) || {}, nodes: nodes, oneLine: lineCount(nodes) <= 1,
        fine: parseFloat(cs.fontSize) < FINE_UNDER, wasStatic: cs.position === 'static',
        height: el.getBoundingClientRect().height,
        made: [], items: [], chars: [], text: '', lines: []
      };
    }).filter(function (p) { return p.nodes.length; });

    // Screen readers announce every change inside a live region: quiet them while the text is swapped
    var live = [];
    pieces.forEach(function (p) {
      var region = p.el.closest('[aria-live]');
      if (region && !live.some(function (l) { return l.el === region; })) {
        live.push({ el: region, was: region.getAttribute('aria-live') });
      }
    });
    live.forEach(function (l) { l.el.setAttribute('aria-live', 'off'); });

    // 2. Write: split the text into letters or words, and give each piece a sheet to draw on
    pieces.forEach(function (p) {
      split(p);
      if (!p.o.sheet && p.wasStatic) p.el.style.position = 'relative';
      p.sheet = p.o.sheet || Draft.sheet(p.el, { fine: p.fine });
    });

    // 3. Read: where everything sits, which dimensions go where, how far each letter or word moves
    //    along its line, and how far down each line moves. A piece that wraps differently once it's
    //    split goes back to plain text and sits this one out (it still moves down with the lines
    //    around it).
    var bad = pieces.filter(function (p) { return Math.abs(p.el.getBoundingClientRect().height - p.height) > 1; });
    pieces = pieces.filter(function (p) { return bad.indexOf(p) < 0; });
    pieces.forEach(plan);
    var movers = (follow || []).concat(bad.map(function (p) { return p.el; })).map(function (el) {
      return { el: el, rect: el.getBoundingClientRect(), was: getComputedStyle(el).transition, dy: 0 };
    });
    spreadDown(pieces, movers);

    // 4. Write: spread out and hide. Marks CSS draws on an element (a bullet's dash) move down with
    //    its first line, through --tx-dy.
    bad.forEach(undo);
    pieces.forEach(function (p) {
      p.el.classList.add('tx-still');
      p.el.style.setProperty('--tx-dy', px(p.lines.length ? p.lines[0].items[0].dy : 0));
      p.items.forEach(function (it) {
        it.span.style.transition = 'none';
        it.span.style.transform = 'translate(' + px(it.dx) + ', ' + px(it.dy) + ')';
        it.span.style.opacity = '0';
      });
    });
    movers.forEach(function (m) {
      m.el.style.transition = 'none';
      m.el.style.translate = '0 ' + px(m.dy);
    });

    // 5. Read: measure everything where it now sits
    pieces.forEach(measure);

    // 6. Write: transitions back on, so closing up slides (what moved down along with the text
    //    keeps its own transitions and slides back up with it)
    pieces.forEach(function (p) {
      p.el.classList.remove('tx-still');
      p.items.forEach(function (it) { it.span.style.transition = ''; });
    });
    movers.forEach(function (m) {
      m.el.style.transition = (m.was ? m.was + ', ' : '') + 'translate var(--close-time) var(--close-ease)';
    });

    // If the page rearranges a piece while it's drawn (an experience row switching names), that
    // piece closes up early instead of staying jumbled; everything else keeps drawing
    var watch = new MutationObserver(function (list) {
      list.forEach(function (m) {
        pieces.forEach(function (p) { if (p.el === m.target && !p.settled) settle(p); });
      });
    });
    pieces.forEach(function (p) { watch.observe(p.el, { childList: true }); });

    return {
      pieces: pieces,
      appear: function (when, later) {
        pieces.forEach(function (p) {
          p.items.forEach(function (it) {
            later(function () { it.span.style.opacity = ''; }, when(p.left + it.box.l, it.span));
          });
        });
      },
      jobs: function () {
        return [].concat.apply([], pieces.map(function (p) {
          var list = p.o.still ? [] : p.o.dims ? p.o.dims(p) : p.oneLine ? letterDims(p) : wordDims(p);
          return list.map(function (job) {
            return { x: job.x, draw: function () { if (!p.settled) job.draw(); } };
          });
        }));
      },
      close: function () {
        pieces.forEach(settle);
        movers.forEach(function (m) { m.el.style.translate = ''; });
      },
      restore: function () {
        watch.disconnect();
        pieces.forEach(undo);
        movers.forEach(function (m) { m.el.style.translate = ''; m.el.style.transition = ''; });
        live.forEach(function (l) { l.el.setAttribute('aria-live', l.was); });
      }
    };
  }

  // Close a piece up: its letters or words slide back together and its dimensions fade
  function settle(p) {
    p.settled = true;
    p.el.style.setProperty('--tx-dy', '0px');
    p.items.forEach(function (it) { it.span.style.transform = ''; it.span.style.opacity = ''; });
    p.sheet.fade();
  }

  // ----- Splitting text up, and putting it back -----

  // The text inside an element, as text nodes (skipping the nav, links and drawings)
  function textNodes(root) {
    var out = [], walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      var n = walk.currentNode;
      if (n.nodeValue.trim() && !n.parentElement.closest(SKIP)) out.push(n);
    }
    return out;
  }

  // How many lines that text takes up on screen
  function lineCount(nodes) {
    var rects = [];
    nodes.forEach(function (tn) {
      var r = document.createRange();
      r.selectNodeContents(tn);
      each.call(r.getClientRects(), function (rc) { if (rc.width > 0.5) rects.push(rc); });
    });
    rects.sort(function (a, b) { return a.top - b.top; });
    var n = 0, bottom = -Infinity;
    rects.forEach(function (rc) {
      if (rc.top >= bottom - 2) { n++; bottom = rc.bottom; }
      else bottom = Math.max(bottom, rc.bottom);
    });
    return n;
  }

  // Each text node is swapped for a stand-in: the letters (one-line text) or words (longer text) in
  // their own spans so they can move, plus a hidden copy of the text for screen readers.
  // Spaces stay real spaces, and a hyphen can still end a line, so the text wraps exactly as before.
  function split(p) {
    var i = 0, started = false;
    p.nodes.forEach(function (tn) {
      var stand = make('span', 'tx'), look = make('span'), say = make('span', 'sr-only', tn.nodeValue);
      look.setAttribute('aria-hidden', 'true');
      tn.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (!part.trim()) {
          look.appendChild(document.createTextNode(part));
          if (started) { p.chars.push({ ch: ' ', i: i++ }); p.text += ' '; } // a space takes one place, like a letter
          return;
        }
        started = true;
        part.match(/[^-]*-|[^-]+/g).forEach(function (w, k) {
          var word = make('span', 'tx-word');
          look.appendChild(word);
          if (p.oneLine) {
            Array.from(w).forEach(function (c) {
              var it = { span: make('span', 'tx-letter', c), text: c, ch: c, i: i++ };
              word.appendChild(it.span);
              p.chars.push(it);
              p.items.push(it);
              p.text += c;
            });
          } else {
            word.className += ' tx-move';
            word.textContent = w;
            p.items.push({ span: word, text: w, joined: k > 0 }); // joined: the rest of a hyphenated word
          }
        });
      });
      stand.appendChild(look);
      stand.appendChild(say);
      tn.parentNode.replaceChild(stand, tn);
      p.made.push([stand, tn]);
    });
  }

  // Put a piece back exactly as it was
  function undo(p) {
    p.made.forEach(function (pair) { if (pair[0].parentNode) pair[0].parentNode.replaceChild(pair[1], pair[0]); });
    p.made = [];
    p.el.style.removeProperty('--tx-dy');
    p.el.classList.remove('tx-still');
    if (p.o.sheet) return;
    p.sheet.remove();
    if (p.wasStatic) p.el.style.position = '';
  }

  // ----- Planning and spreading out -----

  // The inside edges of a box on screen (without its padding and border)
  function contentBox(el) {
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return {
      left: r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth),
      right: r.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth)
    };
  }

  // Letters or words grouped into the lines they sit on (a new line starts where the text wraps back left)
  function rows(items) {
    var out = [];
    items.forEach(function (it, k) {
      var prev = items[k - 1];
      if (!prev || (it.rest.left < prev.rest.left - 1 && it.rest.top > prev.rest.top + 1)) out.push({ items: [] });
      out[out.length - 1].items.push(it);
    });
    return out;
  }

  // Each line: which dimensions it gets, and how far its letters or words move along it (as far
  // apart as the room left on the line allows; centred text spreads both ways, the rest to the right).
  // In longer text a line's widths go all above it or all below it, and never point up right under
  // a line whose widths point down.
  function plan(p) {
    var room = contentBox(p.el.closest(ROOM) || p.el.parentElement);
    var allowed = p.o.rows || ['below', 'above'], last = null;
    p.items.forEach(function (it) { it.rest = it.span.getBoundingClientRect(); it.dy = 0; });
    p.lines = rows(p.items);
    p.lines.forEach(function (line) {
      var items = line.items;
      line.size = parseFloat(getComputedStyle(items[0].span).fontSize);
      reach(p, line);
      if (p.o.still) {
        line.picks = [];
        items.forEach(function (it) { it.dx = 0; });
        return;
      }
      var roomL = items[0].rest.left - room.left, roomR = room.right - items[items.length - 1].rest.right;
      var centred = roomL > 6 && Math.abs(roomL - roomR) < 6;
      var space = Math.max(0, centred ? 2 * Math.min(roomL, roomR) : roomR);
      if (p.oneLine) {
        spreadLetters(p, line, space);
      } else {
        if (!p.o.dims) { // (text with its own dimensions, or none, skips the usual ones)
          var choices = allowed.filter(function (r) { return !(r === 'above' && last === 'below'); });
          line.row = last = pick(choices.length ? choices : allowed);
          line.whole = Math.random() < LINE_SHARE;
        }
        spreadWords(line, space);
      }
      if (centred) {
        var mid = items[items.length - 1].dx / 2;
        items.forEach(function (it) { it.dx -= mid; });
      }
    });
    p.edge = room.right;
  }

  // Where a line's baseline sits now, and how far above and below it the font's tallest and deepest
  // letters reach, at every size on the line (widths go just beyond those)
  function reach(p, line) {
    var S = p.sheet, up = 0, down = 0, seen = {};
    line.items.forEach(function (it) {
      var size = getComputedStyle(it.span).fontSize;
      if (seen[size]) return;
      seen[size] = true;
      up = Math.max(up, S.ink(it.span, 'Hbdfhklt').up);
      down = Math.max(down, S.ink(it.span, 'gjpqy').down);
    });
    var first = line.items[0], m = S.ink(first.span, first.text);
    line.up = up;
    line.down = down;
    line.base = first.rest.top + (first.rest.height - m.ascent - m.descent) / 2 + m.ascent;
  }

  // Longer text: only the spaces widen, so a hyphenated word stays in one piece
  function spreadWords(line, space) {
    var spaces = 0;
    line.items.forEach(function (it, k) { if (k && !it.joined) spaces++; it.spaces = spaces; });
    var gap = Math.min(WORD_GAP * line.size, space / Math.max(1, spaces));
    line.items.forEach(function (it) { it.dx = it.spaces * gap; });
  }

  // One line of text, letter by letter. First pick the letters that get dimensioned and how (going
  // along, the next one is 1, 2 or 3 letters on), then spread the letters out: every gap widens by
  // the same amount, and a gap with a height in it gets the extra room the height needs. When the
  // line runs short of room the gaps shrink, then the last heights are left out.
  function spreadLetters(p, line, space) {
    var items = line.items, n = items.length, room = p.sheet.size.room;
    var allowed = p.o.rows || ['below', 'above'];
    var picks = [], used = []; // used[g]: a height sits in gap g, between letters g and g + 1 (g = n - 1: after the last)
    items.forEach(function (it) { it.ink = p.sheet.ink(it.span, it.text); });

    var every = p.o.every || EVERY;
    for (var k = p.o.dims ? n : Math.floor(Math.random() * Math.min(Math.max.apply(null, every), n)); k < n; k += pick(every)) {
      var ink = items[k].ink, last = picks[picks.length - 1];
      if (ink.left + ink.right < 3) continue; // dots and commas are too small
      if (p.o.noDims && items[k].span.closest(p.o.noDims)) continue;
      var beside = last && last.k === k - 1 && items[k].i === items[k - 1].i + 1; // right after it, same word
      // two widths side by side on the same row would run into each other
      var free = allowed.filter(function (r) { return !(beside && last.row === r); });
      var sides = [];
      if (ink.up + ink.down >= 5) {
        if (!used[k]) sides.push('right');
        if (k > 0 && !used[k - 1] && !beside) sides.push('left');
      }
      var c = { k: k };
      if (sides.length && (!free.length || Math.random() < HEIGHT_SHARE)) {
        c.side = pick(sides);
        used[c.side === 'right' ? k : k - 1] = true;
      } else if (free.length) {
        c.row = pick(free);
      } else {
        continue;
      }
      picks.push(c);
    }

    var nat = [], per = [];
    items.forEach(function (a, g) {
      var b = items[g + 1];
      nat[g] = b ? (b.rest.left - b.ink.left) - (a.rest.left + a.ink.right) : 0; // the gap between their ink now
      per[g] = b ? b.i - a.i : 0; // the usual widening counts twice across a space
    });
    function widen(g, gap) { return Math.max(gap * per[g], used[g] ? room - nat[g] : 0); }
    function total(gap) { var t = 0; for (var g = 0; g < n; g++) t += widen(g, gap); return t; }

    while (total(0) > space) { // not enough room for every height: leave out the last one
      var drop = picks.filter(function (c) { return c.side; }).pop();
      used[drop.side === 'right' ? drop.k : drop.k - 1] = false;
      picks.splice(picks.indexOf(drop), 1);
    }
    var gap = (p.o.gap || LETTER_GAP) * line.size;
    if (total(gap) > space) { // the widest gap that still fits
      var lo = 0, hi = gap;
      for (var t = 0; t < 16; t++) {
        gap = (lo + hi) / 2;
        if (total(gap) > space) hi = gap; else lo = gap;
      }
      gap = lo;
    }
    var x = 0;
    items.forEach(function (it, g) { it.dx = x; x += widen(g, gap); });
    line.picks = picks;
  }

  // How far down each line moves. In each section the lines move apart from the top down: every
  // gap between two lines widens a little, and a gap with a row of widths in it gets the room the
  // row needs. A section only spreads into LINE_ROOM of the empty space under it: when that's not
  // enough, rows of widths are left out (picked at random) until it is, then the little bit
  // everywhere shrinks. Anything following along moves with the lines beside it.
  function spreadDown(pieces, movers) {
    var groups = [], bodySize = parseFloat(getComputedStyle(document.body).fontSize);
    function add(el, row) {
      var host = el.closest(GROUP) || document.body;
      var g = groups.filter(function (x) { return x.el === host; })[0];
      if (!g) groups.push(g = { el: host, rows: [] });
      g.rows.push(row);
    }
    pieces.forEach(function (p) {
      if (p.o.still) return; // stays where it is
      var room = p.sheet.size.room;
      p.lines.forEach(function (line) {
        var sides = line.picks ? line.picks.map(function (c) { return c.row; }) : [line.row];
        add(p.el, {
          top: line.base - line.up, bottom: line.base + line.down, size: line.size,
          above: sides.indexOf('above') >= 0 ? room : 0, below: sides.indexOf('below') >= 0 ? room : 0,
          drop: function (side) {
            if (line.picks) line.picks = line.picks.filter(function (c) { return c.row !== side; });
            else if (line.row === side) line.row = null;
          },
          set: function (dy) { line.items.forEach(function (it) { it.dy = dy; }); }
        });
      });
    });
    movers.forEach(function (m) {
      add(m.el, {
        top: m.rect.top, bottom: m.rect.bottom, size: bodySize, above: 0, below: 0,
        drop: function () {}, set: function (dy) { m.dy = dy; }
      });
    });

    var boxes = groups.map(function (g) { return g.el.getBoundingClientRect(); });
    groups.forEach(function (g, k) {
      var box = boxes[k], next = Infinity; // the top of whatever comes next below it
      boxes.forEach(function (b) { if (b.top >= box.bottom - 1) next = Math.min(next, b.top); });
      var most = getComputedStyle(g.el).overflowY === 'visible' ? LINE_ROOM * (next - box.bottom) : 0;

      // lines side by side (overlapping from top to bottom) move together
      g.rows.sort(function (a, b) { return a.top - b.top; });
      var steps = [];
      g.rows.forEach(function (r) {
        var s = steps[steps.length - 1];
        if (s && r.top < s.bottom - 2) {
          s.rows.push(r);
          s.bottom = Math.max(s.bottom, r.bottom);
          s.size = Math.max(s.size, r.size);
          s.above = Math.max(s.above, r.above);
          s.below = Math.max(s.below, r.below);
        } else {
          steps.push({ top: r.top, bottom: r.bottom, size: r.size, above: r.above, below: r.below, rows: [r] });
        }
      });

      // how much the gap above step j widens (some = how much of the little bit everywhere, 0 to 1)
      function widen(j, some) {
        var a = steps[j - 1], b = steps[j];
        return Math.max(some * LINE_GAP * b.size, a.below + b.above - (b.top - a.bottom));
      }
      function total(some) { var t = 0; for (var j = 1; j < steps.length; j++) t += widen(j, some); return t; }

      while (total(0) > most) {
        var crowded = [];
        for (var j = 1; j < steps.length; j++) {
          if (widen(j, 0) > 0 && steps[j - 1].below + steps[j].above > 0) crowded.push(j);
        }
        if (!crowded.length) break;
        var at = pick(crowded), a = steps[at - 1], b = steps[at];
        var side = a.below && (!b.above || Math.random() < 0.5) ? 'below' : 'above';
        var s = side === 'below' ? a : b;
        s[side] = 0;
        s.rows.forEach(function (r) { r.drop(side); });
      }
      var some = 1;
      if (total(1) > most) { // the biggest share of the little bit everywhere that still fits
        var lo = 0, hi = 1;
        for (var t = 0; t < 16; t++) {
          some = (lo + hi) / 2;
          if (total(some) > most) hi = some; else lo = some;
        }
        some = lo;
      }
      var down = 0;
      steps.forEach(function (s, j) {
        if (j) down += widen(j, some);
        s.rows.forEach(function (r) { r.set(down); });
      });
    });
  }

  // Ink box of every letter or word where it now sits, and the rows above and below each line
  // where its widths go
  function measure(p) {
    var S = p.sheet, gap = S.size.row;
    p.left = S.host.getBoundingClientRect().left;
    p.edgeX = p.edge - p.left; // the far edge of its room, in the sheet's own px
    p.items.forEach(function (it) { it.box = S.box(it.span, it.text); });
    p.lines.forEach(function (line) {
      var base = line.items[0].box.base;
      line.below = base + line.down + gap;
      line.above = base - line.up - gap;
    });
    p.base = p.lines.length ? p.lines[0].items[0].box.base : 0;
  }

  // ----- The usual dimensions -----

  // One line of text: the letters picked while it spread out get their width above or below them,
  // or their height beside them, and now and then the whole line gets its height at the end
  function letterDims(p) {
    var S = p.sheet, out = [];
    p.lines.forEach(function (line) {
      var items = line.items, endTaken = false;
      line.picks.forEach(function (c) {
        var b = items[c.k].box;
        if (c.side) {
          var right = c.side === 'right', at = right ? b.r : b.l;
          var x = right ? b.r + S.size.beside : b.l - S.size.beside;
          if (right && c.k === items.length - 1) endTaken = true;
          out.push({ x: p.left + Math.max(x, b.r), draw: function () {
            S.vertical([at, b.top], [at, b.bottom], x, String(Math.round(b.bottom - b.top)));
          } });
        } else {
          var below = c.row === 'below', y = below ? line.below : line.above, edge = below ? b.bottom : b.top;
          out.push({ x: p.left + b.r, draw: function () {
            S.horizontal([b.l, edge], [b.r, edge], y, String(Math.round(b.r - b.l)));
          } });
        }
      });
      lineHeight(p, line, endTaken, out);
    });
    return out;
  }

  // Longer text: each line gets either every word dimensioned (its width, or now and then its height
  // where the gap after it has room) or one width across the whole line, on the side picked for it
  function wordDims(p) {
    var S = p.sheet, out = [];
    p.lines.forEach(function (line) {
      if (!line.row) return; // its row of widths was left out for lack of room
      var items = line.items, row = line.row, y = row === 'below' ? line.below : line.above;
      function edge(b) { return row === 'below' ? b.bottom : b.top; }
      if (line.whole) {
        var a = items[0].box, z = items[items.length - 1].box;
        out.push({ x: p.left + z.r, draw: function () {
          S.horizontal([a.l, edge(a)], [z.r, edge(z)], y, String(Math.round(z.r - a.l)));
        } });
        lineHeight(p, line, false, out);
        return;
      }
      var words = []; // a hyphenated word on one line still counts as one word
      items.forEach(function (it, k) {
        if (k && it.joined) words[words.length - 1].push(it);
        else words.push([it]);
      });
      words.forEach(function (w, j) {
        var a = w[0].box, z = w[w.length - 1].box;
        var next = words[j + 1] ? words[j + 1][0].box.l : p.edgeX;
        if (next - z.r >= S.size.room && Math.random() < WORD_HEIGHT_SHARE) {
          var top = Math.min.apply(null, w.map(function (it) { return it.box.top; }));
          var bottom = Math.max.apply(null, w.map(function (it) { return it.box.bottom; }));
          var x = z.r + S.size.beside;
          out.push({ x: p.left + x, draw: function () {
            S.vertical([z.r, top], [z.r, bottom], x, String(Math.round(bottom - top)));
          } });
        } else {
          out.push({ x: p.left + z.r, draw: function () {
            S.horizontal([a.l, edge(a)], [z.r, edge(z)], y, String(Math.round(z.r - a.l)));
          } });
        }
      });
    });
    return out;
  }

  // Now and then a line also gets its full height at its end, when there's room there
  function lineHeight(p, line, taken, out) {
    var S = p.sheet, items = line.items, last = items[items.length - 1].box;
    if (taken || p.edgeX - last.r < 40 || Math.random() >= LINE_HEIGHT_SHARE) return;
    var top = Math.min.apply(null, items.map(function (it) { return it.box.top; }));
    var bottom = Math.max.apply(null, items.map(function (it) { return it.box.bottom; }));
    var x = last.r + (p.fine ? 14 : 20);
    out.push({ x: p.left + x, draw: function () {
      S.vertical([last.r, top], [last.r, bottom], x, String(Math.round(bottom - top)));
    } });
  }

  return { start: start };
})();

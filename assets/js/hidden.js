// Hidden section, pulled up from the very bottom of the window.
// Nothing shows by default. Once you're at the bottom of the page, scrolling further pulls a
// red-orange-brown band up from the bottom edge (full window width), covered in "shh / shshsh /
// SHH" in mixed mono fonts and sizes. The higher it goes the harder it pulls; let go and it
// snaps all the way back the moment you stop. Pull it past 60% of the window's height and it
// opens into a panel (30% of the window tall): "traits I find memorable". Any scroll back up
// closes it again. Text comes from content/memorable.md.
(function () {
  'use strict';

  var shh = document.getElementById('shh');
  if (!shh) return;
  var band = shh.querySelector('.shh-strip');
  var tab = shh.querySelector('.shh-tab');
  var page = document.querySelector('.page');

  var OPEN_AT = 0.6;      // pull past this share of the window's height to open
  var SNAP_AFTER = 50;    // ms without scrolling before it snaps back

  // ----- The wall of "shh", shuffled differently on each visit -----
  var WORDS = ['sh', 'shh', 'shhh', 'shsh', 'shshsh', 'SHH', 'SH', 'shhhh', 'sHh', 'shshshsh'];
  var FONTS = ['"JetBrains Mono"', '"IBM Plex Mono"', '"Space Mono"', '"Courier Prime"'];
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  var wall = document.createDocumentFragment();
  for (var n = 0; n < 420; n++) {
    var w = document.createElement('span');
    w.className = 'shh-word';
    w.textContent = pick(WORDS);
    w.style.fontFamily = pick(FONTS) + ', ui-monospace, monospace';
    w.style.fontSize = Math.round(12 + Math.pow(Math.random(), 2.2) * 40) + 'px'; // mostly small, some big
    w.style.fontWeight = Math.random() < 0.3 ? 700 : 400;
    w.style.opacity = (0.45 + Math.random() * 0.55).toFixed(2);
    wall.appendChild(w);
  }
  band.appendChild(wall);

  // ----- Text for the panel -----
  Site.data.then(function (data) {
    var f = data.file('content/memorable.md');
    if (!f) return;
    tab.querySelector('.shh-title').textContent = f.meta.title || 'traits I find memorable';
    var ul = tab.querySelector('.shh-list');
    f.bullets.forEach(function (b) { ul.appendChild(Site.el('li', null, b)); });
  });

  // ----- Pulling -----
  // `raw` is how far you've scrolled past the bottom; the band's height grows from it but
  // levels off (like a spring), so each extra bit of scrolling moves it less.
  var raw = 0, isOpen = false, idle = null, touchY = null;

  function atBottom() {
    return window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 2;
  }
  function blocked() { return isOpen || document.documentElement.classList.contains('intro'); }

  function height() {
    var vh = window.innerHeight;
    var max = vh * 0.8;                       // it can never pass 80% of the window
    return max * (1 - Math.exp(-raw / (vh * 0.9)));
  }

  function render(animate) {
    var h = height();
    band.classList.toggle('settling', !!animate);
    page.classList.toggle('settling', !!animate);
    band.style.height = h + 'px';
    page.style.transform = h ? 'translateY(' + (-h) + 'px)' : '';
    if (h >= window.innerHeight * OPEN_AT) open();
  }

  function pull(amount) {
    raw = Math.max(0, raw + amount);
    render(false);
    clearTimeout(idle);
    idle = setTimeout(snapBack, SNAP_AFTER);
  }

  // Let go too early: it drops all the way back down
  function snapBack() {
    if (isOpen || touchY !== null) return;
    raw = 0;
    render(true);
  }

  // Mouse wheel / trackpad
  window.addEventListener('wheel', function (e) {
    if (isOpen && e.deltaY < 0) { close(); return; }
    if (blocked()) return;
    var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;   // some mice scroll in lines, not px
    if ((dy > 0 && atBottom()) || (dy < 0 && raw > 0)) {
      e.preventDefault();
      pull(dy);
    }
  }, { passive: false });

  // Phones: dragging up at the bottom of the page
  window.addEventListener('touchstart', function (e) { touchY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener('touchmove', function (e) {
    if (touchY === null || (blocked() && !isOpen)) return;
    var y = e.touches[0].clientY, dy = touchY - y;
    touchY = y;
    if (isOpen && dy < 0) { close(); return; }
    if ((dy > 0 && atBottom()) || (dy < 0 && raw > 0)) {
      e.preventDefault();
      pull(dy * 1.4);
    }
  }, { passive: false });
  window.addEventListener('touchend', function () {
    touchY = null;
    clearTimeout(idle);
    idle = setTimeout(snapBack, 0);
  }, { passive: true });

  // Keyboard: Down arrow, Page Down or Space at the bottom pull it too
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'ArrowUp' || e.key === 'PageUp') { close(); if (e.key === 'Escape') return; }
    if (blocked() || !atBottom()) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      pull(window.innerHeight * 0.25);
    }
  });

  function open() {
    if (isOpen) return;
    isOpen = true;
    clearTimeout(idle);
    raw = 0;
    band.classList.remove('settling');
    page.classList.remove('settling');
    band.style.height = '0px';
    page.style.transform = '';
    tab.hidden = false;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    lastY = window.scrollY;
  }

  // Any scroll back up closes it; then it has to be pulled all the way up again
  function close() {
    if (!isOpen) return;
    tab.hidden = true;
    isOpen = false;
  }

  // Also catches scrolling up with the scrollbar
  var lastY = 0;
  window.addEventListener('scroll', function () {
    if (isOpen && window.scrollY < lastY - 2) close();
    lastY = window.scrollY;
  }, { passive: true });
})();

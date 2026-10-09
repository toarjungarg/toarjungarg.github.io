// Shared code for every section:
// - loads site-data.json (the list of entries and photos Jekyll makes on every push)
// - builds photo/video galleries
// - the little "nothing there" shake
window.Site = (function () {
  'use strict';

  var IMAGE = /\.(jpe?g|png|webp|gif|avif)$/i;
  var VIDEO = /\.(mp4|webm|mov)$/i;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ----- Data -----

  var data = fetch('site-data.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (raw) {
      var entries = raw.entries.map(function (e) {
        var dir = e.path.replace(/[^/]+$/, '');               // "content/experience/midnight-sun/"
        var parts = dir.split('/');
        var doc = new DOMParser().parseFromString(e.html || '', 'text/html');
        return {
          path: e.path,
          dir: dir,
          section: parts.length > 3 ? parts[1] : '',          // "experience", "projects", or "" for files like songs.md
          slug: parts.length > 3 ? parts[2] : '',
          meta: e.meta || {},
          bullets: Array.prototype.map.call(doc.querySelectorAll('li'), function (li) { return li.innerHTML.trim(); }),
          paragraphs: Array.prototype.map.call(doc.querySelectorAll('p'), function (p) { return p.innerHTML.trim(); }),
          media: raw.files.filter(function (f) {
            return f.indexOf('/' + dir + 'photos/') === 0 && (IMAGE.test(f) || VIDEO.test(f));
          }).sort()
        };
      });
      return {
        entries: entries,
        section: function (name) {
          return entries.filter(function (e) { return e.section === name; })
            .sort(function (a, b) { return (a.meta.order || 99) - (b.meta.order || 99); });
        },
        file: function (path) {
          return entries.filter(function (e) { return e.path === path; })[0];
        }
      };
    });

  // Sections fill in after the page loads, so a link like /#projects needs a second jump once they have
  data.then(function () {
    setTimeout(function () {
      var target = location.hash && document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView({ behavior: 'instant' });
    }, 60);
  });

  // ----- Small helpers -----

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function dates(meta) {
    var s = meta.start || meta.period || '';
    return meta.end ? s + ' – ' + meta.end : s;
  }

  // Shake an arrow (and buzz the phone) when there's nothing in that direction
  function shake(node) {
    node.classList.remove('shake');
    void node.offsetWidth;
    node.classList.add('shake');
    if (navigator.vibrate) navigator.vibrate(40);
  }

  // ----- Gallery: cycles by itself, arrows show on hover -----

  function gallery(media, alt) {
    if (!media.length) return null;
    var box = el('div', 'gallery');
    var slides = media.map(function (src, i) {
      var s;
      if (VIDEO.test(src)) {
        s = el('video', 'slide');
        s.muted = true;
        s.loop = true;
        s.playsInline = true;
        s.preload = 'metadata';
        s.src = src;
      } else {
        s = el('img', 'slide');
        s.src = src;
        s.alt = alt + ' (photo ' + (i + 1) + ')';
        s.loading = 'lazy';
      }
      box.appendChild(s);
      return s;
    });
    var count = el('span', 'gcount');
    box.appendChild(count);

    var i = 0, timer = null, paused = false;
    function show(n) {
      slides[i].classList.remove('on');
      if (slides[i].pause) slides[i].pause();
      i = (n + slides.length) % slides.length;
      slides[i].classList.add('on');
      if (slides[i].play) slides[i].play().catch(function () {});
      count.textContent = slides.length > 1 ? (i + 1) + '/' + slides.length : '';
    }
    function tick() {
      clearTimeout(timer);
      if (slides.length < 2 || reduced) return;
      // only moves while it's on the page (hidden entries wait) and not hovered
      timer = setTimeout(function () { if (!paused && box.isConnected) show(i + 1); tick(); }, 4000);
    }

    if (slides.length > 1) {
      var prev = el('button', 'gbtn prev', '&lt;');
      var next = el('button', 'gbtn next', '&gt;');
      prev.type = next.type = 'button';
      prev.setAttribute('aria-label', 'Previous photo');
      next.setAttribute('aria-label', 'Next photo');
      prev.addEventListener('click', function () { show(i - 1); tick(); });
      next.addEventListener('click', function () { show(i + 1); tick(); });
      box.appendChild(prev);
      box.appendChild(next);
      box.addEventListener('mouseenter', function () { paused = true; });
      box.addEventListener('mouseleave', function () { paused = false; });
    }
    show(0);
    tick();
    return box;
  }

  return { data: data, el: el, dates: dates, shake: shake, gallery: gallery, reduced: reduced };
})();

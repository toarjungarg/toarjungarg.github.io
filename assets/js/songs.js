// Top 10 Songs: shows the Spotify playlist named in content/songs.md,
// with the "updated" date in the heading.
(function () {
  'use strict';

  var mount = document.getElementById('songs-list');
  if (!mount) return;

  Site.data.then(function (data) {
    var f = data.file('content/songs.md');
    if (!f) return;
    var m = f.meta;
    var stamp = document.getElementById('songs-updated');
    if (stamp && m.updated) stamp.textContent = '(updated ' + m.updated + (m.note ? ', ' + m.note : '') + ')';

    if (m.spotify_playlist) {
      var frame = document.createElement('iframe');
      frame.className = 'spotify';
      frame.src = 'https://open.spotify.com/embed/playlist/' + encodeURIComponent(m.spotify_playlist) + '?theme=0';
      frame.title = 'My top 10 songs on Spotify';
      frame.loading = 'lazy';
      frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
      mount.appendChild(frame);
    }
  });
})();

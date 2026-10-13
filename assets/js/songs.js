// Top 10 Songs: each song's album cover with its name and artist beside it, in two columns of 5
// (one column on phones). Clicking a song opens it on Spotify. Everything comes from
// content/songs.md (covers in content/songs/covers/), with the "updated" date in the heading.
// If songs.md has no song list, the Spotify playlist player shows instead.
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

    if (m.songs && m.songs.length) {
      var list = Site.el('ol', 'song-grid');
      m.songs.forEach(function (s) {
        var a = Site.link(s.link, 'song');
        var img = Site.el('img', 'song-cover');
        img.src = 'content/songs/covers/' + encodeURIComponent(s.cover);
        img.alt = '';
        img.loading = 'lazy';
        var text = Site.el('span', 'song-text');
        var title = Site.el('span', 'song-title');
        title.textContent = s.title;
        var artist = Site.el('span', 'song-artist');
        artist.textContent = s.artist;
        text.appendChild(title);
        text.appendChild(artist);
        a.appendChild(img);
        a.appendChild(text);
        var li = Site.el('li');
        li.appendChild(a);
        list.appendChild(li);
      });
      mount.appendChild(list);
    } else if (m.spotify_playlist) {
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

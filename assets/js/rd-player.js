/* EG Studio shared quiet player.
   No native chrome until the visitor chooses to play; one player at a time.
   Markup: <figure|article class="rd-sample"><video class="rd-player" playsinline preload="metadata" poster>
           <button class="rd-play"><img><span></span></button> ... */
(function () {
  function init() {
    var vids = Array.prototype.slice.call(document.querySelectorAll('.rd-sample video, .rd-hero-video, video.rd-player'));
    vids = vids.filter(function (v, i) { return vids.indexOf(v) === i; });
    /* Overlay is hidden with an inline style so no page stylesheet can keep it over a playing video. */
    function overlay(v, show) {
      var b = v.parentElement && v.parentElement.querySelector('.rd-play');
      if (b) b.style.display = show ? '' : 'none';
    }
    /* Custom start failed or stalled: hand the visitor native controls instead. */
    function fallback(v, why) {
      console.warn('EG sample playback fallback (' + why + '):', v.currentSrc || v.src);
      v._rdNative = true;
      v.controls = true;
      overlay(v, false);
    }
    vids.forEach(function (v) {
      v.playsInline = true;
      v.setAttribute('webkit-playsinline', '');
      v.addEventListener('play', function () {
        var card = v.closest('.rd-sample') || v.parentElement;
        if (card) card.classList.add('is-playing');
        v.controls = true;
        overlay(v, false);
        vids.forEach(function (o) { if (o !== v && !o.paused) o.pause(); });
      });
      v.addEventListener('playing', function () { clearTimeout(v._rdStall); });
      v.addEventListener('pause', function () {
        clearTimeout(v._rdStall);
        if (v.ended) return;
        var card = v.closest('.rd-sample') || v.parentElement;
        if (card) card.classList.remove('is-playing');
        if (!v._rdNative) overlay(v, true);
      });
      v.addEventListener('ended', function () {
        var card = v.closest('.rd-sample') || v.parentElement;
        if (card) card.classList.remove('is-playing');
        if (v._rdNative) return;
        v.controls = false;
        overlay(v, true);
      });
      v.addEventListener('error', function () { clearTimeout(v._rdStall); fallback(v, 'media error'); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.rd-play'), function (btn) {
      var v = btn.parentElement.querySelector('video');
      if (!v) return;
      btn.addEventListener('click', function () {
        /* play() must run synchronously inside the tap so iOS Safari keeps the user gesture. */
        var p = v.play();
        clearTimeout(v._rdStall);
        v._rdStall = setTimeout(function () { if (v.paused || v.readyState < 3) fallback(v, 'stalled'); }, 6000);
        if (p && p.catch) p.catch(function (err) {
          clearTimeout(v._rdStall);
          /* AbortError = interrupted by pause() (e.g. visitor switched samples); not a failure. */
          if (err && err.name === 'AbortError') { console.warn('EG sample play() interrupted:', v.currentSrc || v.src); return; }
          fallback(v, err && err.name || 'play() rejected');
        });
      });
    });
    /* Optional mobile carousel dots for satellite pages (homepage keeps its own inline handler) */
    Array.prototype.forEach.call(document.querySelectorAll('[data-rd-carousel]'), function (track) {
      var dotsWrap = track.parentElement.querySelector('.rd-dots');
      if (!dotsWrap) return;
      var dots = Array.prototype.slice.call(dotsWrap.querySelectorAll('.rd-dot'));
      var cards = Array.prototype.slice.call(track.querySelectorAll('.rd-sample'));
      dots.forEach(function (d, i) {
        d.addEventListener('click', function () {
          track.scrollTo({ left: cards[i].offsetLeft - track.offsetLeft, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        });
      });
      var t;
      track.addEventListener('scroll', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          var idx = Math.round(track.scrollLeft / (cards[0].offsetWidth || 1));
          dots.forEach(function (d, i) { d.toggleAttribute('aria-current', i === Math.min(idx, dots.length - 1)); });
        }, 60);
      }, { passive: true });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

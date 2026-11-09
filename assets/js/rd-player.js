/* EG Studio shared quiet player.
   No native chrome until the visitor chooses to play; one player at a time.
   Markup: <figure|article class="rd-sample"><video class="rd-player" playsinline preload="metadata" poster>
           <button class="rd-play"><img><span></span></button> ... */
(function () {
  function init() {
    var vids = Array.prototype.slice.call(document.querySelectorAll('.rd-sample video, .rd-hero-video, video.rd-player'));
    vids = vids.filter(function (v, i) { return vids.indexOf(v) === i; });
    vids.forEach(function (v) {
      v.addEventListener('play', function () {
        var card = v.closest('.rd-sample') || v.parentElement;
        if (card) card.classList.add('is-playing');
        v.controls = true;
        vids.forEach(function (o) { if (o !== v && !o.paused) o.pause(); });
      });
      v.addEventListener('pause', function () {
        if (v.ended) return;
        var card = v.closest('.rd-sample') || v.parentElement;
        if (card) card.classList.remove('is-playing');
      });
      v.addEventListener('ended', function () {
        v.controls = false;
        var card = v.closest('.rd-sample') || v.parentElement;
        if (card) card.classList.remove('is-playing');
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.rd-play'), function (btn) {
      var v = btn.parentElement.querySelector('video');
      if (!v) return;
      btn.addEventListener('click', function () {
        var p = v.play(); if (p && p.catch) p.catch(function () {});
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

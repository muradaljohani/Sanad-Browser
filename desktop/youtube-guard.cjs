'use strict';
const YOUTUBE_STYLES = 'ytd-ad-slot-renderer,ytd-display-ad-renderer,ytd-promoted-sparkles-web-renderer,ytd-promoted-video-renderer,ytd-in-feed-ad-layout-renderer,ytd-banner-promo-renderer,#player-ads,.ytp-ad-overlay-container{display:none!important}';
function isYouTube(raw) { try { const u = new URL(raw); return u.protocol === 'https:' && (u.hostname === 'youtube.com' || u.hostname.endsWith('.youtube.com')); } catch { return false; } }
/** Original fixed code in an isolated sandboxed world. No downloaded scriptlets, Node or IPC. */
function pageGuard(enabled) {
  const key = '__sanadYoutubeGuardV1';
  if (window[key]) { window[key].setEnabled(enabled); return; }
  let observer, discovery, timer = null, due = Infinity, stopped = true, player = null, media = null, previous = null;
  const restore = () => {
    try { if (media && previous) { media.muted = previous.muted; media.playbackRate = previous.rate; } } catch {}
    media = previous = null;
  };
  const isAd = () => player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'));
  const schedule = (delay = 16) => {
    if (stopped) return;
    const next = Date.now() + delay;
    if (timer !== null && due <= next) return;
    if (timer !== null) clearTimeout(timer);
    due = next; timer = setTimeout(run, delay);
  };
  const bindPlayer = () => {
    const next = document.querySelector('#movie_player');
    if (next === player && player) return;
    observer?.disconnect(); restore(); player = next;
    if (!player) {
      discovery ||= new MutationObserver(() => schedule());
      discovery.observe(document.documentElement, { childList: true, subtree: true });
      return;
    }
    discovery?.disconnect();
    // Observe the player only; comments, recommendations and unrelated class changes are idle.
    observer = new MutationObserver(() => schedule());
    observer.observe(player, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled', 'aria-disabled', 'hidden', 'style'] });
  };
  function run() {
    timer = null; due = Infinity; if (stopped) return;
    bindPlayer();
    if (!isAd()) { restore(); return; }
    const skip = player.querySelector('.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button,.ytp-ad-skip-button-v2,.ytp-ad-skip-button-container button');
    if (skip && !skip.disabled && !skip.hidden && skip.getAttribute?.('aria-disabled') !== 'true' && skip.getClientRects().length && (!skip.checkVisibility || skip.checkVisibility())) {
      skip.click();
      if (!isAd()) restore(); else schedule(200);
      return;
    }
    const video = player.querySelector('video');
    if (video) {
      if (media !== video) { restore(); media = video; previous = { muted: video.muted, rate: video.playbackRate, source: video.currentSrc, sought: false }; }
      if (previous.source !== video.currentSrc) { previous.source = video.currentSrc; previous.sought = false; }
      video.muted = true;
      try {
        video.playbackRate = 16;
        if (!previous.sought && Number.isFinite(video.duration) && video.duration > 0 && video.duration < 180) {
          video.currentTime = Math.max(video.currentTime, video.duration - .05); previous.sought = true;
        }
      } catch {}
    }
    // Retry only during a positively identified ad. Ordinary video has no polling timer.
    schedule(200);
  }
  const navigate = () => schedule(0);
  window[key] = { setEnabled(value) {
    if (value === true && !stopped) { schedule(0); return; }
    stopped = value !== true;
    if (timer !== null) clearTimeout(timer);
    timer = null; due = Infinity; observer?.disconnect(); discovery?.disconnect(); player = null;
    document.removeEventListener('yt-navigate-finish', navigate);
    if (stopped) { restore(); return; }
    document.addEventListener('yt-navigate-finish', navigate); run();
  } };
  window[key].setEnabled(enabled);
  window.addEventListener('pagehide', () => window[key].setEnabled(false), { once: true });
}
const youtubeGuardScript = enabled => `(${pageGuard.toString()})(${enabled === true})`;
module.exports = { YOUTUBE_STYLES, isYouTube, youtubeGuardScript };

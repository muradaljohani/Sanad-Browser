'use strict';
const YOUTUBE_STYLES = 'ytd-ad-slot-renderer,ytd-display-ad-renderer,ytd-promoted-sparkles-web-renderer,ytd-promoted-video-renderer,ytd-in-feed-ad-layout-renderer,ytd-banner-promo-renderer,#player-ads,.ytp-ad-overlay-container{display:none!important}';
function isYouTube(raw) { try { const u = new URL(raw); return u.protocol === 'https:' && (u.hostname === 'youtube.com' || u.hostname.endsWith('.youtube.com')); } catch { return false; } }
/** Runs only in an isolated, sandboxed page world. No Node, IPC or remote code.
 * Skip controls and positive ad-player state are best effort, never a promise
 * about every current/future YouTube ad delivery mechanism.
 */
function pageGuard(enabled) {
  const key = '__sanadYoutubeGuardV1';
  if (window[key]) { window[key].setEnabled(enabled); return; }
  let observer, timer, stopped = true, media = null, previous = null;
  const restore = () => { if (media && previous) { media.muted = previous.muted; media.playbackRate = previous.rate; } media = previous = null; };
  const run = () => {
    timer = null; if (stopped) return;
    const player = document.querySelector('#movie_player');
    const ad = player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'));
    if (!ad) { restore(); return; }
    const video = player.querySelector('video');
    if (video) {
      if (media !== video) { restore(); media = video; previous = { muted: video.muted, rate: video.playbackRate }; }
      video.muted = true;
      try { video.playbackRate = 16; if (Number.isFinite(video.duration) && video.duration > 0 && video.duration < 180) video.currentTime = Math.max(video.currentTime, video.duration - .05); } catch {}
    }
    const skip = player.querySelector('.ytp-ad-skip-button,.ytp-ad-skip-button-modern,button.ytp-skip-ad-button');
    if (skip && !skip.disabled && skip.getClientRects().length) skip.click();
  };
  const schedule = () => { if (!stopped && !timer) timer = setTimeout(run, 100); };
  window[key] = { setEnabled(value) { stopped = !value; clearTimeout(timer); timer = null; observer?.disconnect(); if (stopped) { restore(); return; } observer = new MutationObserver(schedule); observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); run(); } };
  window[key].setEnabled(enabled);
  window.addEventListener('pagehide', () => window[key].setEnabled(false), { once: true });
}
const youtubeGuardScript = enabled => `(${pageGuard.toString()})(${enabled === true})`;
module.exports = { YOUTUBE_STYLES, isYouTube, youtubeGuardScript };

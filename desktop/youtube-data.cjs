'use strict';
// Original, packaged page code. It receives only a boolean, never Node, IPC or list code.
function youtubeDataGuard(value) {
  if (location.protocol !== 'https:' || !(location.hostname === 'youtube.com' || location.hostname.endsWith('.youtube.com'))) return;
  const key = '__sanadYoutubeDataV1';
  if (typeof window[key]?.setEnabled === 'function') { window[key].setEnabled(value); return; }
  const define = Object.defineProperty, descriptor = Object.getOwnPropertyDescriptor;
  const parse = JSON.parse, stringify = JSON.stringify, apply = Reflect.apply;
  const adKeys = ['adPlacements', 'adSlots', 'playerAds'];
  let enabled = false, undo = [];
  // Visit only documented player envelopes, not arbitrary recommendations or media data.
  function prune(data, depth = 0) {
    if (!enabled || !data || typeof data !== 'object' || depth > 3) return data;
    if (Array.isArray(data)) { for (const item of data.slice(0, 1000)) prune(item, depth + 1); return data; }
    for (const name of adKeys) { try { delete data[name]; } catch {} }
    if (data.playerResponse) prune(data.playerResponse, depth + 1);
    if (data.response) prune(data.response, depth + 1);
    for (const name of ['entries', 'reelWatchSequenceResponse']) {
      if (name === 'entries' && Array.isArray(data.entries)) {
        data.entries = data.entries.filter(item => item?.command?.reelWatchEndpoint?.adClientParams?.isAd !== true);
      } else if (data[name]) prune(data[name], depth + 1);
    }
    return data;
  }
  function cleanText(text) {
    if (!enabled || typeof text !== 'string' || text.length > 8_000_000 || !/"(?:adPlacements|adSlots|playerAds|adClientParams)"/.test(text)) return text;
    // Preserve the optional anti-XSSI prefix and malformed/non-JSON responses verbatim.
    const prefix = text.startsWith(")]}'") ? text.slice(0, text.indexOf('\n') + 1) : '';
    try { return prefix + stringify(prune(parse(text.slice(prefix.length)))); } catch { return text; }
  }
  function target(raw) {
    try {
      const url = new URL(typeof raw === 'string' || raw instanceof URL ? raw : raw.url, location.href);
      return url.origin === location.origin && (/^\/youtubei\/v1\/(?:player|next|get_watch|reel\/reel_watch_sequence)\/?$/.test(url.pathname) || ['/watch', '/playlist', '/get_video_info'].includes(url.pathname));
    } catch { return false; }
  }
  function replace(object, name, replacement) {
    const old = descriptor(object, name);
    if (old && (!old.configurable || !('value' in old))) return;
    try {
      define(object, name, { configurable: true, writable: true, enumerable: old?.enumerable ?? false, value: replacement });
      undo.push(() => { if (object[name] !== replacement) return; if (old) define(object, name, old); else delete object[name]; });
    } catch {}
  }
  function install() {
    const old = descriptor(window, 'ytInitialPlayerResponse');
    if (!old || (old.configurable && 'value' in old)) {
      let current = prune(old?.value);
      const get = () => current, set = data => { current = prune(data); };
      try {
        define(window, 'ytInitialPlayerResponse', { configurable: true, enumerable: old?.enumerable ?? true, get, set });
        undo.push(() => { if (descriptor(window, 'ytInitialPlayerResponse')?.get === get) define(window, 'ytInitialPlayerResponse', old ? { ...old, value: current } : { configurable: true, enumerable: true, writable: true, value: current }); });
      } catch {}
    }
    const response = window.Response?.prototype;
    if (response && typeof window.fetch === 'function') {
      const nativeFetch = window.fetch, json = response.json, text = response.text, clone = response.clone;
      const wrapped = new WeakSet();
      function wrap(result) {
        if (!result || wrapped.has(result)) return result;
        wrapped.add(result);
        // Keep the original Response, stream, status, headers, URL and bodyUsed semantics.
        try {
          define(result, 'json', { configurable: true, value: function (...args) { return apply(json, this, args).then(data => prune(data)); } });
          define(result, 'text', { configurable: true, value: function (...args) { return apply(text, this, args).then(cleanText); } });
          define(result, 'clone', { configurable: true, value: function (...args) { return wrap(apply(clone, this, args)); } });
        } catch {}
        return result;
      }
      replace(window, 'fetch', function (...args) {
        const result = apply(nativeFetch, this, args);
        return enabled && target(args[0]) ? result.then(wrap) : result;
      });
    }
    const xhr = window.XMLHttpRequest?.prototype;
    if (xhr && typeof xhr.open === 'function') {
      const open = xhr.open, tracked = new WeakMap();
      replace(xhr, 'open', function (...args) { const result = apply(open, this, args); tracked.set(this, { target: target(args[1]) }); return result; });
      for (const name of ['response', 'responseText']) {
        const old = descriptor(xhr, name);
        if (!old?.get || !old.configurable) continue;
        const get = function () {
          const data = apply(old.get, this, []), state = tracked.get(this);
          if (!enabled || !state?.target || this.readyState !== 4) return data;
          if (typeof data !== 'string') return this.responseType === 'json' ? prune(data) : data;
          if (state.raw !== data) { state.raw = data; state.cleaned = cleanText(data); }
          return state.cleaned;
        };
        try {
          define(xhr, name, { ...old, get });
          undo.push(() => { if (descriptor(xhr, name)?.get === get) define(xhr, name, old); });
        } catch {}
      }
    }
  }
  const control = Object.freeze({ setEnabled(next) {
    if ((next === true) === enabled) return;
    enabled = next === true;
    if (enabled) install();
    else { for (const restore of undo.reverse()) { try { restore(); } catch {} } undo = []; }
  } });
  define(window, key, { configurable: true, value: control });
  control.setEnabled(value);
}
const youtubeDataScript = enabled => `(${youtubeDataGuard.toString()})(${enabled === true})`;
module.exports = { youtubeDataScript };

'use strict';
const HOME = 'https://ip-murad.com/browser?surface=desktop';
const MAX_TABS = 32;
const TRACKING_KEYS = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid)$/i;
function safeURL(value, testMode = false) {
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (url.protocol !== 'https:' && !(testMode && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) return null;
    return url.href;
  } catch { return null; }
}
function resolveDestination(raw, testMode = false) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().slice(0, 2000);
  if (!text || ['sanad://newtab', 'sanad://home'].includes(text)) return { url: HOME };
  if (['chrome://credits', 'chrome://credits/', 'chrome://version', 'sanad://credits'].includes(text)) return { panel: 'about' };
  if (/^(?:javascript|data|file|blob|vbscript|about|chrome|sanad|ftp|http):/i.test(text) && !safeURL(text, testMode)) return null;
  if (/^https?:\/\//i.test(text)) { const url = safeURL(text, testMode); return url ? { url } : null; }
  // Dot-separated labels must not consume their own separator (exponential backtracking).
  if (/^(?:[^\s/:?#@.]+\.)+[^\s/:?#@.]+\.?(?::\d+)?(?:[/?#].*)?$/.test(text) || (testMode && /^localhost:\d+/.test(text))) {
    const url = safeURL(`${testMode && text.startsWith('localhost:') ? 'http' : 'https'}://${text}`, testMode);
    return url ? { url } : null;
  }
  return { url: `https://ip-murad.com/browser?${new URLSearchParams({ surface: 'desktop', q: text.slice(0, 300) })}` };
}
function cleanURL(raw) {
  const url = safeURL(raw);
  if (!url) return null;
  const parsed = new URL(url);
  for (const key of [...parsed.searchParams.keys()]) if (TRACKING_KEYS.test(key)) parsed.searchParams.delete(key);
  if (parsed.hostname === 'ip-murad.com' && parsed.pathname === '/browser') { parsed.searchParams.delete('surface'); if (parsed.searchParams.get('mode') === 'private') parsed.searchParams.delete('mode'); }
  return parsed.href;
}
function nativeSiteURL(raw, isPrivate = false, testMode = false) {
  const safe = safeURL(raw, testMode); if (!safe) return null;
  const url = new URL(safe);
  if (url.hostname === 'ip-murad.com' && url.pathname === '/browser') {
    url.searchParams.set('surface', 'desktop');
    if (isPrivate) url.searchParams.set('mode', 'private'); else if (url.searchParams.get('mode') === 'private') url.searchParams.delete('mode');
  }
  return url.href;
}
function mayRemember(raw, testMode = false) {
  const safe = safeURL(raw, testMode);
  if (!safe) return false;
  const url = new URL(safe);
  if (/\/(?:oauth|callback|sign-in|sign-out|signin|signout)(?:\/|$)|\/__\/auth\//i.test(url.pathname)) return false;
  return ![...url.searchParams.keys(), ...new URLSearchParams(url.hash.slice(1)).keys()].some(key => /^(?:code|access_token|id_token|refresh_token|token|state)$/i.test(key));
}
function sanitizeBookmarks(value) {
  const entries = Array.isArray(value) ? value : value?.bookmarks;
  if (!Array.isArray(entries)) throw new Error('صيغة ملف المفضلة غير صحيحة.');
  const seen = new Set();
  return entries.slice(0, 1000).flatMap(entry => {
    const url = entry && safeURL(entry.url);
    if (!url || !mayRemember(url) || seen.has(url)) return [];
    seen.add(url);
    return [{ url, title: typeof entry.title === 'string' ? entry.title.trim().slice(0, 200) || new URL(url).hostname : new URL(url).hostname }];
  });
}
function trustedSender(event, contents) {
  return Boolean(contents && !contents.isDestroyed() && event.sender === contents && event.senderFrame === contents.mainFrame && event.senderFrame?.url === 'sanad-app://browser/index.html');
}
module.exports = { HOME, MAX_TABS, safeURL, resolveDestination, cleanURL, nativeSiteURL, mayRemember, sanitizeBookmarks, trustedSender };



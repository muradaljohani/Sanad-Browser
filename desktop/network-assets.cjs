'use strict';
const { safeURL } = require('./policy.cjs');
async function boundedResponse(fetchImpl, url, options = {}, limit = 65536, timeout = 1200) {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
  const response = await fetchImpl(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error', ...options, signal });
  if (!response.ok || Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('Asset unavailable'); }
  const reader = response.body?.getReader(); if (!reader) throw new Error('Missing asset body');
  const chunks = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) throw new Error('Asset too large'); chunks.push(Buffer.from(value)); } }
  catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  return { data: Buffer.concat(chunks, size), mime: (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() };
}
async function faviconAsset(fetchImpl, raw, signal, testMode = false) {
  const url = safeURL(raw, testMode); if (!url) return null;
  try {
    const value = await boundedResponse(fetchImpl, url, { signal, headers: { Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8' } }, 32768, 1800);
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/svg+xml', 'image/avif'].includes(value.mime)) return null;
    if (value.mime === 'image/png' && value.data.length >= 24 && (value.data.readUInt32BE(16) > 512 || value.data.readUInt32BE(20) > 512)) return null;
    return value;
  } catch { return null; }
}
async function omniboxSuggestions(fetchImpl, raw, preferences, privateMode, signal) {
  const q = typeof raw === 'string' ? raw.trim().slice(0, 200) : '';
  if (privateMode || preferences.remoteSuggestions === false || q.length < 2 || /[:/.@]/.test(q)) return [];
  try {
    const value = await boundedResponse(fetchImpl, 'https://sanadbrowser.com/api/browser/suggest', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Origin: 'https://sanadbrowser.com', 'Sec-Fetch-Site': 'same-origin' }, body: JSON.stringify({ q, safeSearch: 'strict' }) }, 65536, 1200);
    const data = JSON.parse(value.data.toString('utf8'));
    return Array.isArray(data?.suggestions) ? [...new Set(data.suggestions.filter(item => typeof item === 'string').map(item => item.trim().slice(0, 300)).filter(Boolean))].slice(0, 8) : [];
  } catch { return []; }
}
module.exports = { boundedResponse, faviconAsset, omniboxSuggestions };

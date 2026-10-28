'use strict';
const UPDATE_FEED = 'https://ip-murad.com/browser/desktop-release.json';
const RELEASE_BASE = 'https://github.com/muradaljohani/Browser/releases/tag/desktop-v';
const DOWNLOAD_PAGE = 'https://ip-murad.com/browser/download/';
const VERSION = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;
function compareVersions(a, b) {
  if (!VERSION.test(a) || !VERSION.test(b)) throw new Error('Invalid release version');
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
function parseRelease(value) {
  if (!value || value.schema !== 1 || value.channel !== 'preview' || typeof value.version !== 'string' || !VERSION.test(value.version) || value.installation !== 'manual') throw new Error('Invalid release feed');
  const releaseUrl = RELEASE_BASE + value.version;
  if (value.releaseUrl !== releaseUrl) throw new Error('Unexpected release destination');
  if (value.downloadPage !== undefined && value.downloadPage !== DOWNLOAD_PAGE) throw new Error('Unexpected download page');
  return { version: value.version, releaseUrl: value.downloadPage || releaseUrl, notes: (Array.isArray(value.notes) ? value.notes : []).filter(note => typeof note === 'string').slice(0, 6).map(note => note.slice(0, 300)) };
}
async function readBoundedJson(response) {
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json') || Number(response.headers.get('content-length') || 0) > 32768) throw new Error('Release feed unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty release feed');
  const parts = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 32768) { await reader.cancel(); throw new Error('Release feed too large'); }
      parts.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
function createUpdateChecker({ version, feedURL = UPDATE_FEED, fetchImpl = fetch, now = Date.now, changed = () => {} }) {
  compareVersions(version, version);
  let state = { status: 'idle', latestVersion: null, checkedAt: null, releaseUrl: null, notes: [], installation: 'manual' };
  let pending, lastAttempt = 0;
  const check = ({ automatic = false } = {}) => {
    if (pending) return pending;
    if (automatic && lastAttempt && now() - lastAttempt < 15 * 60 * 1000) return Promise.resolve({ ...state });
    lastAttempt = now(); state = { ...state, status: 'checking', releaseUrl: null }; changed();
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
    pending = Promise.resolve().then(async () => {
      try {
        // A fixed first-party manifest. No cookies, account IDs, telemetry or
        // version-bearing query string. Never download or execute an installer.
        const response = await fetchImpl(feedURL, { signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store', headers: { accept: 'application/json' } });
        const release = parseRelease(await readBoundedJson(response));
        const comparison = compareVersions(release.version, version);
        state = { ...state, status: comparison > 0 ? 'available' : comparison < 0 ? 'ahead' : 'current', latestVersion: release.version, releaseUrl: release.releaseUrl, notes: release.notes, checkedAt: now() };
      } catch {
        state = { ...state, status: 'error', releaseUrl: null };
      } finally { clearTimeout(timer); pending = null; changed(); }
      return { ...state };
    });
    return pending;
  };
  return { check, snapshot: () => ({ ...state }) };
}
module.exports = { UPDATE_FEED, compareVersions, parseRelease, createUpdateChecker };


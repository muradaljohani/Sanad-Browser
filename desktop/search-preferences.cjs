'use strict';
const DEFAULT_SEARCH_PREFERENCES = Object.freeze({ language: 'auto', country: 'auto', safeSearch: 'strict', personalize: true, saveHistory: true, remoteSuggestions: true, cacheResults: true, dataSaver: false, imagePreviews: false, theme: 'dark', zoom: 1 });
function normalizeSearchPreferences(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const flags = {};
  for (const key of ['personalize', 'saveHistory', 'remoteSuggestions', 'cacheResults', 'dataSaver', 'imagePreviews']) flags[key] = typeof value[key] === 'boolean' ? value[key] : DEFAULT_SEARCH_PREFERENCES[key];
  return { language: ['auto', 'ar', 'en', 'fr', 'de', 'tr', 'ur', 'id'].includes(value.language) ? value.language : 'auto', country: ['auto', 'sa', 'ae', 'eg', 'kw', 'qa', 'us', 'gb', 'tr', 'id'].includes(value.country) ? value.country : 'auto', safeSearch: 'strict', ...flags, theme: value.theme === 'light' ? 'light' : 'dark', zoom: [1, 1.15, 1.3].includes(value.zoom) ? value.zoom : 1 };
}
function officialSearchPage(raw) {
  try { const url = new URL(raw); return url.origin === 'https://sanadbrowser.com' && !url.username && !url.password && ['/web', '/web/'].includes(url.pathname); } catch { return false; }
}
function searchPreferenceScript(preferences, action = 'sync') {
  const clean = normalizeSearchPreferences(preferences);
  const type = ['sync', 'clear-history', 'clear-cache'].includes(action) ? action : 'sync';
  // One-way, bounded preference data only. No website receives a native API.
  return `(() => { const preferences = ${JSON.stringify(clean)}; let meta = document.querySelector('meta[name="sanad-native-preferences"]'); if (!meta) { meta = document.createElement('meta'); meta.name = 'sanad-native-preferences'; document.head.append(meta); } meta.content = JSON.stringify(preferences); window.dispatchEvent(new CustomEvent('sanad-native-preferences', { detail: JSON.stringify({ preferences, action: ${JSON.stringify(type)} }) })); })()`;
}
module.exports = { DEFAULT_SEARCH_PREFERENCES, normalizeSearchPreferences, officialSearchPage, searchPreferenceScript };

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeSearchPreferences, officialSearchPage, searchPreferenceScript } = require('../search-preferences.cjs');
const { openStore } = require('../store.cjs');
test('native preferences preserve shared controls and cannot lower strict search or retain arbitrary fields', () => {
  const result = normalizeSearchPreferences({ language: 'ar', country: 'sa', saveHistory: false, remoteSuggestions: false, cacheResults: false, dataSaver: true, imagePreviews: true, theme: 'light', zoom: 1.15, safeSearch: 'off', protection: false, proxy: 'evil', injected: '</script>' });
  assert.equal(result.safeSearch, 'strict'); assert.equal(result.language, 'ar'); assert.equal(result.country, 'sa');
  assert.equal(result.saveHistory, false); assert.equal(result.remoteSuggestions, false); assert.equal(result.dataSaver, true); assert.equal(result.zoom, 1.15);
  assert.equal(result.proxy, undefined); assert.equal(result.protection, undefined); assert.equal(result.injected, undefined);
  assert.equal(normalizeSearchPreferences({ language: 'evil', country: {}, zoom: 999 }).zoom, 1);
});
test('only the official search document receives bounded one-way data without native or Node APIs', () => {
  for (const url of ['https://sanadbrowser.com/web/', 'https://sanadbrowser.com/web?q=x']) assert.equal(officialSearchPage(url), true);
  for (const url of ['https://sanadbrowser.com.evil.test/web/', 'http://sanadbrowser.com/web/', 'https://user:pass@sanadbrowser.com/web/', 'https://sanadbrowser.com/profile/', 'javascript:alert(1)']) assert.equal(officialSearchPage(url), false);
  let meta, event;
  const source = searchPreferenceScript({ safeSearch: 'off', language: 'ar', code: 'evil()' }, 'clear-cache');
  vm.runInNewContext(source, { document: { querySelector: () => meta, createElement: () => ({}), head: { append: node => { meta = node; } } }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }, window: { dispatchEvent: value => { event = value; } } });
  assert.equal(JSON.parse(meta.content).safeSearch, 'strict'); assert.equal(JSON.parse(event.detail).action, 'clear-cache');
  assert.equal(event.type, 'sanad-native-preferences'); assert(!source.includes('evil()')); assert(!/ipcRenderer|contextBridge|require\(/.test(source));
});
test('shared preferences survive store normalization and restart without weakening the search policy', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-search-prefs-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = openStore(dir); store.state.preferences.theme = 'light'; store.state.preferences.search = normalizeSearchPreferences({ saveHistory: false, language: 'ar', safeSearch: 'off' }); store.flush();
  const reopened = openStore(dir); assert.equal(reopened.state.preferences.search.language, 'ar'); assert.equal(reopened.state.preferences.search.saveHistory, false); assert.equal(reopened.state.preferences.search.safeSearch, 'strict'); assert.equal(reopened.state.preferences.theme, 'light');
});

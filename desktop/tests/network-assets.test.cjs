'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { configureEnginePerformance } = require('../engine-performance.cjs');
const { configureStartupPrivacy } = require('../location-privacy.cjs');
const { faviconAsset, omniboxSuggestions } = require('../network-assets.cjs');
test('acceleration merges feature flags and proxy privacy always removes QUIC', () => {
  for (const enabled of [false, true]) {
    const switches = new Map([['enable-features', 'ExistingFeature']]);
    const line = { appendSwitch: (key, value = '') => switches.set(key, value), removeSwitch: key => switches.delete(key), getSwitchValue: key => switches.get(key) || '' };
    const privacy = { version: 1, enabled, port: 9050 }; configureEnginePerformance(line, privacy); configureStartupPrivacy(line, privacy);
    assert(switches.has('enable-gpu-rasterization')); assert(switches.has('enable-zero-copy')); assert.equal(switches.get('enable-features'), 'ExistingFeature,ParallelDownloading,BackForwardCache');
    assert.equal(switches.has('enable-quic'), !enabled); assert.equal(switches.has('disable-quic'), enabled);
  }
});
test('native autocomplete never requests private, disabled or URL-like input; public requests enforce strict and omit credentials', async () => {
  const calls = []; const fetch = async (url, options) => { calls.push({ url, options }); return Response.json({ suggestions: ['سَنَد الحرمين', 'سَنَد الحرمين', 1, '  متصفح  '] }); };
  for (const [q, preferences, privateMode] of [['سَنَد', {}, true], ['سَنَد', { remoteSuggestions: false }, false], ['https://secret.example/path', {}, false], ['name@example.com', {}, false]]) assert.deepEqual(await omniboxSuggestions(fetch, q, preferences, privateMode), []);
  assert.equal(calls.length, 0);
  assert.deepEqual(await omniboxSuggestions(fetch, 'سَنَد', {}, false), ['سَنَد الحرمين', 'متصفح']);
  assert.equal(calls[0].options.credentials, 'omit'); assert.equal(calls[0].options.referrerPolicy, 'no-referrer'); assert.equal(JSON.parse(calls[0].options.body).safeSearch, 'strict');
});
test('favicon fetching rejects executable URLs, non-images, oversized streams and oversized PNG dimensions', async () => {
  let calls = 0; const plain = async () => { calls++; return new Response('html', { headers: { 'Content-Type': 'text/html' } }); };
  assert.equal(await faviconAsset(plain, 'file:///private'), null); assert.equal(calls, 0);
  assert.equal(await faviconAsset(plain, 'https://example.com/icon'), null);
  assert.equal(await faviconAsset(async () => new Response('x'.repeat(32769), { headers: { 'Content-Type': 'image/png' } }), 'https://example.com/icon'), null);
  const large = Buffer.alloc(24); large.writeUInt32BE(4000, 16); large.writeUInt32BE(4000, 20);
  assert.equal(await faviconAsset(async () => new Response(large, { headers: { 'Content-Type': 'image/png' } }), 'https://example.com/icon'), null);
  const icon = Buffer.from([0, 0, 1, 0]); const result = await faviconAsset(async () => new Response(icon, { headers: { 'Content-Type': 'image/x-icon' } }), 'https://example.com/icon'); assert.deepEqual(result.data, icon);
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { boundedText, compileFilters, parseBundle } = require('../filter-lists.cjs');
const { YOUTUBE_STYLES, isYouTube, youtubeGuardScript } = require('../youtube-guard.cjs');
test('filter downloads enforce a streaming byte bound even without Content-Length', async () => {
  let cancelled = false;
  const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(20)); }, cancel() { cancelled = true; } });
  await assert.rejects(boundedText(new Response(body), 10), /too large/); assert(cancelled);
  assert.equal(await boundedText(new Response('valid'), 10), 'valid');
});
test('filter bundles keep network and cosmetic engines separate, verify integrity and never enable page preload IPC', () => {
  const raw = compileFilters([{ name: 'fixture', url: 'https://example.com/list', sha256: 'fixture', text: '||ads.example.com^\nyoutube.com##.fixture-ad\nyoutube.com##+js(set, window.fixture, true)' }], 'fixture');
  const parsed = parseBundle(raw);
  assert.equal(parsed.network.config.loadCosmeticFilters, false); assert.equal(parsed.cosmetic.config.loadNetworkFilters, false); assert.equal(parsed.network.config.loadCSPFilters, false);
  const result = parsed.cosmetic.getCosmeticsFilters({ url: 'https://www.youtube.com/watch?v=fixture', hostname: 'www.youtube.com', domain: 'youtube.com', getInjectionRules: false, getExtendedRules: false });
  assert.match(result.styles, /fixture-ad/); assert.deepEqual(result.scripts, []);
  assert.throws(() => parseBundle({ ...raw, networkSha256: 'corrupt' }), /Corrupt/);
});
test('YouTube guard acts only on positively identified ads, restores media state and supports opt-out', () => {
  let ad = false, clicks = 0, observer, scheduled;
  const video = { muted: false, playbackRate: 1, duration: 30, currentTime: 2 };
  const skip = { disabled: false, getClientRects: () => [1], click() { clicks++; ad = false; } };
  const player = { classList: { contains: () => ad }, querySelector: selector => selector === 'video' ? video : skip };
  const context = { window: { addEventListener() {} }, document: { documentElement: {}, querySelector: () => player }, MutationObserver: class { constructor(cb) { observer = cb; } observe() {} disconnect() {} }, setTimeout: cb => { scheduled = cb; return 1; }, clearTimeout() { scheduled = null; } };
  vm.runInNewContext(youtubeGuardScript(true), context);
  assert.equal(video.currentTime, 2); assert.equal(video.playbackRate, 1); assert.equal(clicks, 0);
  ad = true; observer(); scheduled(); assert.equal(clicks, 1); assert.equal(video.muted, true); assert.equal(video.playbackRate, 16); assert(video.currentTime > 29);
  observer(); scheduled(); assert.equal(video.muted, false); assert.equal(video.playbackRate, 1);
  ad = true; observer(); scheduled(); vm.runInNewContext(youtubeGuardScript(false), context); assert.equal(video.muted, false); assert.equal(video.playbackRate, 1);
  assert(isYouTube('https://www.youtube.com/watch?v=fixture')); assert(!isYouTube('https://youtube.com.evil.test/')); assert(!isYouTube('http://youtube.com/'));
  assert.match(YOUTUBE_STYLES, /ytd-ad-slot-renderer/);
});

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
function guardFixture(initialPlayer = true) {
  let ad = false, clicks = 0, seekCount = 0, time = 2, nextTimer = 0, hasSkip = false;
  const observers = [], timers = new Map(), listeners = new Map();
  const video = { muted: false, playbackRate: 1.5, duration: 30, currentSrc: 'https://media.example/ad1', get currentTime() { return time; }, set currentTime(value) { seekCount++; time = value; } };
  const skip = { disabled: false, hidden: false, getAttribute: () => null, checkVisibility: () => true, getClientRects: () => [1], click() { clicks++; ad = false; } };
  const makePlayer = () => ({ classList: { contains: () => ad }, querySelector: selector => selector === 'video' ? video : hasSkip ? skip : null });
  let player = initialPlayer ? makePlayer() : null;
  const document = { documentElement: {}, querySelector: () => player, addEventListener: (name, cb) => listeners.set(name, cb), removeEventListener: name => listeners.delete(name) };
  const context = { window: { addEventListener() {} }, document,
    MutationObserver: class { constructor(cb) { this.cb = cb; observers.push(this); } observe(target, options) { this.target = target; this.options = options; this.active = true; } disconnect() { this.active = false; } },
    setTimeout: (cb, delay) => { const id = ++nextTimer; timers.set(id, { cb, delay }); return id; }, clearTimeout: id => timers.delete(id) };
  const enable = value => vm.runInNewContext(youtubeGuardScript(value), context);
  const notify = () => observers.filter(item => item.active).forEach(item => item.cb([]));
  const step = () => { const [id, task] = [...timers][0]; timers.delete(id); task.cb(); };
  return { context, document, observers, timers, video, enable, notify, step, setAd: value => { ad = value; }, setSkip: value => { hasSkip = value; }, clicks: () => clicks, seeks: () => seekCount,
    replacePlayer: () => { player = makePlayer(); listeners.get('yt-navigate-finish')?.(); }, addPlayer: () => { player = makePlayer(); notify(); } };
}
test('YouTube guard is idle during normal video, handles late skip controls and restores media preferences', () => {
  const f = guardFixture(); f.enable(true);
  assert.equal(f.video.currentTime, 2); assert.equal(f.video.playbackRate, 1.5); assert.equal(f.timers.size, 0);
  assert(f.observers.filter(o => o.active).every(o => o.target !== f.document.documentElement));
  f.setAd(true); f.notify(); f.step();
  assert.equal(f.video.muted, true); assert.equal(f.video.playbackRate, 16); assert.equal(f.seeks(), 1);
  f.notify(); f.step(); assert.equal(f.seeks(), 1, 'do not repeatedly seek the same ad segment');
  f.setSkip(true); f.notify(); f.step(); assert.equal(f.clicks(), 1);
  assert.equal(f.video.muted, false); assert.equal(f.video.playbackRate, 1.5); assert.equal(f.timers.size, 0);
  f.setSkip(false); f.setAd(true); f.notify(); f.step(); f.enable(false);
  assert.equal(f.video.muted, false); assert.equal(f.video.playbackRate, 1.5); assert.equal(f.timers.size, 0);
  assert(f.observers.every(o => !o.active));
});
test('YouTube guard discovers late players and reattaches after SPA navigation', () => {
  const f = guardFixture(false); f.enable(true); assert.equal(f.timers.size, 0);
  f.setAd(true); f.setSkip(true); f.addPlayer(); f.step(); assert.equal(f.clicks(), 1);
  f.replacePlayer(); f.step(); f.setAd(true); f.notify(); f.step(); assert.equal(f.clicks(), 2);
  f.enable(false);
  assert(isYouTube('https://www.youtube.com/watch?v=fixture')); assert(!isYouTube('https://youtube.com.evil.test/')); assert(!isYouTube('http://youtube.com/'));
  assert.match(YOUTUBE_STYLES, /ytd-ad-slot-renderer/);
});
test('first-party YouTube ad rules preserve ordinary player APIs and shared video streams', () => {
  const { Request } = require('@ghostery/adblocker');
  const raw = compileFilters([{ name: 'fixture', text: '||ads.example.com^' }], 'fixture');
  const engine = parseBundle(raw).network;
  const match = (url, type = 'xmlhttprequest', sourceUrl = 'https://www.youtube.com/watch?v=fixture') => engine.match(Request.fromRawDetails({ url, type, sourceUrl })).match;
  assert.equal(match('https://www.youtube.com/pagead/adview?id=fixture'), true);
  assert.equal(match('https://www.youtube.com/api/stats/ads?event=fixture', 'ping'), true);
  assert.equal(match('https://www.youtube.com/youtubei/v1/player'), false);
  assert.equal(match('https://rr1.googlevideo.com/videoplayback?source=youtube', 'media'), false);
  assert.equal(match('https://www.youtube.com/pagead/adview?id=fixture', 'xmlhttprequest', 'https://unrelated.example/'), false);
  assert.throws(() => parseBundle({ ...raw, localRulesVersion: 'obsolete' }), /Invalid/);
});

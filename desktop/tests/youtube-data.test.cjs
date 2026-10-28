'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { youtubeDataScript } = require('../youtube-data.cjs');
const player = () => ({ adPlacements: [{ ad: 1 }], playerAds: [1], adSlots: [1], videoDetails: { videoId: 'original-video' }, streamingData: { formats: [{ url: 'https://rr1.googlevideo.com/videoplayback?source=youtube' }] }, playabilityStatus: { status: 'OK' } });
function fixture(host = 'www.youtube.com') {
  const requests = [];
  const originalFetch = async (...args) => { requests.push(args); return new Response(JSON.stringify(player()), { status: 200, headers: { 'X-Fixture': 'preserved' } }); };
  const context = vm.createContext({ URL, Response, Request, location: new URL(`https://${host}/watch?v=original-video`), fetch: originalFetch });
  vm.runInContext(`window = globalThis; class XMLHttpRequest {
    open(method, url) { this.method = method; this.url = url; this.readyState = 1; }
    get responseText() { if (this.responseType === 'json') throw new Error('InvalidStateError'); return this.body; }
    get response() { return this.responseType === 'json' ? JSON.parse(this.body) : this.body; }
  }; window.XMLHttpRequest = XMLHttpRequest;`, context);
  const enable = value => vm.runInContext(youtubeDataScript(value), context);
  const json = value => JSON.parse(JSON.stringify(value));
  return { context, requests, originalFetch, enable, json };
}
test('initial inline player data is pruned before first consumer without altering video or playback status', () => {
  const f = fixture(); f.enable(true);
  vm.runInContext(`var ytInitialPlayerResponse = ${JSON.stringify(player())}; var firstConsumer = JSON.stringify(ytInitialPlayerResponse);`, f.context);
  const actual = JSON.parse(f.context.firstConsumer);
  for (const key of ['playerAds', 'adPlacements', 'adSlots']) assert.equal(key in actual, false);
  assert.deepEqual(actual.videoDetails, player().videoDetails); assert.deepEqual(actual.streamingData, player().streamingData);
  assert.deepEqual(actual.playabilityStatus, { status: 'OK' });
  f.enable(false); f.context.ytInitialPlayerResponse = player(); assert.equal(f.context.ytInitialPlayerResponse.adSlots.length, 1);
  f.enable(true); assert.equal('adSlots' in f.context.ytInitialPlayerResponse, false);
});
test('fetch JSON, text, Request and clones retain Response behavior and preserve normal video streams', async () => {
  const f = fixture(); f.enable(true);
  const request = new Request('https://www.youtube.com/youtubei/v1/player?key=fixture', { method: 'POST', body: 'original-body' });
  const response = await f.context.fetch(request), clone = response.clone();
  assert(response instanceof Response); assert.equal(response.bodyUsed, false); assert.equal(response.status, 200); assert.equal(response.headers.get('X-Fixture'), 'preserved');
  assert.equal('adPlacements' in await response.json(), false); assert.equal(response.bodyUsed, true);
  const text = await clone.text(); assert.equal('playerAds' in JSON.parse(text), false); assert.equal(JSON.parse(text).videoDetails.videoId, 'original-video');
  assert.equal(f.requests[0][0], request); assert.equal(await request.text(), 'original-body');
  await assert.rejects(response.text(), /[Bb]ody|[Uu]sable/);
  for (const url of ['https://www.youtube.com/api/stats/watchtime', 'https://www.youtube.com/youtubei/v1/player-evil', 'https://www.youtube.com.evil.test/youtubei/v1/player', 'https://rr1.googlevideo.com/videoplayback', 'https://example.com/youtubei/v1/player']) {
    assert.equal((await (await f.context.fetch(url)).json()).adSlots.length, 1, url);
  }
});
test('XHR text and JSON are scoped, reusable and reversible; invalid native access still throws', () => {
  const f = fixture(); const proto = f.context.XMLHttpRequest.prototype, originalOpen = proto.open, originalText = Object.getOwnPropertyDescriptor(proto, 'responseText').get;
  f.enable(true);
  const xhr = new f.context.XMLHttpRequest(); xhr.open('POST', '/youtubei/v1/player'); xhr.body = JSON.stringify(player()); xhr.readyState = 4;
  assert.equal('adSlots' in JSON.parse(xhr.responseText), false); assert.equal(xhr.response, xhr.responseText);
  xhr.responseType = 'json'; assert.equal('playerAds' in xhr.response, false); assert.throws(() => xhr.responseText, /InvalidStateError/);
  xhr.open('GET', '/unrelated'); xhr.readyState = 4; xhr.responseType = ''; assert.equal(JSON.parse(xhr.responseText).adSlots.length, 1);
  f.enable(false); assert.equal(proto.open, originalOpen); assert.equal(Object.getOwnPropertyDescriptor(proto, 'responseText').get, originalText);
});
test('nested player envelopes and Shorts remove only explicit advertising entries', async () => {
  const f = fixture(); f.context.fetch = async () => new Response(JSON.stringify([{ playerResponse: player() }, { response: { playerResponse: player() } }, { entries: [{ command: { reelWatchEndpoint: { adClientParams: { isAd: true } } } }, { command: { reelWatchEndpoint: { videoId: 'ordinary-short' } } }] }])); f.enable(true);
  const data = await (await f.context.fetch('/youtubei/v1/reel/reel_watch_sequence')).json();
  assert.equal('adSlots' in data[0].playerResponse, false); assert.equal('playerAds' in data[1].response.playerResponse, false);
  assert.equal(data[2].entries.length, 1); assert.equal(data[2].entries[0].command.reelWatchEndpoint.videoId, 'ordinary-short');
});
test('malformed, oversized and non-JSON responses pass through; opt-out restores fetch and pending responses', async () => {
  const f = fixture(); const texts = [')]}\'\n{"adSlots":[1],"videoDetails":{"videoId":"original"}}', '{"adSlots":malformed', 'ordinary text adSlots', '{"adSlots":[],"large":"' + 'x'.repeat(8_000_000) + '"}'];
  let index = 0; const native = f.context.fetch = async () => new Response(texts[index++]); f.enable(true);
  assert.equal(await (await f.context.fetch('/youtubei/v1/player')).text(), ")]}'\n{\"videoDetails\":{\"videoId\":\"original\"}}");
  for (let i = 1; i < texts.length; i++) assert.equal(await (await f.context.fetch('/youtubei/v1/player')).text(), texts[i]);
  f.enable(false); assert.equal(f.context.fetch, native);
  const g = fixture(); g.enable(true); const pending = await g.context.fetch('/youtubei/v1/player'); g.enable(false);
  assert.equal((await pending.json()).adSlots.length, 1); assert.equal(g.context.fetch, g.originalFetch);
});
test('lookalike and unrelated origins are completely inert and no privileged bridge is created', () => {
  for (const host of ['youtube.com.evil.test', 'example.com']) { const f = fixture(host); f.enable(true); assert.equal(f.context.fetch, f.originalFetch); assert.equal(f.context.__sanadYoutubeDataV1, undefined); }
  const f = fixture(); f.enable(true);
  assert.equal(vm.runInContext('typeof require + ":" + typeof process + ":" + typeof sanadBrowser', f.context), 'undefined:undefined:undefined');
  assert.deepEqual(Object.keys(f.context.__sanadYoutubeDataV1), ['setEnabled']);
  assert.equal(Object.isFrozen(f.context.__sanadYoutubeDataV1), true);
});

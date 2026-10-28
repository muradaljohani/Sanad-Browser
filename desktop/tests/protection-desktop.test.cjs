'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-protection-'));
  const server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Safe fixture</title>Safe fixture'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let app;
  try {
    app = await electron.launch({ args: ['--no-sandbox', path.join(__dirname, '..')], env: { ...process.env, SANAD_BROWSER_TEST_MODE: '1', SANAD_BROWSER_TEST_PROFILE: profile, SANAD_BROWSER_TEST_URL: base }, timeout: 30000 });
    const shell = await app.firstWindow();
    app.process().stderr.on('data', chunk => process.stderr.write(chunk));
    await shell.waitForFunction(() => Boolean(window.sanadBrowser));
    const command = (action, data = {}) => shell.evaluate(({ action, data }) => window.sanadBrowser.command(action, data), { action, data });
    const fixture = '<!doctype html><title>YouTube protection fixture</title><script>var ytInitialPlayerResponse={adPlacements:[1],adSlots:[1],playerAds:[1],videoDetails:{videoId:"fixture-original"},streamingData:{formats:[{url:"https://rr1.googlevideo.com/videoplayback"}]},playabilityStatus:{status:"OK"}};window.firstPlayerData=JSON.parse(JSON.stringify(ytInitialPlayerResponse));</script><style>button{width:120px;height:40px}ytd-ad-slot-renderer{display:block}</style><ytd-ad-slot-renderer>Display ad fixture</ytd-ad-slot-renderer><div id="movie_player" class="ad-showing"><video></video><button class="ytp-ad-skip-button" onclick="document.querySelector(\'#movie_player\').classList.remove(\'ad-showing\');document.documentElement.dataset.skips=String(Number(document.documentElement.dataset.skips||0)+1)">Skip fixture ad</button></div>';
    // Controlled fixture only: no claim that a synthetic page proves every live YouTube campaign.
    await app.evaluate(({ session }, html) => session.fromPartition('persist:sanad-web').protocol.handle('https', request => { const url = new URL(request.url), api = url.pathname === '/youtubei/v1/player'; return new Response(url.hostname === 'www.youtube.com' ? (api ? JSON.stringify({adPlacements:[1],adSlots:[1],playerAds:[1],videoDetails:{videoId:'fixture-api'}}) : html) : 'Blocked test network', { status: url.hostname === 'www.youtube.com' ? 200 : 404, headers: { 'Content-Type': api ? 'application/json' : 'text/html', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src 'none'; connect-src 'self'" } }); }), fixture);
    const onPage = source => app.evaluate(({ webContents }, source) => { const wc = webContents.getAllWebContents().find(item => item.getURL().startsWith('https://www.youtube.com/')); if (!wc) return null; return wc.executeJavaScript(source); }, source);
    const poll = async (source, predicate) => { const end = Date.now() + 15000; while (Date.now() < end) { const value = await onPage(source).catch(() => null); if (predicate(value)) return value; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error('Protection fixture timed out: ' + source + '; ' + JSON.stringify(await onPage('({url:location.href,html:document.documentElement.outerHTML})')) + '; trace=' + JSON.stringify(await app.evaluate(() => globalThis.protectionTrace)));  };
    await app.evaluate(({ webContents }) => { globalThis.protectionTrace = []; for (const wc of webContents.getAllWebContents()) { if (wc.getURL().startsWith('http://127.0.0.1:')) for (const method of ['insertCSS', 'removeInsertedCSS']) { const original = wc[method].bind(wc); wc[method] = async (...args) => { try { const result = await original(...args); globalThis.protectionTrace.push({ method, key: method === 'insertCSS' ? result : args[0] }); return result; } catch (error) { globalThis.protectionTrace.push({ method, error: error.message }); throw error; } }; } } });
    await command('navigate', { value: 'https://www.youtube.com/watch?v=sanad-fixture' });
    await poll('document.documentElement.dataset.skips', value => value === '1');
    assert.equal(await app.evaluate(({webContents}) => webContents.getAllWebContents().find(wc=>wc.getURL().startsWith('https://www.youtube.com/')).navigationHistory.getAllEntries().some(entry=>entry.url==='about:blank')), false);
    const initial = await onPage('window.firstPlayerData');
    assert.deepEqual(initial, { videoDetails: { videoId: 'fixture-original' }, streamingData: { formats: [{ url: 'https://rr1.googlevideo.com/videoplayback' }] }, playabilityStatus: { status: 'OK' } });
    const fetchData = await onPage('(async () => { const r=await fetch("/youtubei/v1/player"); const c=r.clone(); return {json:await r.json(),text:JSON.parse(await c.text()),status:r.status,url:r.url}; })()');
    assert.deepEqual(fetchData.json, {videoDetails:{videoId:'fixture-api'}}); assert.deepEqual(fetchData.text, fetchData.json); assert.equal(fetchData.status,200); assert.match(fetchData.url,/youtubei\/v1\/player/);
    const xhrData = await onPage('new Promise((resolve,reject)=>{const x=new XMLHttpRequest();x.open("GET","/youtubei/v1/player");x.onload=()=>resolve(JSON.parse(x.responseText));x.onerror=reject;x.send();})');
    assert.deepEqual(xhrData, {videoDetails:{videoId:'fixture-api'}});
    await poll('document.querySelector("video").muted', value => value === false);
    assert.equal(await onPage('getComputedStyle(document.querySelector("ytd-ad-slot-renderer")).display'), 'none');
    assert.deepEqual(await onPage('({node:typeof require,process:typeof process,bridge:typeof window.sanadBrowser,guard:typeof window.__sanadYoutubeGuardV1})'), { node: 'undefined', process: 'undefined', bridge: 'undefined', guard: 'undefined' });
    await command('protection', { value: false });
    await poll('getComputedStyle(document.querySelector("ytd-ad-slot-renderer")).display', value => value === 'block');
    assert.equal((await onPage('fetch("/youtubei/v1/player").then(r=>r.json())')).adSlots.length, 1);
    await command('reload');
    await poll('window.firstPlayerData?.adSlots?.length', value => value === 1);
    await onPage('document.querySelector("#movie_player").classList.add("ad-showing"); true');
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(await onPage('document.documentElement.dataset.skips'), undefined);
    assert.equal(await onPage('document.querySelector("video").playbackRate'), 1);
    await command('protection', { value: true });
    await poll('document.documentElement.dataset.skips', value => value === '1');
    assert.equal('adSlots' in (await onPage('fetch("/youtubei/v1/player").then(r=>r.json())')), false);
    const previousDocument = await onPage('performance.timeOrigin');
    await command('reload');
    await poll('performance.timeOrigin', value => typeof value === 'number' && value !== previousDocument);
    await poll('window.firstPlayerData?.videoDetails?.videoId', value => value === 'fixture-original');
    assert.equal('adSlots' in await onPage('window.firstPlayerData'), false);
    const state = await command('state'); assert.equal(state.protectionSource, 'bundled');
    console.log(JSON.stringify({ ok: true, checks: ['packaged-list-first-run', 'actual-CSS-hiding', 'isolated-YouTube-skip-fixture', 'no-remote-node-or-IPC-bridge', 'media-state-restoration', 'before-inline-player-metadata', 'real-fetch-clone-and-XHR-pruning', 'protection-opt-out-and-reenable-across-reload'] }));
  } finally { if (app) await app.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(profile, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });


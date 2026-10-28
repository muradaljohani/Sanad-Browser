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
    const fixture = '<!doctype html><title>YouTube protection fixture</title><style>button{width:120px;height:40px}ytd-ad-slot-renderer{display:block}</style><ytd-ad-slot-renderer>Display ad fixture</ytd-ad-slot-renderer><div id="movie_player" class="ad-showing"><video></video><button class="ytp-ad-skip-button" onclick="document.querySelector(\'#movie_player\').classList.remove(\'ad-showing\');document.documentElement.dataset.skips=String(Number(document.documentElement.dataset.skips||0)+1)">Skip fixture ad</button></div>';
    // Controlled fixture only: no claim that a synthetic page proves every live YouTube campaign.
    await app.evaluate(({ session }, html) => session.fromPartition('persist:sanad-web').protocol.handle('https', request => new Response(new URL(request.url).hostname === 'www.youtube.com' ? html : 'Blocked test network', { status: new URL(request.url).hostname === 'www.youtube.com' ? 200 : 404, headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src 'none'" } })), fixture);
    const onPage = source => app.evaluate(({ webContents }, source) => { const wc = webContents.getAllWebContents().find(item => item.getURL().startsWith('https://www.youtube.com/')); if (!wc) return null; return wc.executeJavaScript(source); }, source);
    const poll = async (source, predicate) => { const end = Date.now() + 15000; while (Date.now() < end) { const value = await onPage(source); if (predicate(value)) return value; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error('Protection fixture timed out: ' + source + '; ' + JSON.stringify(await onPage('({url:location.href,html:document.documentElement.outerHTML})')) + '; trace=' + JSON.stringify(await app.evaluate(() => globalThis.protectionTrace)));  };
    await app.evaluate(({ webContents }) => { globalThis.protectionTrace = []; for (const wc of webContents.getAllWebContents()) { if (wc.getURL().startsWith('http://127.0.0.1:')) for (const method of ['insertCSS', 'removeInsertedCSS']) { const original = wc[method].bind(wc); wc[method] = async (...args) => { try { const result = await original(...args); globalThis.protectionTrace.push({ method, key: method === 'insertCSS' ? result : args[0] }); return result; } catch (error) { globalThis.protectionTrace.push({ method, error: error.message }); throw error; } }; } } });
    await command('navigate', { value: 'https://www.youtube.com/watch?v=sanad-fixture' });
    await poll('document.documentElement.dataset.skips', value => value === '1');
    await poll('document.querySelector("video").muted', value => value === false);
    assert.equal(await onPage('getComputedStyle(document.querySelector("ytd-ad-slot-renderer")).display'), 'none');
    assert.deepEqual(await onPage('({node:typeof require,process:typeof process,bridge:typeof window.sanadBrowser,guard:typeof window.__sanadYoutubeGuardV1})'), { node: 'undefined', process: 'undefined', bridge: 'undefined', guard: 'undefined' });
    await command('protection', { value: false });
    await poll('getComputedStyle(document.querySelector("ytd-ad-slot-renderer")).display', value => value === 'block');
    await onPage('document.querySelector("#movie_player").classList.add("ad-showing"); true');
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(await onPage('document.documentElement.dataset.skips'), '1');
    assert.equal(await onPage('document.querySelector("video").playbackRate'), 1);
    await command('protection', { value: true });
    await poll('document.documentElement.dataset.skips', value => value === '2');
    const state = await command('state'); assert.equal(state.protectionSource, 'bundled');
    console.log(JSON.stringify({ ok: true, checks: ['packaged-list-first-run', 'actual-CSS-hiding', 'isolated-YouTube-skip-fixture', 'no-remote-node-or-IPC-bridge', 'media-state-restoration', 'protection-opt-out-and-reenable'] }));
  } finally { if (app) await app.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(profile, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

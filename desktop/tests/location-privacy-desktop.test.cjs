'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const { writeNetworkPrivacy, readNetworkPrivacy } = require('../location-privacy.cjs');

// This fixture forwards only to our own loopback HTTP server. No Internet route.
async function socksFixture(targetPort) {
  const sockets = new Set(), requests = [];
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    let bytes = Buffer.alloc(0), greeting = true;
    const receive = chunk => {
      bytes = Buffer.concat([bytes, chunk]);
      if (greeting) {
        if (bytes.length < 2 || bytes.length < 2 + bytes[1]) return;
        if (bytes[0] !== 5) return socket.destroy();
        bytes = bytes.subarray(2 + bytes[1]); greeting = false; socket.write(Buffer.from([5, 0]));
      }
      if (bytes.length < 5) return;
      const kind = bytes[3], length = kind === 1 ? 10 : kind === 3 ? 7 + bytes[4] : kind === 4 ? 22 : 0;
      if (!length) return socket.destroy();
      if (bytes.length < length) return;
      const host = kind === 1 ? [...bytes.subarray(4, 8)].join('.') : kind === 3 ? bytes.subarray(5, 5 + bytes[4]).toString() : '::1';
      const port = bytes.readUInt16BE(length - 2);
      requests.push({ host, port, kind });
      socket.removeListener('data', receive); socket.pause();
      if (bytes[0] !== 5 || bytes[1] !== 1 || !['localhost', '127.0.0.1', '::1'].includes(host) || port !== targetPort) { socket.end(Buffer.from([5, 4, 0, 1, 0, 0, 0, 0, 0, 0])); return; }
      const upstream = net.connect({ host: '127.0.0.1', port });
      sockets.add(upstream); upstream.on('close', () => sockets.delete(upstream));
      socket.on('close', () => upstream.destroy()); upstream.on('error', () => socket.destroy());
      upstream.on('connect', () => {
        socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
        if (bytes.length > length) upstream.write(bytes.subarray(length));
        socket.pipe(upstream); upstream.pipe(socket); socket.resume();
      });
    };
    socket.on('data', receive);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { port: server.address().port, requests, stop: async () => { for (const socket of sockets) socket.destroy(); if (server.listening) await new Promise(resolve => server.close(resolve)); } };
}
async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-routing-'));
  const hits = [], targetSockets = new Set();
  const server = http.createServer((request, response) => {
    hits.push(request.url);
    if (request.url === '/frame') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><title>Frame</title><p>Subframe fixture</p>'); return; }
    if (request.url === '/worker.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end('onmessage=async()=>postMessage(await (await fetch("/worker-fetch")).text())'); return; }
    if (request.url === '/update-feed') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ schema: 1, channel: 'preview', version: '1.3.5', installation: 'manual', releaseUrl: 'https://github.com/muradaljohani/Browser/releases/tag/desktop-v1.3.5' })); return; }
    if (request.url === '/download') { response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="routing.txt"' }); response.end('proxy-download'); return; }
    if (request.url === '/redirect') { response.writeHead(302, { location: '/redirected' }); response.end(); return; }
    if (['/worker-fetch', '/probe', '/after-down'].includes(request.url)) { response.end('proxied'); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>Routing fixture</title><iframe src="/frame"></iframe><script>window.geoResult = new Promise(resolve => navigator.geolocation.getCurrentPosition(() => resolve("allowed"), error => resolve(error.code === 1 ? "denied" : "error")));</script>');
  });
  server.on('connection', socket => { targetSockets.add(socket); socket.on('close', () => targetSockets.delete(socket)); });
  server.on('upgrade', (request, socket) => {
    hits.push(request.url);
    const accept = crypto.createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.on('data', data => { if ((data[0] & 15) === 8) socket.end(Buffer.from([0x88, 0])); });
    socket.on('error', () => {});
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port, base = `http://localhost:${port}`;
  let app, proxy;
  const launch = async () => {
    app = await electron.launch({ args: ['--no-sandbox', '--no-proxy-server', '--proxy-bypass-list=*', path.join(__dirname, '..')], env: { ...process.env, SANAD_BROWSER_TEST_MODE: '1', SANAD_BROWSER_TEST_PROFILE: profile, SANAD_BROWSER_TEST_URL: base, SANAD_BROWSER_TEST_UPDATE_URL: `${base}/update-feed` }, timeout: 30000 });
    const shell = await app.firstWindow(); await shell.waitForFunction(() => Boolean(window.sanadBrowser));
    const cmd = (action, data = {}) => shell.evaluate(({ action, data }) => window.sanadBrowser.command(action, data), { action, data });
    const poll = async predicate => { const end = Date.now() + 15000; let state; while (Date.now() < end) { state = await cmd('state'); if (predicate(state)) return state; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error(`Routing fixture timeout: ${JSON.stringify(state)}`); };
    await poll(s => s.tabs.some(t => t.title === 'Routing fixture' && !t.loading));
    return { shell, cmd, poll };
  };
  try {
    await launch();
    await app.evaluate(async ({ session }, base) => { const ses = session.fromPartition('persist:sanad-web'); await ses.cookies.set({ url: base, name: 'ordinary-marker', value: 'ordinary', expirationDate: Date.now() / 1000 + 3600 }); await ses.cookies.flushStore(); }, base);
    await app.close(); app = undefined;
    proxy = await socksFixture(port); writeNetworkPrivacy(profile, { version: 1, enabled: true, port: proxy.port });
    hits.length = 0;
    let { shell, cmd, poll } = await launch();
    let state = await cmd('state'); assert.equal(state.locationPrivacy.routing, 'configured-unverified');
    const initialHistory = state.history.map(item => item.url);
    const pageId = await app.evaluate(({ webContents }, base) => webContents.getAllWebContents().find(wc => wc.getURL() === base + '/').id, base);
    const onPage = source => app.evaluate(({ webContents }, { id, source }) => webContents.fromId(id).executeJavaScript(source), { id: pageId, source });
    assert.equal(await onPage('window.geoResult'), 'denied');
    assert.equal(await onPage('navigator.permissions.query({name:"geolocation"}).then(p=>p.state)'), 'denied');
    assert.equal(await onPage('document.querySelector("iframe").contentWindow.navigator.permissions.query({name:"geolocation"}).then(p=>p.state)'), 'denied');
    assert.doesNotMatch(await onPage('document.cookie'), /ordinary-marker/);
    assert.equal(await onPage('new Promise(resolve=>{const w=new Worker("/worker.js");w.onmessage=e=>{resolve(e.data);w.terminate()};w.postMessage("go")})'), 'proxied');
    assert.equal(await onPage(`new Promise(resolve=>{const w=new WebSocket('ws://localhost:${port}/socket');w.onopen=()=>{w.close();resolve('open')};w.onerror=()=>resolve('error')})`), 'open');
    assert.equal(await onPage('fetch("/redirect").then(r=>r.url.endsWith("/redirected"))'), true);
    await onPage('window.open("/popup");true'); await poll(s => s.tabs.length === 2 && s.tabs.some(t => t.url.endsWith('/popup') && !t.loading));
    await cmd('new', { private: true }); state = await poll(s => s.tabs.some(t => t.private && t.title === 'Routing fixture' && !t.loading));
    const pageSecurity = await app.evaluate(({ webContents }, base) => webContents.getAllWebContents().filter(wc => wc.getURL().startsWith(base)).map(wc => ({ policy: wc.getWebRTCIPHandlingPolicy(), persistent: wc.session.isPersistent() })), base);
    assert(pageSecurity.length >= 3); assert(pageSecurity.every(p => !p.persistent && p.policy === 'disable_non_proxied_udp'));
    assert.equal(await app.evaluate(async ({ net }, base) => (await net.fetch(base + '/probe')).text(), base), 'proxied');
    await cmd('updates-check'); assert.equal((await cmd('state')).updates.status, 'current');
    await cmd('navigate', { value: `${base}/download` }); await poll(s => s.downloads.some(d => d.name === 'routing.txt' && d.status === 'completed'));
    assert.equal(fs.readFileSync(path.join(profile, 'routing.txt'), 'utf8'), 'proxy-download');
    assert.deepEqual((await cmd('state')).history.map(item => item.url), initialHistory);
    await app.evaluate(async ({ net }) => { try { await net.fetch('https://dns-fixture.invalid/', { signal: AbortSignal.timeout(3000) }); } catch {} });
    assert(proxy.requests.some(r => r.host === 'dns-fixture.invalid' && r.kind === 3), 'unresolved destination hostname is delivered to SOCKS5');
    assert(proxy.requests.some(r => r.host === 'localhost'), 'loopback URLs use SOCKS5 too');
    assert(hits.includes('/worker-fetch') && hits.includes('/frame') && hits.includes('/socket') && hits.includes('/popup') && hits.includes('/update-feed') && hits.includes('/redirected'));
    await shell.getByRole('button', { name: 'حماية الخصوصية', exact: true }).click();
    await shell.getByLabel('منفذ وسيط SOCKS5 المحلي', { exact: true }).fill('9150');
    assert.equal(await shell.getByLabel('منفذ وسيط SOCKS5 المحلي', { exact: true }).inputValue(), '9150');
    await shell.getByRole('button', { name: 'إغلاق', exact: true }).click();
    await proxy.stop();
    // The destination remains reachable. Any request now reaching it from Electron is a leak.
    await new Promise((resolve, reject) => http.get(`http://127.0.0.1:${port}/direct-control`, response => { response.resume(); response.on('end', resolve); }).on('error', reject));
    const before = hits.length;
    const results = await app.evaluate(async ({ net, webContents }, base) => {
      const sessions = [...new Set(webContents.getAllWebContents().filter(wc => wc.getURL().startsWith(base)).map(wc => wc.session))];
      const attempt = async fetcher => { try { await fetcher(`http://127.0.0.1:${new URL(base).port}/after-down`, { signal: AbortSignal.timeout(3000), cache: 'no-store' }); return 'leaked'; } catch { return 'blocked'; } };
      return Promise.all([attempt((...args) => net.fetch(...args)), ...sessions.map(ses => attempt((...args) => ses.fetch(...args)))]);
    }, base);
    assert(results.length >= 3); assert(results.every(r => r === 'blocked'));
    assert.equal(await onPage('fetch("/after-down").then(()=>"leaked",()=>"blocked")'), 'blocked');
    assert.equal(hits.length, before, 'no direct request after SOCKS5 outage');
    await app.close(); app = undefined;
    // Enabled configuration survives a new process even when the proxy is already down.
    app = await electron.launch({ args: ['--no-sandbox', path.join(__dirname, '..')], env: { ...process.env, SANAD_BROWSER_TEST_MODE: '1', SANAD_BROWSER_TEST_PROFILE: profile, SANAD_BROWSER_TEST_URL: base }, timeout: 30000 });
    shell = await app.firstWindow(); await shell.waitForFunction(() => Boolean(window.sanadBrowser));
    await shell.waitForFunction(async () => Boolean((await window.sanadBrowser.command('state')).tabs[0]?.error));
    assert.equal((await shell.evaluate(() => window.sanadBrowser.command('state'))).locationPrivacy.enabled, true);
    assert.equal(hits.length, before);
    // Capture relaunch options without spawning an unmanaged second application.
    await app.evaluate(({ app, dialog }) => {
      app.__testQuit = app.quit.bind(app); app.quit = () => {};
      app.relaunch = options => { app.__testRelaunch = options; };
      dialog.showMessageBox = async () => ({ response: 1 });
    });
    await shell.getByRole('button', { name: 'حماية الخصوصية', exact: true }).click();
    await shell.getByRole('button', { name: 'إيقاف وضع الوسيط وإعادة التشغيل', exact: true }).click();
    await shell.waitForFunction(async () => (await window.sanadBrowser.command('state')).tabs.length === 0);
    const restart = await app.evaluate(({ app }) => app.__testRelaunch);
    assert(Array.isArray(restart.args));
    assert(!restart.args.some(arg => /^--(?:proxy-server|proxy-bypass-list|host-resolver-rules|disable-quic)(?:=|$)/.test(arg)), 'runtime switches are absent from the relaunch command');
    assert.equal(readNetworkPrivacy(profile).enabled, false);
    await app.evaluate(({ app }) => { app.quit = app.__testQuit; }); await app.close(); app = undefined;
    const ordinary = await launch();
    assert.equal((await ordinary.cmd('state')).locationPrivacy.enabled, false);
    assert(hits.length > before, 'ordinary browsing works again after disabling the mode');
    console.log(JSON.stringify({ ok: true, checks: ['geolocation-denied-and-subframe', 'no-ordinary-cookies', 'regular-private-popup-routing', 'remote-DNS-name', 'worker-subframe-websocket-redirect-download', 'update-via-default-session', 'WebRTC-policy', 'proxy-outage-no-direct-fallback', 'restart-already-offline', 'disable-mode-original-arguments'] }));
  } finally {
    if (app) await app.close(); if (proxy) await proxy.stop();
    for (const socket of targetSockets) socket.destroy();
    await new Promise(resolve => server.close(resolve)); fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

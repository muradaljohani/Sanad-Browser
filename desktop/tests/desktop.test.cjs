'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-desktop-'));
  const receivedAgents = [];
  const server = http.createServer((request, response) => {
    receivedAgents.push(request.headers['user-agent']);
    if (request.url === '/download') { response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="sanad-test.txt"' }); response.end('Sanad fixture download'); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html><head><title>${request.url === '/second' ? 'Second fixture' : 'Sanad fixture'}</title><style>body{font-family:Arial,sans-serif;background:#f0f8f4;color:#173d2d;padding:30px}#layout{display:grid;grid-template-columns:1fr 1fr;width:200px;height:60px;background:rgb(52,168,83)}</style></head><body><h1>Sanad test page</h1><p>Chromium phrase · Chromium phrase</p><div id="layout"><span>DOM</span><span>CSS layout</span></div><a href="/second">Next page</a><a href="/download">Download</a><script>window.fixtureScript=7*6;</script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let app;
  try {
    app = await electron.launch({ args: ['--no-sandbox', path.join(__dirname, '..')], env: { ...process.env, SANAD_BROWSER_TEST_MODE: '1', SANAD_BROWSER_TEST_PROFILE: profile, SANAD_BROWSER_TEST_URL: base }, timeout: 30000 });
    const shell = await app.firstWindow();
    await shell.waitForFunction(() => Boolean(window.sanadBrowser));
    const cmd = (action, data = {}) => shell.evaluate(({ action, data }) => window.sanadBrowser.command(action, data), { action, data });
    const poll = async (predicate, label) => { const deadline = Date.now() + 15000; let last; while (Date.now() < deadline) { last = await cmd('state'); if (predicate(last)) return last; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(`Timed out: ${label}: ${JSON.stringify(last)}`); };
    await poll(state => state.tabs[0]?.title === 'Sanad fixture' && !state.tabs[0].loading, 'initial page');
    const onPage = source => app.evaluate(({ webContents }, source) => { const page = webContents.getAllWebContents().find(wc => wc.getURL().startsWith('http://127.0.0.1:')); if (!page) throw new Error('Fixture missing'); return page.executeJavaScript(source); }, source);
    assert.deepEqual(await onPage('({node:typeof require, bridge:typeof window.sanadBrowser, process:typeof process})'), { node: 'undefined', bridge: 'undefined', process: 'undefined' });
    const agent = await onPage('navigator.userAgent');
    assert(agent.endsWith(`SanadBrowser/${require('../package.json').version}`));
    assert.doesNotMatch(agent, /Electron|sanad-browser-desktop/i);
    assert.equal(receivedAgents[0], agent, 'the request header and page identity agree');
    const identity = await app.evaluate(({ app, session }) => ({ fallback: app.userAgentFallback, regular: session.fromPartition('persist:sanad-web').getUserAgent() }));
    assert.equal(identity.fallback, agent); assert.equal(identity.regular, agent);
    const hints = await onPage('navigator.userAgentData ? navigator.userAgentData.toJSON() : null');
    console.log(JSON.stringify({ check: 'actual-user-agent', userAgent: agent, clientHints: hints }));
    assert.deepEqual(await onPage('({script:window.fixtureScript,width:document.querySelector("#layout").getBoundingClientRect().width,display:getComputedStyle(document.querySelector("#layout")).display,color:getComputedStyle(document.querySelector("#layout")).backgroundColor})'), { script: 42, width: 200, display: 'grid', color: 'rgb(52, 168, 83)' });
    let state = await cmd('state'); assert.equal(state.tabs.length, 1); const firstId = state.activeId;
    await cmd('navigate', { value: `${base}/second` }); await poll(s => s.tabs[0].title === 'Second fixture' && s.tabs[0].back, 'forward navigation');
    await cmd('back'); await poll(s => s.tabs[0].title === 'Sanad fixture' && s.tabs[0].forward, 'back navigation');
    await cmd('forward'); await poll(s => s.tabs[0].title === 'Second fixture', 'forward history');
    await onPage(`void fetch('https://www.google-analytics.com/collect').catch(() => {})`); await poll(s => s.tabs[0].blocked > 0, 'actual tracker request block');
    await onPage(`window.fixturePopup = window.open('${base}/second', 'sanad-popup'); true`); await poll(s => s.tabs.length === 2 && s.tabs.some(tab => tab.id !== firstId && tab.title === 'Second fixture'), 'real popup tab');
    let popupState = await cmd('state'); const popupId = popupState.tabs.find(tab => tab.id !== firstId).id;
    const popupPrivileges = await app.evaluate(({ webContents }, base) => webContents.getAllWebContents().filter(wc => wc.getURL().startsWith(base)).map(wc => wc.getLastWebPreferences()).map(prefs => ({ sandbox: prefs.sandbox, node: prefs.nodeIntegration, isolation: prefs.contextIsolation, preload: Boolean(prefs.preload) })), base);
    assert(popupPrivileges.every(prefs => prefs.sandbox && !prefs.node && prefs.isolation && !prefs.preload));
    const popupAgents = await app.evaluate(({ webContents }, base) => Promise.all(webContents.getAllWebContents().filter(wc => wc.getURL().startsWith(base)).map(wc => wc.executeJavaScript('navigator.userAgent'))), base);
    assert(popupAgents.every(value => value === agent), 'popup tabs inherit the same branded identity');
    const openerCount = await app.evaluate(async ({ webContents }, base) => { const values = await Promise.all(webContents.getAllWebContents().filter(wc => wc.getURL().startsWith(base)).map(wc => wc.executeJavaScript('Boolean(window.opener)'))); return values.filter(Boolean).length; }, base); assert.equal(openerCount, 1, 'popup retains the opener required by normal OAuth completion flows');
    await cmd('close', { id: popupId }); await poll(s => s.tabs.length === 1, 'close popup');
    await cmd('navigate', { value: 'javascript:alert(1)' }); assert.equal((await cmd('state')).tabs[0].url, `${base}/second`);
    await cmd('zoom', { value: 1.3 }); assert.equal((await cmd('state')).tabs[0].zoom, 1.3);
    await cmd('new'); await poll(s => s.tabs.length === 2 && s.tabs[1].title === 'Sanad fixture', 'new tab');
    await cmd('pin', { id: firstId }); assert.equal((await cmd('state')).tabs[0].pinned, true);
    await cmd('mute', { id: firstId }); assert.equal((await cmd('state')).tabs[0].muted, true);
    await cmd('pin', { id: firstId }); await cmd('suspend'); assert.equal((await cmd('state')).tabs.find(tab => tab.id === firstId).sleeping, true);
    await cmd('activate', { id: firstId }); await poll(s => s.tabs.find(tab => tab.id === firstId).title === 'Second fixture' && !s.tabs.find(tab => tab.id === firstId).loading, 'wake tab');
    const closedBefore = (await cmd('state')).closedCount; await cmd('close', { id: firstId }); await poll(s => s.tabs.length === 1 && s.closedCount === closedBefore + 1, 'close tab');
    await cmd('restore'); await poll(s => s.tabs.length === 2 && s.tabs.find(tab => tab.id === s.activeId)?.title === 'Second fixture', 'restore tab');
    await cmd('new', { private: true }); state = await poll(s => s.tabs.some(tab => tab.private && tab.title === 'Sanad fixture' && !tab.loading), 'private tab'); const privateId = state.activeId;
    const privatePartition = await app.evaluate(({ webContents }) => webContents.getAllWebContents().filter(wc => wc.getURL().startsWith('http://127.0.0.1:')).map(wc => ({ id: wc.id, persistent: wc.session.isPersistent() })));
    assert.equal(privatePartition.filter(item => !item.persistent).length, 1);
    const privateAgent = await app.evaluate(({ webContents }, base) => webContents.getAllWebContents().find(wc => wc.getURL().startsWith(base) && !wc.session.isPersistent()).executeJavaScript('navigator.userAgent'), base);
    assert.equal(privateAgent, agent, 'private browsing uses the same branded identity');
    assert(receivedAgents.every(value => value === agent), 'all fixture requests, including private and popup tabs, use the branded header');
    await app.evaluate(async ({ webContents }, base) => { const pages = webContents.getAllWebContents().filter(wc => wc.getURL().startsWith(base)); const privatePage = pages.find(wc => !wc.session.isPersistent()); const regular = pages.find(wc => wc.session.isPersistent()); await regular.session.cookies.set({ url: base, name: 'regular-fixture', value: 'regular', expirationDate: Date.now() / 1000 + 3600 }); await privatePage.session.cookies.set({ url: base, name: 'private-fixture', value: 'private' }); await privatePage.executeJavaScript('localStorage.setItem("private-marker","private")'); return privatePage.session.cookies.get({ url: base }); }, base).then(cookies => { assert.equal(cookies.some(cookie => cookie.name === 'regular-fixture'), false); assert(cookies.some(cookie => cookie.name === 'private-fixture')); });
    await cmd('navigate', { value: `${base}/private-secret` }); await poll(s => s.tabs.find(tab => tab.id === privateId).url.endsWith('/private-secret'), 'private navigation'); assert(!(await cmd('state')).history.some(item => item.url.includes('private-secret')));
    await cmd('close', { id: privateId }); await poll(s => !s.tabs.some(tab => tab.private), 'close private session');
    await cmd('new', { private: true }); await poll(s => s.tabs.some(tab => tab.private && tab.title === 'Sanad fixture' && !tab.loading), 'fresh private session');
    const cleanCookies = await app.evaluate(async ({ webContents }, base) => webContents.getAllWebContents().find(wc => wc.getURL().startsWith(base) && !wc.session.isPersistent()).session.cookies.get({ url: base }), base); assert.equal(cleanCookies.length, 0);
    const cleanStorage = await app.evaluate(({ webContents }, base) => webContents.getAllWebContents().find(wc => wc.getURL().startsWith(base) && !wc.session.isPersistent()).executeJavaScript('localStorage.getItem("private-marker")'), base); assert.equal(cleanStorage, null);
    state = await cmd('state'); await cmd('close', { id: state.activeId }); await poll(s => !s.tabs.some(tab => tab.private), 'private cleanup');
    await cmd('navigate', { value: `${base}/download` }); await poll(s => s.downloads.some(item => item.status === 'completed' && item.received === 22), 'real download');
    assert.equal(fs.readFileSync(path.join(profile, 'sanad-test.txt'), 'utf8'), 'Sanad fixture download');
    await shell.getByRole('button', { name: 'أدوات المتصفح', exact: true }).click(); await shell.getByRole('button', { name: 'البحث في الصفحة', exact: true }).click();
    await shell.locator('#find-input').fill('Chromium');
    try { await shell.waitForFunction(() => document.querySelector('#find-count').textContent.includes('/2'), undefined, { timeout: 10000 }); }
    catch (error) { console.error({ find: await shell.locator('#find-count').textContent(), input: await shell.locator('#find-input').inputValue(), state: await cmd('state'), pages: await app.evaluate(({ webContents }) => webContents.getAllWebContents().map(wc => ({ url: wc.getURL(), type: wc.getType() }))) }); throw error; }
    const layoutDeadline = Date.now() + 5000; let visibleBelowFind = false;
    while (Date.now() < layoutDeadline && !visibleBelowFind) { visibleBelowFind = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.some(view => { const rect = view.getBounds(); return rect.y > 140 && rect.height > 100 && view.getVisible(); })); if (!visibleBelowFind) await new Promise(resolve => setTimeout(resolve, 50)); }
    assert(visibleBelowFind, 'the actual page remains visible below the find bar after layout');
    await shell.getByRole('button', { name: 'إغلاق البحث في الصفحة' }).click();
    await shell.getByRole('button', { name: 'حماية الخصوصية', exact: true }).click(); await shell.getByRole('checkbox').uncheck(); assert.equal((await cmd('state')).preferences.protection, false); await shell.getByRole('checkbox').check();
    await shell.getByRole('button', { name: 'إغلاق', exact: true }).click();
    await cmd('diagnostics'); state = await cmd('state'); const metrics = state.tabs.find(tab => tab.id === state.activeId).diagnostics; assert(metrics.dom >= 0); assert(metrics.load >= 0); assert.equal(typeof metrics.gpu, 'string');
    await cmd('save-pdf'); assert.equal(fs.readFileSync(path.join(profile, 'sanad-page.pdf')).subarray(0, 5).toString(), '%PDF-');
    await cmd('save-image'); const png = fs.readFileSync(path.join(profile, 'sanad-page.png')); assert.equal(png.subarray(1, 4).toString(), 'PNG'); assert(png.readUInt32BE(16) > 100 && png.readUInt32BE(20) > 100);
    await cmd('save-offline'); const mhtml = fs.readFileSync(path.join(profile, 'sanad-page.mhtml'), 'utf8'); assert.match(mhtml, /multipart\/related/); assert.match(mhtml, /Sanad test page/);
    await app.evaluate(({ webContents }, base) => webContents.getAllWebContents().find(wc => wc.getURL().startsWith(base) && wc.getURL().endsWith('/second')).executeJavaScript(`document.body.innerHTML = '<article><h1>Readable fixture</h1>'+Array.from({length:8},(_,i)=>'<p>Reader paragraph '+i+' contains actual article content, with enough detail to identify this text as a useful article. This text remains local and the original document stays intact.</p>').join('')+'</article>'; true`), base);
    await cmd('reader'); await shell.locator('.reader-article h2').waitFor(); assert.match(await shell.locator('.reader-text').textContent(), /Reader paragraph/); assert.equal(await shell.locator('.reader-article script').count(), 0);
    const originalParagraphs = await app.evaluate(({ webContents }, base) => webContents.getAllWebContents().find(wc => wc.getURL().startsWith(base) && wc.getURL().endsWith('/second')).executeJavaScript('document.querySelectorAll("article p").length'), base); assert.equal(originalParagraphs, 8);
    await shell.locator('#close-panel').click(); assert.equal((await cmd('state')).reader, null);
    assert.deepEqual(await onPage('({node:typeof require, bridge:typeof window.sanadBrowser, process:typeof process})'), { node: 'undefined', bridge: 'undefined', process: 'undefined' });
    const output = path.join(__dirname, '..', 'test-results'); fs.mkdirSync(output, { recursive: true }); await shell.screenshot({ path: path.join(output, 'desktop-shell.png') });
    state = await cmd('state'); assert(state.versions.chromium); assert.equal(state.versions.electron, require('../package.json').devDependencies.electron);
    await app.evaluate(async ({ session }) => session.fromPartition('persist:sanad-web').cookies.flushStore()); await app.close(); app = undefined;
    app = await electron.launch({ args: ['--no-sandbox', path.join(__dirname, '..')], env: { ...process.env, SANAD_BROWSER_TEST_MODE: '1', SANAD_BROWSER_TEST_PROFILE: profile, SANAD_BROWSER_TEST_URL: base }, timeout: 30000 }); await app.firstWindow();
    const reopenedCookies = await app.evaluate(({ session }, base) => session.fromPartition('persist:sanad-web').cookies.get({ url: base }), base); assert(reopenedCookies.some(cookie => cookie.name === 'regular-fixture' && cookie.value === 'regular'));
    console.log(JSON.stringify({ ok: true, chromium: state.versions.chromium, electron: state.versions.electron, checks: ['DOM-CSS-layout-JavaScript', 'navigation', 'no-remote-node-or-bridge', 'unsafe-protocol', 'tracker-blocking', 'real-secure-popup-opener', 'tabs', 'pin', 'mute', 'sleep-wake', 'restore', 'private-session-isolation', 'private-history', 'private-cookie-and-storage-reset', 'actual-download', 'find-visible-page', 'privacy-toggle', 'actual-timing-and-GPU-status', 'actual-PDF-rendering', 'actual-PNG-rendering', 'MHTML-offline-export', 'reader-text-with-original-page-intact', 'persistent-normal-session'] }));
  } finally { if (app) await app.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(profile, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });


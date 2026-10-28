'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-tabs-'));
  const requests = [];
  let releaseVersion = require('../package.json').version;
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      const pathname = new URL(request.url, 'http://fixture').pathname;
      requests.push({ path: pathname, method: request.method, body, referrer: request.headers.referer });
      if (pathname === '/release.json') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ schema: 1, version: releaseVersion, channel: 'preview', installation: 'manual', releaseUrl: `https://github.com/muradaljohani/Browser/releases/tag/desktop-v${releaseVersion}`, notes: ['تحسين التبويبات'] })); return; }
      if (pathname === '/redirect') { response.writeHead(302, { Location: '/redirected' }); response.end(); return; }
      if (pathname === '/blocked-redirect') { response.writeHead(302, { Location: 'file:///etc/passwd' }); response.end(); return; }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html><title>Fixture ${pathname}</title><style>body{padding:24px}a,button{display:block;margin:20px;padding:10px}</style>
        <a id="background" href="/background">Background</a>
        <a id="blank" target="_blank" href="/blank">Blank target</a>
        <a id="shift" href="/shift">Shift</a>
        <form id="post" method="post" action="/posted" target="_blank"><input name="query" value="C++ &amp; 100%"><button>Submit</button></form>`);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let app;
  try {
    app = await electron.launch({ args: ['--no-sandbox', path.join(__dirname, '..')], env: { ...process.env, SANAD_BROWSER_TEST_MODE: '1', SANAD_BROWSER_TEST_PROFILE: profile, SANAD_BROWSER_TEST_URL: base, SANAD_BROWSER_TEST_UPDATE_URL: base + "/release.json" } });
    const shell = await app.firstWindow();
    await shell.waitForFunction(() => Boolean(window.sanadBrowser));
    const cmd = (action, data = {}) => shell.evaluate(({ action, data }) => window.sanadBrowser.command(action, data), { action, data });
    const poll = async (predicate, label) => {
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline) { const state = await cmd('state'); if (predicate(state)) return state; await new Promise(resolve => setTimeout(resolve, 60)); }
      throw new Error(`Timed out: ${label}: ${JSON.stringify(await cmd('state'))}`);
    };
    const onPage = (pathname, source) => app.evaluate(({ webContents }, { base, pathname, source }) => {
      const wc = webContents.getAllWebContents().find(wc => wc.getURL() === base + pathname);
      if (!wc) throw new Error(`Missing fixture ${pathname}`);
      return wc.executeJavaScript(source, true);
    }, { base, pathname, source });
    const clickLink = (id, button = 'left', modifiers = []) => app.evaluate(async ({ webContents }, { base, id, button, modifiers }) => {
      const wc = webContents.getAllWebContents().find(wc => wc.getURL() === base + '/');
      const points = await wc.executeJavaScript(`Object.fromEntries([...document.querySelectorAll('a[id]')].map(link => { const r = link.getBoundingClientRect(); return [link.id, { x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2) }]; }))`);
      if (!Object.hasOwn(points, id)) throw new Error('Missing fixture link');
      const point = points[id];
      wc.sendInputEvent({ type: 'mouseDown', ...point, button, clickCount: 1, modifiers });
      wc.sendInputEvent({ type: 'mouseUp', ...point, button, clickCount: 1, modifiers });
    }, { base, id, button, modifiers });
    let state = await poll(s => s.tabs[0]?.title === 'Fixture /' && !s.tabs[0].loading, 'initial page');
    const openerId = state.activeId;
    const closeChildren = async () => {
      for (const tab of (await cmd('state')).tabs) if (tab.id !== openerId) await cmd('close', { id: tab.id });
      await poll(s => s.tabs.length === 1 && s.activeId === openerId, 'return to opener');
    };

    await clickLink('background', 'middle');
    state = await poll(s => s.tabs.length === 2 && s.tabs.some(tab => tab.title === 'Fixture /background' && !tab.loading), 'middle-click loads a background tab');
    assert.equal(state.activeId, openerId);
    assert(requests.find(request => request.path === '/background').referrer?.startsWith(base), 'normal referrer policy is preserved');
    await closeChildren();
    await clickLink('background', 'left', ['control']);
    state = await poll(s => s.tabs.length === 2 && s.tabs.some(tab => tab.title === 'Fixture /background' && !tab.loading), 'Ctrl-click loads background tab');
    assert.equal(state.activeId, openerId); await closeChildren();

    await clickLink('blank');
    state = await poll(s => s.tabs.length === 2 && s.tabs.some(tab => tab.title === 'Fixture /blank'), 'target blank stays in app');
    assert.notEqual(state.activeId, openerId); await closeChildren();
    await clickLink('shift', 'left', ['shift']);
    state = await poll(s => s.tabs.length === 2 && s.tabs.some(tab => tab.title === 'Fixture /shift'), 'Shift-click stays in app');
    assert.notEqual(state.activeId, openerId);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1, 'no external native windows');
    await closeChildren();

    await onPage('/', `document.querySelector('#post').requestSubmit(); true`);
    await poll(s => s.tabs.length === 2 && s.tabs.some(tab => tab.title === 'Fixture /posted'), 'POST target blank');
    const post = requests.find(request => request.path === '/posted');
    assert.equal(post.method, 'POST'); assert.equal(new URLSearchParams(post.body).get('query'), 'C++ & 100%');
    await closeChildren();

    await onPage('/', `window.child = window.open('${base}/named', 'sanad-named', 'width=200,nodeIntegration=yes,contextIsolation=no'); true`);
    await poll(s => s.tabs.length === 2 && s.tabs.some(tab => tab.title === 'Fixture /named'), 'named popup');
    assert.equal(await onPage('/named', 'window.opener !== null'), true);
    await onPage('/', `window.open('${base}/renamed', 'sanad-named'); true`);
    await poll(s => s.tabs.length === 2 && s.tabs.some(tab => tab.title === 'Fixture /renamed'), 'named popup reuse');
    const preferences = await app.evaluate(({ webContents }, base) => webContents.getAllWebContents().filter(wc => wc.getURL().startsWith(base)).map(wc => wc.getLastWebPreferences()), base);
    assert(preferences.every(p => p.sandbox && p.contextIsolation && !p.nodeIntegration && !p.preload));
    await onPage('/', 'window.child.close(); true');
    await poll(s => s.tabs.length === 1 && s.activeId === openerId, 'window.close removes popup tab and returns to opener');

    await onPage('/', `window.blankChild = window.open('about:blank', 'sanad-blank'); window.blankChild.document.title = 'Blank document'; true`);
    await poll(s => s.tabs.length === 2 && s.tabs.some(tab => tab.title === 'Blank document'), 'about blank opener workflow');
    await onPage('/', `window.blankChild.location.href = '${base}/from-blank'; true`);
    await poll(s => s.tabs.length === 2 && s.tabs.some(tab => tab.title === 'Fixture /from-blank'), 'blank popup navigation');
    await closeChildren();

    await cmd('navigate', { value: `${base}/redirect` });
    await poll(s => s.tabs.length === 1 && s.tabs[0].url === `${base}/redirected`, 'redirect remains in original tab');
    await cmd('navigate', { value: base }); await poll(s => s.tabs[0].title === 'Fixture /' && !s.tabs[0].loading, 'return home');
    assert.equal(await onPage('/', `window.open('file:///etc/passwd') === null`), true);
    assert.equal(await onPage('/', `window.open('https://user:secret@example.com') === null`), true);
    assert.equal((await cmd('state')).tabs.length, 1);

    await cmd('new', { private: true });
    state = await poll(s => s.tabs.some(tab => tab.private && tab.title === 'Fixture /' && !tab.loading), 'private opener');
    const privateId = state.activeId;
    await app.evaluate(({ webContents }, base) => webContents.getAllWebContents().find(wc => wc.getURL() === base + '/' && !wc.session.isPersistent()).executeJavaScript(`window.open('${base}/private-child'); true`, true), base);
    state = await poll(s => s.tabs.filter(tab => tab.private).length === 2 && s.tabs.some(tab => tab.title === 'Fixture /private-child'), 'private popup inherits session');
    const privateChild = state.tabs.find(tab => tab.title === 'Fixture /private-child').id;
    assert.equal(await app.evaluate(({ webContents }, base) => webContents.getAllWebContents().find(wc => wc.getURL() === base + '/private-child').session.isPersistent(), base), false);
    await cmd('close', { id: privateId });
    await poll(s => !s.tabs.some(tab => tab.id === privateId) && s.tabs.some(tab => tab.id === privateChild && !tab.sleeping), 'child survives opener closure');
    await cmd('close', { id: privateChild }); await closeChildren();

    await cmd('zoom', { value: 1.5 });
    await onPage('/', `window.open('${base}/zoom-child'); true`);
    await poll(s => s.tabs.length === 2 && s.tabs.some(tab => tab.title === 'Fixture /zoom-child'), 'independent zoom tab');
    const zoom = await app.evaluate(({ webContents }, base) => webContents.getAllWebContents().filter(wc => wc.getURL().startsWith(base)).map(wc => ({ url: wc.getURL(), value: wc.getZoomFactor() })), base);
    assert.equal(zoom.find(tab => tab.url === base + '/').value, 1.5);
    assert.equal(zoom.find(tab => tab.url === base + '/zoom-child').value, 1);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    await closeChildren();
    // Main state is coalesced before reaching the shell. Wait for its tab DOM,
    // otherwise a queued active-tab update correctly closes a just-opened panel.
    await shell.waitForFunction(() => document.querySelectorAll('#tabs [role=tab]').length === 1 && document.querySelector('#tabs [role=tab][aria-selected=true]')?.textContent.includes('Fixture /'));
    await shell.getByRole('button', { name: 'أدوات المتصفح', exact: true }).click();
    const aboutControl = await shell.getByRole('button', { name: 'حول Sanad', exact: true }).elementHandle();
    await shell.evaluate(() => new Promise((resolve, reject) => {
      const stop = window.sanadBrowser.onState(() => { stop(); resolve(); });
      window.sanadBrowser.command('toolbar-height', { value: 100 }).catch(error => { stop(); reject(error); });
    }));
    assert.equal(await aboutControl.evaluate(node => node.isConnected), true, 'unrelated state updates preserve the menu button being activated');
    await aboutControl.click();
    assert.equal(requests.filter(request => request.path === '/release.json').length, 0, 'development About does not automatically contact update feed');
    await shell.getByRole('button', { name: 'التحقق من التحديثات', exact: true }).click();
    await shell.getByRole('status').filter({ hasText: 'أنت تستخدم أحدث إصدار منشور' }).waitFor();
    await shell.getByRole('button', { name: 'نسخ تفاصيل الإصدار', exact: true }).click();
    assert((await app.evaluate(({ clipboard }) => clipboard.readText())).includes(`Sanad Browser ${releaseVersion}`));
    releaseVersion = require('../package.json').version.split('.').map((part, index) => index === 1 ? Number(part) + 1 : index === 2 ? 0 : Number(part)).join('.');
    await shell.getByRole('button', { name: 'التحقق من التحديثات', exact: true }).click();
    await shell.getByRole('status').filter({ hasText: `إصدار جديد متاح: ${releaseVersion}` }).waitFor();
    assert(await shell.getByRole('button', { name: 'فتح الإصدار الجديد' }).isVisible());
    assert((await shell.locator('.update-card').textContent()).includes('يدويًا'));
    fs.mkdirSync(path.join(__dirname, '../test-results'), { recursive: true });
    await shell.screenshot({ path: path.join(__dirname, '../test-results/about.png') });
    await shell.getByRole('button', { name: 'عرض التراخيص', exact: true }).click();
    assert((await shell.locator('.license-text').textContent()).includes('MIT'));
    await shell.getByRole('button', { name: 'تراخيص Chromium المرفقة', exact: true }).click();
    state = await poll(s => s.tabs.some(tab => tab.url === 'sanad-licenses://app/chromium' && !tab.loading), 'actual bundled Chromium licenses');
    const license = await app.evaluate(async ({ webContents }) => {
      const wc = webContents.getAllWebContents().find(wc => wc.getURL() === 'sanad-licenses://app/chromium');
      return { text: await wc.executeJavaScript('document.body.textContent'), preferences: wc.getLastWebPreferences() };
    });
    assert(license.text.includes('Chromium'), 'bundled license contents are displayed');
    assert(license.preferences.sandbox && !license.preferences.preload && !license.preferences.nodeIntegration);
    assert.equal(await shell.locator('#connection').getAttribute('aria-label'), 'مستند محلي');
    console.log(JSON.stringify({ ok: true, checks: ['middle-click background load', 'Ctrl-click background load', 'target blank', 'Shift-click internal tab', 'POST payload', 'named window reuse', 'sandboxed opener', 'script-close cleanup', 'about blank navigation', 'redirect', 'unsafe scheme rejection', 'private popup session', 'child outlives opener', 'independent tab zoom', 'one application window', 'About update states', 'manual installation disclosure', 'version copy', 'bundled licenses isolated'] }));
  } finally {
    if (app) await app.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });



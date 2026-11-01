'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-tab-strip-'));
  const server = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'alpha';
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>' + name.replace(/[<>&]/g, '') + '</title><style>body{font:20px Segoe UI;background:#edf6f1;color:#183e31;padding:40px}</style><h1>سَنَد الحرمين</h1><p>Tab interaction fixture</p>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let app;
  try {
    app = await electron.launch({ args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), path.join(__dirname, '..')], env: { ...process.env, SANAD_BROWSER_TEST_MODE: '1', SANAD_BROWSER_TEST_PROFILE: profile, SANAD_BROWSER_TEST_URL: base + '/alpha' }, timeout: 30000 });
    const shell = await app.firstWindow(); await shell.waitForFunction(() => Boolean(window.sanadBrowser));
    const errors = []; shell.on('pageerror', error => errors.push(error.message));
    const cmd = (action, data = {}) => shell.evaluate(({ action, data }) => window.sanadBrowser.command(action, data), { action, data });
    // CDP keyboard events can bypass Electron's before-input-event. Exercise native input instead.
    const shortcut = (keyCode, shift = false) => app.evaluate(({ BrowserWindow }, { keyCode, shift }) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      wc.focus();
      const modifiers = [process.platform === 'darwin' ? 'meta' : 'control', ...(shift ? ['shift'] : [])];
      wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    }, { keyCode, shift });
    const output = path.join(__dirname, '..', 'test-results'); fs.mkdirSync(output, { recursive: true });
    const screenshot = async name => {
      const png = await app.evaluate(async ({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; return (await win.capturePage({ x: 0, y: 0, width: win.getContentBounds().width, height: 110 })).toPNG().toString('base64'); });
      fs.writeFileSync(path.join(output, name), Buffer.from(png, 'base64'));
    };
    const poll = async (predicate, label) => { const end = Date.now() + 15000; let state; while (Date.now() < end) { state = await cmd('state'); if (predicate(state)) return state; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error(`Timed out ${label}: ${JSON.stringify(state)}`); };
    const select = id => shell.locator(`#tabs > .tab:not(.closing)[data-tab-id="${id}"] > .tab-select`);
    const close = id => shell.locator(`#tabs > .tab:not(.closing)[data-tab-id="${id}"] > .tab-close`);
    let state = await poll(s => s.tabs[0]?.title === 'alpha' && !s.tabs[0].loading, 'initial page');
    const alpha = state.activeId;
    await shell.evaluate(id => { window.__stableTab = document.querySelector(`[data-tab-id="${id}"]`); }, alpha);
    const renderer = await app.evaluate(({ webContents }, base) => webContents.getAllWebContents().find(wc => wc.getURL() === base + '/alpha').id, base);
    await app.evaluate(({ webContents }, id) => webContents.fromId(id).executeJavaScript('window.fixtureMarker=42;document.title="alpha <b>literal</b>"'), renderer);
    await poll(s => s.tabs[0].title === 'alpha <b>literal</b>', 'title update');
    assert.equal(await shell.evaluate(id => window.__stableTab === document.querySelector(`[data-tab-id="${id}"]`), alpha), true);
    assert.equal(await shell.locator('#tabs .tab-title b').count(), 0, 'page titles remain plain text');
    async function add(name) {
      await cmd('new', { private: false });
      const id = (await cmd('state')).activeId;
      await cmd('navigate', { value: base + '/' + name });
      await poll(s => s.tabs.some(t => t.id === id && t.title === name && !t.loading), 'new ' + name);
      return id;
    }
    const beta = await add('beta'), gamma = await add('gamma');
    await select(alpha).focus(); await select(alpha).press('End');
    await poll(s => s.activeId === gamma, 'End activates last tab');
    await shell.waitForFunction(id => document.activeElement?.closest('.tab')?.dataset.tabId === id, gamma);
    await select(gamma).press('ArrowRight'); await poll(s => s.activeId === beta, 'RTL arrow selects visual neighbour');
    await select(beta).press('Home'); await poll(s => s.activeId === alpha, 'Home activates first tab');
    await select(beta).click({ button: 'middle' });
    await poll(s => s.tabs.length === 2 && !s.tabs.some(t => t.id === beta), 'middle closes inactive tab');
    assert.equal((await cmd('state')).activeId, alpha);
    await cmd('zoom', { value: 1.3 }); await cmd('duplicate', { id: alpha });
    state = await poll(s => s.tabs.length === 3 && s.tabs.find(t => t.id === s.activeId)?.url === base + '/alpha' && !s.tabs.find(t => t.id === s.activeId).loading, 'duplicate');
    const duplicate = state.activeId; assert.equal(state.tabs.find(t => t.id === duplicate).zoom, 1.3);
    const target = await select(alpha).boundingBox();
    await select(duplicate).dragTo(select(alpha), { targetPosition: { x: target.width - 5, y: target.height / 2 } });
    await poll(s => s.tabs[0].id === duplicate, 'native drag reorder');
    assert.equal(await app.evaluate(({ webContents }, id) => webContents.fromId(id).executeJavaScript('window.fixtureMarker'), renderer), 42, 'reordering retains the original page renderer');
    assert.equal(await shell.evaluate(id => window.__stableTab === document.querySelector(`[data-tab-id="${id}"]`), alpha), true, 'moving neighbours retains DOM identity');
    await cmd('pin', { id: alpha }); await cmd('tab-move', { id: gamma, beforeId: alpha });
    state = await cmd('state'); assert.equal(state.tabs[0].id, alpha); assert.equal(state.tabs[0].pinned, true);
    await close(alpha).click(); await poll(s => !s.tabs.some(t => t.id === alpha), 'close pinned tab');
    await shortcut('T', true);
    await poll(s => s.tabs[0].pinned && s.tabs[0].url === base + '/alpha', 'restore pinned order');
    await shortcut('1'); await poll(s => s.activeId === s.tabs[0].id, 'native Ctrl+1');
    await shortcut('PageDown'); await poll(s => s.activeId === s.tabs[1].id, 'native Ctrl+PageDown');
    await poll(s => s.tabs.every(t => !t.loading), 'restored pages load');
    await shell.waitForFunction(() => document.querySelector('#tabs').getAnimations({ subtree: true }).length === 0);
    await shell.getByRole('button', { name: 'تمرير إلى التبويبات التالية', exact: true }).waitFor({ state: 'hidden' });
    await screenshot('tab-strip.png');
    await shell.getByRole('button', { name: 'تبويب جديد', exact: true }).click();
    await shell.waitForFunction(() => document.activeElement?.id === 'address');
    await cmd('new', { private: true });
    const privateCount = (await cmd('state')).tabs.filter(t => t.private).length;
    await shell.getByRole('button', { name: 'تبويب جديد', exact: true }).click();
    await poll(s => s.tabs.filter(t => t.private).length === privateCount + 1 && s.tabs.find(t => t.id === s.activeId).private, 'private new tab inherits mode');
    for (const name of ['delta', 'epsilon', 'zeta', 'eta']) await add(name);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 650));
    await shell.getByRole('button', { name: 'تمرير إلى التبويبات التالية', exact: true }).waitFor({ state: 'visible' });
    await shell.waitForFunction(() => document.querySelector('#tabs').getAnimations({ subtree: true }).every(animation => !animation.effect?.target?.classList.contains('tab')));
    state = await cmd('state'); assert.equal(await shell.locator('#tab-count').textContent(), String(state.tabs.length));
    assert.equal(await shell.locator('#tabs').evaluate(root => root.scrollHeight <= root.clientHeight), true, 'overflow remains horizontal without clipping tabs vertically');
    await shell.emulateMedia({ reducedMotion: 'reduce' });
    await cmd('new', { private: false });
    await shell.waitForFunction(() => document.querySelector('#tabs').getAnimations({ subtree: true }).length === 0);
    assert.deepEqual(errors, []);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 860));
    await screenshot('tab-strip-overflow.png');
    console.log(JSON.stringify({ ok: true, checks: ['stable-DOM-on-title-and-state', 'plain-text-title', 'RTL-arrow-Home-End-focus', 'middle-close-without-activation', 'drag-without-reloading', 'pinned-boundary', 'restore-pinned', 'new-address-focus', 'private-successor', 'duplicate-zoom', 'overflow-count', 'reduced-motion'] }));
  } finally { if (app) await app.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(profile, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

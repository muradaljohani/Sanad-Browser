'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-menu-'));
  const output = path.join(__dirname, '..', 'test-results'); fs.mkdirSync(output, { recursive: true });
  const article = 'هذه صفحة اختبار لقراءة المحتوى والتنقل داخل متصفح سَنَد الحرمين. نحافظ على الصفحات عند فتح القائمة وإغلاقها، وتظل إجراءات البحث الصارم مطبّقة في كل وقت. '.repeat(18);
  const server = http.createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(`<!doctype html><html lang="ar" dir="rtl"><title>سَنَد الحرمين · صفحة الاختبار</title><style>body{margin:0;padding:60px 10%;background:#f6f8fc;color:#263238;font:18px/1.9 Tahoma}article{max-width:800px}h1{color:#137333;font-size:32px}</style><article><h1>مرحبًا بك في سَنَد الحرمين</h1><p>${article}</p></article></html>`); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let app, shell;
  try {
    app = await electron.launch({ args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), path.join(__dirname, '..')], env: { ...process.env, SANAD_BROWSER_TEST_MODE: '1', SANAD_BROWSER_TEST_PROFILE: profile, SANAD_BROWSER_TEST_URL: base }, timeout: 30000 });
    shell = await app.firstWindow(); await shell.waitForFunction(() => Boolean(window.sanadBrowser));
    const errors = []; shell.on('pageerror', error => errors.push(error.message));
    const cmd = (action, data = {}) => shell.evaluate(({ action, data }) => window.sanadBrowser.command(action, data), { action, data });
    const poll = async (predicate, label) => { const end = Date.now() + 15000; let state; while (Date.now() < end) { state = await cmd('state'); if (predicate(state)) return state; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error(`Timed out ${label}: ${JSON.stringify(state)}`); };
    const control = label => shell.getByRole('button', { name: label, exact: true });
    const heading = label => shell.getByRole('heading', { name: label, exact: true }).waitFor();
    const menu = async () => { const id = (await cmd('state')).activeId; await shell.waitForFunction(id => document.querySelector('#tabs .tab.active')?.dataset.tabId === id, id); await control('أدوات المتصفح').click(); await shell.locator('#panel.browser-menu[open]').waitFor(); };
    const dismiss = async () => { await control('إغلاق').click(); await shell.locator('#panel').waitFor({ state: 'hidden' }); };
    const shortcut = (keyCode, shift = false) => app.evaluate(({ BrowserWindow }, { keyCode, shift }) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents; wc.focus(); const modifiers = [process.platform === 'darwin' ? 'meta' : 'control', ...(shift ? ['shift'] : [])];
      wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    }, { keyCode, shift });
    let state = await poll(s => s.tabs[0]?.title.includes('صفحة الاختبار') && !s.tabs[0].loading, 'fixture');
    const original = state.activeId;
    await shell.waitForFunction(() => document.querySelector('#tabs [aria-selected=true]')?.textContent.includes('صفحة الاختبار'));
    await app.evaluate(({ webContents }, base) => webContents.getAllWebContents().find(wc => wc.getURL() === base + '/').executeJavaScript('window.pageMarker=99'), base);
    await menu();
    assert.equal(await control('استعادة آخر تبويب مغلق').isDisabled(), true);
    await control('علامة تبويب جديدة').press('ArrowDown'); assert.equal(await control('علامة تبويب خاصة').evaluate(node => node === document.activeElement), true);
    await shell.evaluate(() => { window.menuZoomButton = document.querySelector('[aria-label="تكبير الصفحة"]'); });
    await control('تكبير الصفحة').click(); await poll(s => s.tabs[0].zoom === 1.1, 'zoom action');
    assert.equal(await shell.evaluate(() => window.menuZoomButton === document.querySelector('[aria-label="تكبير الصفحة"]') && window.menuZoomButton === document.activeElement), true, 'zoom updates retain the button and focus');
    await control('إعادة حجم الصفحة إلى 100%').click(); await poll(s => s.tabs[0].zoom === 1, 'zoom reset');
    await control('المظهر النهاري').click(); await poll(s => s.preferences.theme === 'light', 'theme action');
    await shell.locator('#page-preview').waitFor({ state: 'visible' });
    await shell.screenshot({ path: path.join(output, 'chrome-style-menu-light.png') });
    await control('البحث الصارم مفعّل ومقفل').click(); await heading('إجراء البحث الصارم');
    assert.equal(await shell.locator('#panel input,#panel select').count(), 0);
    assert((await shell.locator('#panel-content').textContent()).includes('لا يوجد خيار لإيقافه'));
    assert.equal(await shell.locator('#strict-search').evaluate(node => getComputedStyle(node).color), 'rgb(19, 115, 51)');
    assert.deepEqual((await cmd('state')).searchPolicy, { level: 'strict', locked: true });
    await shell.screenshot({ path: path.join(output, 'strict-search-procedure-light.png') });
    await dismiss();
    assert.equal(await shell.locator('#page-preview').getAttribute('src'), null, 'the page image is discarded after closing');
    assert.equal(await app.evaluate(({ webContents }, base) => webContents.getAllWebContents().find(wc => wc.getURL() === base + '/').executeJavaScript('window.pageMarker'), base), 99);
    await control('البحث الصارم مفعّل ومقفل؛ عرض الإجراء المطبّق').click(); await heading('إجراء البحث الصارم'); await dismiss();
    for (const [key, shift, title] of [['H', false, 'السجل على هذا الجهاز'], ['J', false, 'التنزيلات'], ['O', true, 'المفضلة']]) { await shortcut(key, shift); await heading(title); await dismiss(); }
    for (const [label, title] of [['السجل', 'السجل على هذا الجهاز'], ['التنزيلات', 'التنزيلات'], ['المفضلة', 'المفضلة'], ['البحث في التبويبات', 'التبويبات'], ['حماية الخصوصية', 'حماية الخصوصية'], ['حول Sanad', 'حول Sanad']]) { await menu(); await shell.locator('#panel').getByRole('button', { name: label, exact: true }).click(); await heading(title); await dismiss(); }
    await menu(); await control('علامة تبويب جديدة').click(); state = await poll(s => s.tabs.length === 2 && s.activeId !== original, 'new tab from menu');
    const ordinary = state.activeId; await shell.waitForFunction(() => document.activeElement?.id === 'address');
    await cmd('close', { id: ordinary }); await poll(s => s.tabs.length === 1 && s.activeId === original, 'close ordinary');
    await menu(); await control('استعادة آخر تبويب مغلق').click(); await poll(s => s.tabs.length === 2, 'restore menu');
    await cmd('close', { id: (await cmd('state')).activeId }); await poll(s => s.tabs.length === 1, 'return to original');
    await menu(); await control('علامة تبويب خاصة').click(); state = await poll(s => s.tabs.some(t => t.private && t.id === s.activeId), 'private menu');
    await cmd('close', { id: state.activeId }); await poll(s => s.tabs.length === 1 && s.activeId === original, 'close private');
    await poll(s => !s.tabs[0].loading, 'ready for exports');
    for (const [label, filename] of [['حفظ الصفحة PDF', 'sanad-page.pdf'], ['حفظ صورة الصفحة', 'sanad-page.png'], ['حفظ نسخة دون اتصال', 'sanad-page.mhtml']]) {
      await menu(); await shell.locator('summary').filter({ hasText: 'الحفظ والمشاركة' }).click(); await control(label).click();
      const file = path.join(profile, filename); const end = Date.now() + 15000; while (!fs.existsSync(file) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 50));
      assert(fs.statSync(file).size > 100, 'real export ' + filename);
    }
    await app.evaluate(({ webContents }, base) => { const wc = webContents.getAllWebContents().find(wc => wc.getURL() === base + '/'); wc.testPrints = []; wc.print = (options, callback) => { wc.testPrints.push(options); callback(true); }; }, base);
    await menu(); await control('طباعة…').click(); await shortcut('P');
    assert.deepEqual(await app.evaluate(({ webContents }, base) => webContents.getAllWebContents().find(wc => wc.getURL() === base + '/').testPrints, base), [{ silent: false, printBackground: true }, { silent: false, printBackground: true }]);
    await menu(); await control('البحث في الصفحة').click(); await shell.locator('#find-input').fill('سَنَد'); await shell.locator('#find-count').filter({ hasText: /\d/ }).waitFor(); await control('إغلاق البحث في الصفحة').click();
    await menu(); await control('وضع القراءة').click(); await heading('وضع القراءة'); await shell.locator('.reader-text').waitFor(); await dismiss();
    await menu(); await shell.locator('summary').filter({ hasText: 'المزيد من الأدوات' }).click(); await control('أداء الصفحة').click(); await heading('أداء الصفحة'); await shell.locator('.details strong').first().waitFor(); await dismiss();
    await menu(); await shell.locator('summary').filter({ hasText: 'المزيد من الأدوات' }).click(); await control('أدوات المطور').click();
    const end = Date.now() + 10000; while (!await app.evaluate(({ webContents }, base) => webContents.getAllWebContents().find(wc => wc.getURL() === base + '/').isDevToolsOpened(), base) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(await app.evaluate(({ webContents }, base) => { const wc = webContents.getAllWebContents().find(wc => wc.getURL() === base + '/'); const open = wc.isDevToolsOpened(); wc.closeDevTools(); return open; }, base), true);
    await cmd('protection', { value: false }); assert.deepEqual((await cmd('state')).searchPolicy, { level: 'strict', locked: true }); await cmd('protection', { value: true });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, checks: ['real-grouped-menu-actions', 'menu-arrow-navigation', 'stable-zoom-focus', 'light-theme', 'raster-preview-no-page-reload-and-discard-on-close', 'green-locked-search-procedure', 'native-history-download-bookmark-shortcuts', 'new-private-restore-menu', 'real-PDF-PNG-MHTML-exports', 'system-print-dispatch', 'find-reader-performance-devtools', 'strict-independent-of-adblock'] }));
  } catch (error) { if (shell && !shell.isClosed()) await shell.screenshot({ path: path.join(output, 'browser-menu-failure.png') }).catch(() => {}); throw error;
  } finally { if (app) await app.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(profile, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

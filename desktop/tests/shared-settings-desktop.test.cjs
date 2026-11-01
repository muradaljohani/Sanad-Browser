'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-shared-settings-')), output = path.join(__dirname, '..', 'test-results'); fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((request, response) => {
    if (request.url === '/icon.svg') { response.writeHead(200, { 'Content-Type': 'image/svg+xml' }); response.end('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="#137333"/><path d="M9 10h14v4H13v3h10v7H9v-4h10v-1H9z" fill="white"/></svg>'); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end('<!doctype html><html lang="ar" dir="rtl"><title>سَنَد الحرمين · الإعدادات المشتركة</title><link rel="icon" href="/icon.svg"><style>body{font:20px/1.8 Tahoma;background:#edf4ef;color:#1f4933;padding:45px}</style><h1>سَنَد الحرمين</h1><p>واجهة إعدادات واحدة للويب والتطبيق</p></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${server.address().port}`;
  let app, shell;
  try {
    app = await electron.launch({ args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), path.join(__dirname, '..')], env: { ...process.env, SANAD_BROWSER_TEST_MODE: '1', SANAD_BROWSER_TEST_PROFILE: profile, SANAD_BROWSER_TEST_URL: base }, timeout: 30000 });
    shell = await app.firstWindow(); await shell.waitForFunction(() => Boolean(window.sanadBrowser));
    const errors = []; shell.on('pageerror', error => errors.push(error.message));
    const cmd = (action, data = {}) => shell.evaluate(({ action, data }) => window.sanadBrowser.command(action, data), { action, data });
    const poll = async (predicate, label) => { const end = Date.now() + 15000; let state; while (Date.now() < end) { state = await cmd('state'); if (predicate(state)) return state; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error(`Timed out ${label}: ${JSON.stringify(state)}`); };
    const panel = shell.locator('#panel');
    const settings = async () => { await cmd('settings'); await panel.getByRole('heading', { name: 'إعدادات المتصفح', exact: true }).waitFor(); await panel.getByLabel('لغة نتائج البحث', { exact: true }).waitFor(); };
    const close = async () => { await shell.locator('#close-panel').click(); await panel.waitFor({ state: 'hidden' }); };
    let state = await poll(s => s.tabs[0]?.title.includes('الإعدادات المشتركة') && !s.tabs[0].loading && s.tabs[0].favicon, 'real favicon');
    const original = state.activeId;
    await shell.locator('#tabs .tab.active .tab-site-symbol img').waitFor({ state: 'visible' });
    assert(await shell.locator('#tabs .tab.active .tab-site-symbol img').evaluate(node => node.complete && node.naturalWidth > 0));
    await settings();
    await panel.getByLabel('لغة نتائج البحث', { exact: true }).selectOption('ar'); await panel.getByLabel('منطقة البحث', { exact: true }).selectOption('sa');
    await poll(s => s.preferences.search.language === 'ar' && s.preferences.search.country === 'sa', 'shared locale');
    await panel.getByRole('button', { name: 'المظهر', exact: true }).click(); await panel.getByLabel('مظهر المتصفح', { exact: true }).selectOption('light');
    await poll(s => s.preferences.theme === 'light', 'native theme via shared settings'); await panel.getByRole('button', { name: 'البحث', exact: true }).click();
    await shell.waitForFunction(() => getComputedStyle(document.querySelector('.tab.active')).backgroundColor === 'rgb(255, 255, 255)');
    await shell.screenshot({ path: path.join(output, 'shared-settings-light.png') });
    assert.equal(await panel.getByRole('status', { name: 'البحث الصارم مفعّل ومقفل', exact: true }).evaluate(node => getComputedStyle(node).color), 'rgb(19, 115, 51)'); await close();
    await app.evaluate(({ session }) => {
      const ses = session.fromPartition('persist:sanad-web'); ses.testSuggestions = [];
      ses.protocol.handle('https', async request => {
        const url = new URL(request.url);
        if (url.pathname === '/api/browser/suggest') { const body = await request.json(); ses.testSuggestions.push(body); return Response.json({ suggestions: [body.q + ' browser', body.q + ' docs'] }); }
        if (url.pathname === '/child') return new Response('<!doctype html><title>Child</title>', { headers: { 'Content-Type': 'text/html' } });
        return new Response('<!doctype html><title>Official settings fixture</title><script>window.received=[];addEventListener("sanad-native-preferences",event=>received.push(JSON.parse(event.detail)))</script><h1>Sanad</h1><a id="settings" href="https://sanadbrowser.com/web/?surface=desktop&panel=native-settings">Settings</a><iframe src="/child"></iframe>', { headers: { 'Content-Type': 'text/html' } });
      });
    });
    await cmd('new', { private: false }); const official = (await cmd('state')).activeId;
    await cmd('navigate', { value: 'https://sanadbrowser.com/web/?surface=desktop' }); await poll(s => s.tabs.some(t => t.id === official && t.title === 'Official settings fixture' && !t.loading), 'official page');
    const readOfficial = expression => app.evaluate(({ webContents }, expression) => webContents.getAllWebContents().find(wc => wc.getURL().startsWith('https://sanadbrowser.com/web/')).executeJavaScript(expression), expression);
    let native; const end = Date.now() + 10000; while (!(native = await readOfficial('JSON.parse(document.querySelector(\'meta[name="sanad-native-preferences"]\')?.content || "null")')) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(native.language, 'ar'); assert.equal(native.country, 'sa'); assert.equal(native.theme, 'light'); assert.equal(native.safeSearch, 'strict');
    assert.deepEqual(await readOfficial('[typeof require,typeof process,typeof window.sanadBrowser,typeof window.sanadPreferences]'), ['undefined', 'undefined', 'undefined', 'undefined']);
    assert.equal(await readOfficial('frames[0].document.querySelector(\'meta[name="sanad-native-preferences"]\') === null'), true);
    await readOfficial('document.querySelector("#settings").click();true'); await panel.getByRole('heading', { name: 'إعدادات المتصفح', exact: true }).waitFor(); await close();
    assert.equal((await cmd('state')).tabs.find(t => t.id === official).title, 'Official settings fixture');
    await settings(); await panel.getByRole('button', { name: 'الأداء', exact: true }).click(); await panel.getByRole('button', { name: 'مسح النسخ المؤقتة', exact: true }).click(); await close();
    assert(await readOfficial('received.some(event=>event.action==="clear-cache")'));
    const address = shell.getByRole('combobox', { name: 'عنوان الموقع أو عبارة البحث', exact: true });
    await address.fill('sana'); await address.fill('sanad'); await shell.getByRole('option', { name: 'sanad docs', exact: true }).waitFor();
    assert.deepEqual(await app.evaluate(({ session }) => session.fromPartition('persist:sanad-web').testSuggestions), [{ q: 'sanad', safeSearch: 'strict' }]);
    await address.press('ArrowDown'); await address.press('Escape'); assert.equal(await shell.locator('#address-suggestions').isVisible(), false);
    await settings(); await panel.getByRole('button', { name: 'الخصوصية', exact: true }).click(); await panel.getByRole('switch', { name: 'حفظ سجل البحث والزيارات', exact: true }).uncheck(); await panel.getByRole('switch', { name: 'اقتراحات البحث من الويب', exact: true }).uncheck();
    await poll(s => !s.preferences.search.saveHistory && !s.preferences.search.remoteSuggestions, 'privacy settings apply natively'); await close();
    const count = (await cmd('state')).history.length;
    await address.fill('private fragment'); await shell.waitForTimeout(220); assert.equal((await app.evaluate(({ session }) => session.fromPartition('persist:sanad-web').testSuggestions)).length, 1); await address.press('Escape');
    await cmd('navigate', { value: base + '/not-recorded' }); await poll(s => s.tabs.find(t => t.id === official)?.url.endsWith('/not-recorded') && !s.tabs.find(t => t.id === official)?.loading, 'history disabled'); assert.equal((await cmd('state')).history.length, count);
    await settings(); await panel.getByRole('button', { name: 'استعادة الإعدادات الافتراضية', exact: true }).click(); await poll(s => s.preferences.search.language === 'auto' && s.preferences.search.saveHistory && s.preferences.search.remoteSuggestions, 'shared reset');
    await panel.getByRole('button', { name: 'خيارات التطبيق', exact: true }).click(); await panel.getByRole('button', { name: 'فتح خيارات التطبيق', exact: true }).click(); await panel.getByRole('heading', { name: 'حماية الخصوصية', exact: true }).waitFor(); await close();
    assert.equal((await cmd('state')).searchPolicy.level, 'strict'); assert.deepEqual(errors, []);
    await cmd('close', { id: official }); await poll(s => s.tabs.length === 1 && s.activeId === original, 'restore original page');
    console.log(JSON.stringify({ ok: true, checks: ['same-React-settings-offline', 'locale-and-window-theme', 'green-strict-lock', 'one-way-official-top-frame-settings', 'no-native-API-on-websites', 'settings-without-page-reload', 'cache-clear', 'real-favicon', '150ms-autocomplete-and-Escape', 'disabled-suggestions-no-transmission', 'native-history-disabled', 'reset-and-app-only-section'] }));
  } catch (error) { if (shell && !shell.isClosed()) await shell.screenshot({ path: path.join(output, 'shared-settings-failure.png') }).catch(() => {}); throw error;
  } finally { if (app) await app.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(profile, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

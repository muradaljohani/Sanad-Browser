'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, session, protocol, dialog, shell, clipboard, Menu, nativeTheme, safeStorage, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readBoundedText } = require('./bounded-file.cjs');
const { brandedUserAgent } = require('./user-agent.cjs');
const { moveTabBefore } = require('./tab-order.cjs');
const { readNetworkPrivacy, writeNetworkPrivacy, configureStartupPrivacy, configureSessionPrivacy, hardenWebContents, locationPermissionAllowed, validateConfig } = require('./location-privacy.cjs');
const { HOME, MAX_TABS, safeURL, resolveDestination, cleanURL, nativeSiteURL, mayRemember, sanitizeBookmarks, trustedSender } = require('./policy.cjs');
const { openEncryptedStore } = require('./store.cjs');
const { createProtection } = require('./protection.cjs');
const { pageActions } = require('./page-actions.cjs');
const { createUpdateChecker, UPDATE_FEED } = require('./updates.cjs');
const { STORE_UPDATES_URI, createStoreUpdateChecker } = require('./store-distribution.cjs');
const storeDistribution = process.windowsStore === true;
const { unsafeStartupSwitch, downloadName, executableDownload, downloadSourceAllowed } = require('./security.cjs');
const { YOUTUBE_STYLES, isYouTube, youtubeGuardScript } = require('./youtube-guard.cjs');
const { createYouTubeInjection } = require('./youtube-injection.cjs');
if (app.isPackaged && unsafeStartupSwitch(app.commandLine)) app.exit(1);
app.enableSandbox();
const readabilitySource = fs.readFileSync(require.resolve('@mozilla/readability/Readability.js'), 'utf8');
const testMode = !app.isPackaged && process.env.SANAD_BROWSER_TEST_MODE === '1';
const homeURL = testMode && safeURL(process.env.SANAD_BROWSER_TEST_URL, true) ? process.env.SANAD_BROWSER_TEST_URL : HOME;
if (testMode && process.env.SANAD_BROWSER_TEST_PROFILE) app.setPath('userData', process.env.SANAD_BROWSER_TEST_PROFILE);
app.setName('Sanad Browser');
// Keep original launch arguments: runtime proxy switches must not survive disabling the mode.
const relaunchArgs = process.argv.slice(1);
// Read the non-secret routing preference before Chromium creates a network service.
let networkPrivacy, privacyStartupError;
try { networkPrivacy = readNetworkPrivacy(app.getPath('userData')); }
catch (error) { privacyStartupError = error; networkPrivacy = { version: 1, enabled: true, port: 1024 }; }
configureStartupPrivacy(app.commandLine, networkPrivacy);
app.on('web-contents-created', (_event, wc) => hardenWebContents(wc));
// Set the global default before creating any sessions, windows or popups.
app.userAgentFallback = brandedUserAgent(app.userAgentFallback, app.getVersion());
protocol.registerSchemesAsPrivileged([{ scheme: 'sanad-app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }, { scheme: 'sanad-licenses', privileges: { standard: true, secure: true } }]);
let win, store, protection, regularSession, privateSession, updates;
const licenceNotices = fs.readFileSync(path.join(__dirname, 'LICENSE'), 'utf8') + '\n\n' + fs.readFileSync(path.join(__dirname, 'THIRD_PARTY_NOTICES.md'), 'utf8');
let activeId, toolbarHeight = 100, overlay = false, notice = '';
let updatingProtection = false, shuttingDown = false;
let publishTimer;
const tabs = [], closedTabs = [], downloads = new Map(), permissionGrants = new Map();
const preparedSessions = new Set();
const sessionSetup = new WeakMap();
const localFiles = new Map([
  ['/index.html', ['ui/index.html', 'text/html; charset=utf-8']],
  ['/renderer.js', ['ui/renderer.js', 'text/javascript; charset=utf-8']],
  ['/tab-strip.js', ['ui/tab-strip.js', 'text/javascript; charset=utf-8']],
  ['/browser.css', ['ui/browser.css', 'text/css; charset=utf-8']],
  ['/mark.png', ['assets/mark.png', 'image/png']],
  ['/wordmark.svg', ['assets/wordmark.svg', 'image/svg+xml']]
]);
const preferences = ses => ({ session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, backgroundThrottling: true });
const active = () => tabs.find(tab => tab.id === activeId);
const contents = () => active()?.view?.webContents;
const publicDownload = item => ({ id: item.id, name: item.name, status: item.status, received: item.received, total: item.total, private: item.private });
function snapshot() {
  return {
    tabs: tabs.map(tab => ({ id: tab.id, title: tab.title, url: tab.url, private: tab.private, pinned: tab.pinned, muted: tab.muted, closing: Boolean(tab.closing), sleeping: !tab.view, loading: Boolean(tab.view?.webContents.isLoading()), back: Boolean(tab.view?.webContents.navigationHistory.canGoBack()), forward: Boolean(tab.view?.webContents.navigationHistory.canGoForward()), blocked: tab.blocked, error: tab.error, zoom: tab.zoom, diagnostics: tab.diagnostics || null })),
    activeId, preferences: store.state.preferences, bookmarks: store.state.bookmarks, history: store.state.history,
    downloads: [...downloads.values()].map(publicDownload), closedCount: closedTabs.length,
    notice, reader: active()?.reader || null, protectionSource: protection.source(), protectionRevision: protection.revision(), updatingProtection,
    versions: { chromium: process.versions.chrome, electron: process.versions.electron, app: app.getVersion(), platform: process.platform, arch: process.arch, packaged: app.isPackaged, distribution: storeDistribution ? 'microsoft-store' : 'direct' },
    updates: updates?.snapshot(), storageProtection: store.storageProtection, licenceNotices,
    locationPrivacy: { enabled: networkPrivacy.enabled, port: networkPrivacy.port, routing: networkPrivacy.enabled ? 'configured-unverified' : 'system', geolocation: 'blocked' }
  };
}
function publish() {
  if (publishTimer || shuttingDown) return;
  publishTimer = setTimeout(() => { publishTimer = null; if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('sanad-browser:state', snapshot()); }, 50);
}
function message(value) { notice = String(value).slice(0, 250); publish(); }
function layout() {
  if (!win || win.isDestroyed()) return;
  const [width, height] = win.getContentSize();
  for (const tab of tabs) if (tab.view) {
    tab.view.setBounds({ x: 0, y: toolbarHeight, width, height: Math.max(1, height - toolbarHeight) });
    tab.view.setVisible(tab.id === activeId && !overlay);
  }
}
function focusAddress() { win?.webContents.focus(); win?.webContents.send('sanad-browser:focus-address'); }
function openPanel(name) { overlay = name !== 'find'; layout(); win?.webContents.focus(); win?.webContents.send('sanad-browser:open-panel', name); }
function prepareSession(ses) {
  if (preparedSessions.has(ses)) return;
  preparedSessions.add(ses);
  const ready = configureSessionPrivacy(ses, networkPrivacy);
  sessionSetup.set(ses, ready);
  void ready.catch(() => app.exit(1));
  ses.protocol.handle('sanad-licenses', request => {
    if (new URL(request.url).hostname !== 'app' || new URL(request.url).pathname !== '/chromium') return new Response('Not found', { status: 404 });
    const filename = path.join(path.dirname(app.getPath('exe')), 'LICENSES.chromium.html');
    try { return new Response(fs.readFileSync(filename), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" } }); }
    catch { return new Response('ملف تراخيص Chromium غير متاح في هذه الحزمة.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
  });
  // Identify our own desktop surface after normal site navigation, including return links.
  ses.setUserAgent(brandedUserAgent(ses.getUserAgent(), app.getVersion()));
  protection.set(ses, store.state.preferences.protection);
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => locationPermissionAllowed(permission, permissionGrants.get(`${ses === privateSession ? 'private' : 'regular'}:${requestingOrigin}:${permission}`)));
  ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    if (permission === 'geolocation') return callback(false);
    const tab = tabs.find(item => item.view?.webContents === wc);
    const url = safeURL(details.requestingUrl || wc.getURL(), testMode);
    const supported = new Set(['media', 'geolocation', 'notifications']);
    if (!tab || tab.id !== activeId || !url || !supported.has(permission)) return callback(false);
    const origin = new URL(url).origin;
    const key = `${tab.private ? 'private' : 'regular'}:${origin}:${permission}`;
    const known = permissionGrants.get(key);
    if (known !== undefined) return callback(known);
    if (testMode) return callback(false);
    const names = { media: 'الكاميرا أو الميكروفون', geolocation: 'موقعك', notifications: 'الإشعارات' };
    try {
      const result = await dialog.showMessageBox(win, { type: 'question', title: 'إذن الموقع', message: `${origin}\nيطلب الوصول إلى ${names[permission]}.`, buttons: ['رفض', 'السماح لهذه الجلسة'], defaultId: 0, cancelId: 0, noLink: true });
      const allow = result.response === 1 && !wc.isDestroyed() && new URL(wc.getURL()).origin === origin;
      permissionGrants.set(key, allow); callback(allow);
    } catch { callback(false); }
  });
  ses.setDevicePermissionHandler(() => false);
  ses.on('file-system-access-restricted', (_event, _details, callback) => callback({ action: 'deny' }));
  ses.on('will-download', (event, item, wc) => {
    const source = tabs.find(tab => tab.view?.webContents === wc);
    const ongoing = [...downloads.values()].filter(entry => ['progressing', 'paused'].includes(entry.status));
    const pageURL = wc?.getURL();
    if (!source || source.id !== activeId || ongoing.length >= 3 || !downloadSourceAllowed(item.getURLChain(), pageURL, safeURL, testMode)) { event.preventDefault(); message('مُنع تنزيل من تبويب غير نشط أو غير آمن، أو تجاوز حد التنزيلات المتزامنة.'); return; }
    const name = downloadName(item.getFilename());
    const entry = { id: crypto.randomUUID(), name, received: 0, total: item.getTotalBytes(), status: 'progressing', private: Boolean(source.private), item, path: '' };
    if (!testMode) item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), name) });
    if (downloads.size >= 200) for (const [id, old] of downloads) { if (!['progressing', 'paused'].includes(old.status)) downloads.delete(id); if (downloads.size < 150) break; }
    if (testMode) item.setSavePath(path.join(app.getPath('userData'), entry.name.replace(/[^a-zA-Z0-9._-]/g, '_')));
    downloads.set(entry.id, entry);
    if (!testMode && executableDownload(name)) {
      item.pause();
      void dialog.showMessageBox(win, { type: 'warning', title: 'تنزيل ملف قابل للتشغيل', message: `${new URL(item.getURL()).origin}\n${name}\nقد يغيّر هذا الملف جهازك عند تشغيله. هل تثق بالمصدر وتريد تنزيله؟`, buttons: ['إلغاء', 'تنزيل الملف'], defaultId: 0, cancelId: 0, noLink: true }).then(result => { if (result.response === 1 && !wc.isDestroyed() && wc.getURL() === pageURL && source.id === activeId && (item.isPaused() || item.canResume())) item.resume(); else item.cancel(); }).catch(() => item.cancel());
    }
    item.on('updated', (_event, state) => { entry.status = state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing'; entry.received = item.getReceivedBytes(); entry.total = item.getTotalBytes(); publish(); });
    item.once('done', (_event, state) => { entry.status = state; entry.received = item.getReceivedBytes(); entry.path = item.getSavePath(); if (entry.private && !tabs.some(tab => tab.private)) downloads.delete(entry.id); publish(); });
    publish();
  });
}
function sessionFor(isPrivate) {
  if (!isPrivate) return regularSession;
  if (!privateSession) { privateSession = session.fromPartition(`sanad-private-${crypto.randomUUID()}`); prepareSession(privateSession); }
  return privateSession;
}
function remember(tab) {
  if (networkPrivacy.enabled || tab.private || !mayRemember(tab.url, testMode)) return;
  store.state.history = [{ url: tab.url, title: tab.title, timestamp: Date.now() }, ...store.state.history.filter(item => item.url !== tab.url)].slice(0, 200);
  store.persist();
}
function handleKeyboard(event, input) {
  if (input.type !== 'keyDown' || input.isComposing) return;
  const command = input.control || input.meta;
  const key = input.key.toLowerCase();
  if (command && ['l', 'k'].includes(key) && !input.shift) { event.preventDefault(); focusAddress(); }
  else if (command && key === 't') { event.preventDefault(); if (input.shift) restoreTab(); else { createTab(homeURL, Boolean(active()?.private)); focusAddress(); } }
  else if (command && input.shift && key === 'n') { event.preventDefault(); createTab(homeURL, true); focusAddress(); }
  else if (command && /^[1-9]$/.test(key)) { event.preventDefault(); const index = key === '9' ? tabs.length - 1 : Number(key) - 1; if (tabs[index]) activate(tabs[index].id); }
  else if (command && ['PageUp', 'PageDown'].includes(input.key)) { event.preventDefault(); const index = tabs.findIndex(tab => tab.id === activeId), step = input.key === 'PageUp' ? -1 : 1; if (input.shift) { const current = active(), group = tabs.filter(tab => tab.pinned === current.pinned), place = group.indexOf(current), target = Math.max(0, Math.min(group.length - 1, place + step)); if (place !== target) moveTab(current.id, step > 0 ? group[target + 1]?.id || null : group[target].id); } else activate(tabs[(index + step + tabs.length) % tabs.length].id); }
  else if (command && key === 'w') { event.preventDefault(); closeTab(activeId); }
  else if (command && key === 'r') { event.preventDefault(); contents()?.reload(); }
  else if (command && key === 'd') { event.preventDefault(); bookmark(); }
  else if (command && key === 'f') { event.preventDefault(); openPanel('find'); }
  else if (command && input.shift && key === 'a') { event.preventDefault(); openPanel('tabs'); }
  else if (command && ['=', '+', '-'].includes(key)) { event.preventDefault(); changeZoom((active()?.zoom || 1) + (key === '-' ? -.1 : .1)); }
  else if (command && key === '0') { event.preventDefault(); changeZoom(1); }
  else if (command && key === 'tab') { event.preventDefault(); const i = tabs.findIndex(tab => tab.id === activeId); activate(tabs[(i + (input.shift ? -1 : 1) + tabs.length) % tabs.length].id); }
  else if (input.alt && input.key === 'ArrowLeft') { event.preventDefault(); const wc = contents(); if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); }
  else if (input.alt && input.key === 'ArrowRight') { event.preventDefault(); const wc = contents(); if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); }
  else if (input.key === 'F11') { event.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
}
function attachView(tab, inheritedContents) {
  const ses = sessionFor(tab.private);
  const view = new WebContentsView({ webPreferences: preferences(ses), ...(inheritedContents ? { webContents: inheritedContents } : {}) });
  tab.view = view;
  win.contentView.addChildView(view);
  const wc = view.webContents;
  tab.youtube = createYouTubeInjection(wc, store.state.preferences.protection, Boolean(inheritedContents));
  wc.on('dom-ready', () => { void applyPageProtection(tab, wc); });
  wc.setZoomMode('isolated');
  wc.setZoomFactor(tab.zoom);
  wc.setAudioMuted(tab.muted);
  wc.on('before-input-event', handleKeyboard);
  wc.on('context-menu', (_event, params) => {
    if (tab.id !== activeId || wc.isDestroyed()) return;
    const valid = () => tab.id === activeId && tab.view?.webContents === wc && !wc.isDestroyed();
    const menu = pageActions(params, { open: (url, privateMode, background = false) => { if (!valid()) return; const next = createTab(url, tab.private || privateMode, !background); if (next) { next.openerId = tab.id; if (background) void loadTabURL(next, next.url); } }, copy: text => { if (valid()) clipboard.writeText(text); }, run: action => { if (valid()) void command(action, {}).catch(() => message('تعذر تنفيذ الإجراء.')); } }, testMode);
    Menu.buildFromTemplate(menu).popup({ window: win, ...(params.frame ? { frame: params.frame } : {}) });
  });
  for (const event of ['will-navigate', 'will-redirect']) wc.on(event, (e, url) => { const target = typeof url === 'string' ? url : e.url; const normalized = nativeSiteURL(target, tab.private, testMode); if (!normalized) { e.preventDefault(); message('يسمح المتصفح بالمواقع المشفرة فقط.'); } else if (e.isMainFrame !== false && normalized !== target) { e.preventDefault(); void loadTabURL(tab, normalized); } });
  wc.setWindowOpenHandler(details => {
    if (!safeURL(details.url, testMode) && details.url !== 'about:blank') { message('هذا النوع من الروابط غير مدعوم داخل المتصفح.'); return { action: 'deny' }; }
    if (tabs.length >= MAX_TABS) { message('وصلت إلى 32 تبويبًا. أغلق تبويبًا قبل فتح آخر.'); return { action: 'deny' }; }
    return { action: 'allow', outlivesOpener: true, createWindow: options => {
      const next = createTab(details.url, tab.private, false, options.webContents, details.url === 'about:blank');
      if (!next) return wc;
      next.openerId = tab.id;
      // Chromium defers webContents creation for Ctrl/middle-click. These tabs
      // need an explicit load; adopted popup contents must keep their original
      // navigation, POST body and opener instead of being replaced with a GET.
      if (!options.webContents && details.url !== 'about:blank') {
        const loadOptions = { httpReferrer: details.referrer };
        if (details.postBody) {
          loadOptions.postData = details.postBody.data;
          loadOptions.extraHeaders = `Content-Type: ${details.postBody.contentType}${details.postBody.boundary ? `; boundary=${details.postBody.boundary}` : ''}`;
        }
        void loadTabURL(next, next.url, loadOptions);
      }
      if (details.disposition !== 'background-tab') activate(next.id);
      return next.view.webContents;
    } };
  });
  wc.on('will-prevent-unload', event => {
    if (!testMode && dialog.showMessageBoxSync(win, { type: 'question', title: 'مغادرة الصفحة', message: 'قد تحتوي الصفحة على تغييرات غير محفوظة. هل تريد إغلاقها؟', buttons: ['البقاء', 'مغادرة'], defaultId: 0, cancelId: 0, noLink: true }) === 1) event.preventDefault();
    else tab.closing = false;
    publish();
  });
  wc.once('destroyed', () => { if (tab.view === view) finishClose(tab.id); });
  wc.on('did-navigate', (_event, url) => { if (url === 'about:blank' && !inheritedContents && tab.url !== 'about:blank') return; tab.url = url; tab.error = ''; tab.diagnostics = null; tab.reader = null; remember(tab); publish(); });
  wc.on('did-navigate-in-page', (_event, url, isMainFrame) => { if (isMainFrame) { const normalized = nativeSiteURL(url, tab.private, testMode); if (normalized && normalized !== url) { void loadTabURL(tab, normalized); return; } tab.url = url; remember(tab); void applyPageProtection(tab, wc); publish(); } });
  wc.on('page-title-updated', (_event, title) => { tab.title = String(title).slice(0, 200); if (!networkPrivacy.enabled && !tab.private) { const item = store.state.history.find(item => item.url === tab.url); if (item) { item.title = tab.title; store.persist(); } } publish(); });
  for (const event of ['did-start-loading', 'did-stop-loading', 'media-started-playing', 'media-paused']) wc.on(event, publish);
  wc.on('did-fail-load', (_event, code, _description, url, isMainFrame) => { if (isMainFrame && code !== -3) { tab.error = networkPrivacy.enabled ? 'تعذر فتح الصفحة عبر الوسيط المحلي. تحقق من تشغيله؛ لا يتحول المتصفح تلقائيًا إلى اتصال مباشر.' : 'تعذر فتح الصفحة. تحقق من الاتصال أو جرّب إعادة التحميل.'; tab.url = safeURL(url, testMode) || tab.url; publish(); } });
  wc.on('render-process-gone', () => { tab.error = 'توقفت الصفحة. أعد تحميلها للمتابعة.'; publish(); });
  wc.on('found-in-page', (_event, result) => { if (tab.id === activeId) win.webContents.send('sanad-browser:state', { ...snapshot(), found: { total: result.matches, current: result.activeMatchOrdinal } }); });
  layout();
}
async function loadTabURL(tab, url, options) {
  const wc = tab?.view?.webContents;
  if (!wc || wc.isDestroyed()) return;
  await sessionSetup.get(wc.session);
  await tab.youtube?.ready;
  if (!wc.isDestroyed() && tab.view?.webContents === wc) await wc.loadURL(url, options).catch(() => {});
}
function createTab(url = homeURL, isPrivate = false, load = true, inheritedContents, allowBlank = false) {
  if (tabs.length >= MAX_TABS) { message('وصلت إلى 32 تبويبًا. أغلق تبويبًا قبل فتح آخر.'); return null; }
  const safe = allowBlank && url === 'about:blank' ? url : nativeSiteURL(url, isPrivate, testMode);
  if (!safe) return null;
  const tab = { id: crypto.randomUUID(), title: 'تبويب جديد', url: safe, private: Boolean(isPrivate), pinned: false, muted: false, blocked: 0, error: '', zoom: 1, view: null };
  tabs.push(tab);
  attachView(tab, inheritedContents);
  if (load) { activate(tab.id); void loadTabURL(tab, safe); }
  publish(); return tab;
}
function activate(id, focusPage = true) {
  const tab = tabs.find(item => item.id === id);
  if (!tab) return;
  activeId = id; overlay = false; notice = '';
  if (!tab.view) { attachView(tab); void loadTabURL(tab, tab.url); }
  layout(); if (focusPage) tab.view.webContents.focus(); else win.webContents.focus(); publish();
}
async function cleanupPrivate() {
  if (tabs.some(tab => tab.private) || !privateSession) return;
  const retiring = privateSession; privateSession = null;
  protection.release(retiring); preparedSessions.delete(retiring);
  await Promise.allSettled([retiring.clearStorageData(), retiring.clearCache()]);
  for (const key of permissionGrants.keys()) if (key.startsWith('private:')) permissionGrants.delete(key);
  for (const [id, item] of downloads) if (item.private && item.status !== 'progressing' && item.status !== 'paused') downloads.delete(id);
}
function destroyView(tab) { const view = tab.view; if (!view) return; tab.view = null; win.contentView.removeChildView(view); if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false }); }
function closeTab(id) {
  const tab = tabs.find(item => item.id === id);
  if (!tab || tab.closing) return;
  if (!tab.view || tab.view.webContents.isDestroyed()) { finishClose(id); return; }
  tab.closing = true;
  publish();
  tab.view.webContents.close({ waitForBeforeUnload: true });
}
function finishClose(id) {
  const i = tabs.findIndex(tab => tab.id === id);
  if (i < 0) return;
  const tab = tabs[i];
  if (!tab.private && mayRemember(tab.url, testMode)) { closedTabs.unshift({ url: tab.url, pinned: tab.pinned }); if (closedTabs.length > 10) closedTabs.pop(); }
  if (tab.view && !win.isDestroyed()) win.contentView.removeChildView(tab.view);
  tab.view = null; tabs.splice(i, 1);
  if (shuttingDown) return;
  if (!tabs.length) createTab();
  else if (id === activeId) activate(tabs.find(item => item.id === tab.openerId)?.id || tabs[Math.min(i, tabs.length - 1)].id);
  void cleanupPrivate(); publish();
}
function restoreTab() { const entry = closedTabs[0]; if (!entry || tabs.length >= MAX_TABS) return; closedTabs.shift(); const tab = createTab(entry.url); if (tab) { tab.pinned = entry.pinned; tabs.sort((a, b) => Number(b.pinned) - Number(a.pinned)); } publish(); }
function moveTab(id, beforeId = null) { tabs.splice(0, tabs.length, ...moveTabBefore(tabs, id, beforeId)); publish(); }
function duplicateTab(id) {
  const source = tabs.find(item => item.id === id); if (!source) return;
  const next = createTab(source.url, source.private);
  if (next) { next.zoom = source.zoom; next.view.webContents.setZoomFactor(next.zoom); }
  publish();
}
function tabContextMenu(data) {
  const tab = tabs.find(item => item.id === data.id); if (!tab) return;
  const items = [
    { label: 'إغلاق التبويب', click: () => closeTab(tab.id) },
    { label: 'تكرار التبويب', enabled: tabs.length < MAX_TABS, click: () => duplicateTab(tab.id) },
    { type: 'separator' },
    { label: tab.pinned ? 'إلغاء تثبيت التبويب' : 'تثبيت التبويب', click: () => { void command('pin', { id: tab.id }); } },
    { label: tab.muted ? 'تشغيل صوت التبويب' : 'كتم صوت التبويب', click: () => { void command('mute', { id: tab.id }); } },
    { label: 'نقل إلى بداية المجموعة', click: () => moveTab(tab.id, tabs.find(item => item.pinned === tab.pinned)?.id) },
    { label: 'نقل إلى نهاية المجموعة', click: () => moveTab(tab.id) },
    { type: 'separator' },
    { label: 'استعادة آخر تبويب مغلق', enabled: closedTabs.length > 0, click: restoreTab },
  ];
  const position = Number.isFinite(data.x) && Number.isFinite(data.y) ? { x: Math.max(0, Math.round(data.x)), y: Math.max(0, Math.round(data.y)) } : {};
  Menu.buildFromTemplate(items).popup({ window: win, ...position });
}
function bookmark() {
  const tab = active(); if (!tab || !mayRemember(tab.url, testMode)) return;
  const old = store.state.bookmarks.find(item => item.url === tab.url);
  store.state.bookmarks = old ? store.state.bookmarks.filter(item => item.url !== tab.url) : [...store.state.bookmarks, { title: tab.title, url: tab.url }].slice(-1000);
  store.persist(); publish();
}
function changeZoom(value) { const tab = active(); if (!tab || !Number.isFinite(value)) return; tab.zoom = Math.max(.5, Math.min(2, Math.round(value * 10) / 10)); tab.view?.webContents.setZoomFactor(tab.zoom); publish(); }
async function applyPageProtection(tab, wc) {
  if (wc.isDestroyed() || tab.view?.webContents !== wc) return;
  const epoch = tab.protectionEpoch = (tab.protectionEpoch || 0) + 1;
  const url = wc.getURL(), enabled = store.state.preferences.protection;
  const valid = () => !wc.isDestroyed() && tab.view?.webContents === wc && wc.getURL() === url && tab.protectionEpoch === epoch;
  try {
    await tab.youtube?.setEnabled(enabled);
    if (!valid()) return;
    if (tab.protectionCSS) { const previous = tab.protectionCSS; tab.protectionCSS = null; await wc.removeInsertedCSS(previous).catch(() => {}); }
    if (!valid()) return;
    const css = enabled ? protection.stylesFor(url, wc.session) + (isYouTube(url) ? YOUTUBE_STYLES : '') : '';
    // Electron 45 removes sheets using Blink's default author origin. Keep
    // insertion at that same origin so opting out removes the stylesheet.
    if (css) { const key = await wc.insertCSS(css, { cssOrigin: 'author' }); if (valid()) tab.protectionCSS = key; else if (!wc.isDestroyed()) await wc.removeInsertedCSS(key).catch(() => {}); }
    if (valid() && isYouTube(url)) await wc.executeJavaScriptInIsolatedWorld(1002, [{ code: youtubeGuardScript(enabled) }]);
  } catch { /* Filter failures never grant page privileges or disable TLS. */ }
}
async function command(action, data) {
  const wc = contents(), tab = active();
  switch (action) {
    case 'state': return snapshot();
    case 'new': createTab(homeURL, data.private === true || (data.private !== false && Boolean(tab?.private))); focusAddress(); break;
    case 'activate': activate(data.id, data.focus !== 'tab-strip'); break;
    case 'tab-move': moveTab(data.id, typeof data.beforeId === 'string' ? data.beforeId : null); break;
    case 'duplicate': duplicateTab(data.id || activeId); break;
    case 'tab-context-menu': tabContextMenu(data); break;
    case 'close': closeTab(data.id); break;
    case 'restore': restoreTab(); break;
    case 'navigate': { const destination = resolveDestination(data.value, testMode); if (!destination) { message('اكتب رابطًا مشفرًا أو عبارة بحث.'); break; } if (destination.panel) { openPanel(destination.panel); break; } overlay = false; layout(); tab.error = ''; void loadTabURL(tab, nativeSiteURL(destination.url, tab.private, testMode)); wc.focus(); break; }
    case 'home': overlay = false; layout(); void loadTabURL(tab, nativeSiteURL(homeURL, tab.private, testMode)); break;
    case 'back': if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
    case 'forward': if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); break;
    case 'reload': if (wc) wc.reload(); else activate(activeId); break;
    case 'stop': wc?.stop(); break;
    case 'pin': { const target = tabs.find(item => item.id === data.id); if (target) { target.pinned = !target.pinned; tabs.sort((a, b) => Number(b.pinned) - Number(a.pinned)); } break; }
    case 'mute': { const target = tabs.find(item => item.id === data.id); if (target) { target.muted = !target.muted; target.view?.webContents.setAudioMuted(target.muted); } break; }
    case 'suspend': for (const target of tabs) if (target.id !== activeId && !target.pinned && target.view && !target.view.webContents.isCurrentlyAudible()) destroyView(target); message('أُريحت التبويبات غير النشطة. تُحمّل من جديد عند فتحها.'); break;
    case 'zoom': changeZoom(Number(data.value)); break;
    case 'bookmark': bookmark(); break;
    case 'bookmark-remove': store.state.bookmarks = store.state.bookmarks.filter(item => item.url !== data.url); store.persist(); break;
    case 'bookmark-import': {
      const result = await dialog.showOpenDialog(win, { title: 'استيراد المفضلة', properties: ['openFile'], filters: [{ name: 'Bookmarks JSON', extensions: ['json'] }] });
      if (result.canceled) break;
      const imported = sanitizeBookmarks(JSON.parse(readBoundedText(result.filePaths[0], 1_000_000)));
      store.state.bookmarks = sanitizeBookmarks([...store.state.bookmarks, ...imported]); store.persist(); message(`أُضيفت المفضلة. لديك الآن ${store.state.bookmarks.length} رابطًا.`); break;
    }
    case 'bookmark-export': { const result = await dialog.showSaveDialog(win, { title: 'تصدير المفضلة', defaultPath: 'sanad-bookmarks.json', filters: [{ name: 'JSON', extensions: ['json'] }] }); if (!result.canceled) fs.writeFileSync(result.filePath, JSON.stringify({ version: 1, bookmarks: store.state.bookmarks }, null, 2)); break; }
    case 'history-clear': store.state.history = []; store.persist(); break;
    case 'theme': store.state.preferences.theme = store.state.preferences.theme === 'dark' ? 'light' : 'dark'; nativeTheme.themeSource = store.state.preferences.theme; store.persist(); break;
    case 'protection': store.state.preferences.protection = data.value === true; for (const ses of preparedSessions) protection.set(ses, store.state.preferences.protection); for (const target of tabs) if (target.view) void applyPageProtection(target, target.view.webContents); store.persist(); break;
    case 'network-privacy': {
      const config = validateConfig({ version: 1, enabled: data.enabled, port: data.port });
      const result = await dialog.showMessageBox(win, { type: 'question', title: 'إعادة تشغيل سَنَد الحرمين', message: config.enabled ? `سيُستخدم وسيط SOCKS5 محلي على المنفذ ${config.port}. شغّله أولًا. سيتوقف التصفح إذا لم يكن متاحًا. ستُغلق التبويبات والتنزيلات عند إعادة التشغيل.` : 'سيُعاد تشغيل المتصفح دون إلزام الاتصال بالوسيط المحلي. قد يظهر عنوان IP الحقيقي للمواقع. ستُغلق التبويبات والتنزيلات.', buttons: ['إلغاء', 'حفظ وإعادة التشغيل'], defaultId: 0, cancelId: 0, noLink: true });
      if (result.response !== 1) break;
      writeNetworkPrivacy(app.getPath('userData'), config);
      app.relaunch({ args: relaunchArgs }); await shutdown(); break;
    }
    case 'protection-update': if (!updatingProtection) { updatingProtection = true; publish(); try { await protection.update(); for (const target of tabs) if (target.view) void applyPageProtection(target, target.view.webContents); message('تم تحديث قوائم الحماية.'); } catch { message('تعذر تحديث القوائم. الحماية المحلية مستمرة.'); } finally { updatingProtection = false; } } break;
    case 'download-pause': downloads.get(data.id)?.item.pause(); break;
    case 'download-resume': { const item = downloads.get(data.id)?.item; if (item?.canResume()) item.resume(); break; }
    case 'download-cancel': downloads.get(data.id)?.item.cancel(); break;
    case 'download-reveal': { const item = downloads.get(data.id); if (item?.status === 'completed' && item.path) shell.showItemInFolder(item.path); break; }
    case 'find': if (typeof data.value === 'string' && data.value.trim()) wc?.findInPage(data.value.slice(0, 200), { forward: data.forward !== false, findNext: data.next !== true }); else wc?.stopFindInPage('clearSelection'); break;
    case 'find-stop': wc?.stopFindInPage('clearSelection'); break;
    case 'reader': {
      if (!wc || wc.isDestroyed()) break;
      const capturedURL = wc.getURL(); let timer;
      // Parse a clone inside the sandboxed page. Only bounded plain text crosses back to the shell.
      const value = await Promise.race([wc.executeJavaScriptInIsolatedWorld(1001, [{ code: `(() => { ${readabilitySource}\n const article = new Readability(document.cloneNode(true), { maxElemsToParse: 20000, charThreshold: 100, serializer: node => node.textContent }).parse(); return article ? { title: String(article.title || document.title).slice(0,200), text: String(article.textContent || '').slice(0,60000), dir: article.dir || document.documentElement.dir || 'auto' } : null; })()` }]), new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('تعذر تجهيز وضع القراءة في الوقت المحدد.')), 4000); })]).finally(() => clearTimeout(timer));
      if (wc.isDestroyed() || tab.view?.webContents !== wc || wc.getURL() !== capturedURL || tab.id !== activeId) break;
      if (!value || typeof value.text !== 'string' || !value.text.trim()) { message('لا تحتوي هذه الصفحة على مقال مناسب لوضع القراءة.'); break; }
      tab.reader = { title: typeof value.title === 'string' ? value.title.slice(0, 200) : tab.title, text: value.text.slice(0, 60000), dir: ['rtl', 'ltr'].includes(value.dir) ? value.dir : 'auto' };
      openPanel('reader'); break;
    }
    case 'reader-clear': if (tab) tab.reader = null; break;
    case 'diagnostics': {
      if (!wc || wc.isDestroyed()) break;
      const capturedURL = wc.getURL();
      // Read timing API values only on demand; never retain page content or send metrics remotely.
      let timer;
      const raw = await Promise.race([wc.executeJavaScript(`(() => { const n = performance.getEntriesByType('navigation')[0]; const p = performance.getEntriesByType('paint').find(item => item.name === 'first-contentful-paint'); return { response: n && n.responseStart > 0 ? n.responseStart - n.requestStart : null, dom: n && n.domContentLoadedEventEnd > 0 ? n.domContentLoadedEventEnd - n.startTime : null, load: n && n.loadEventEnd > 0 ? n.loadEventEnd - n.startTime : null, paint: p ? p.startTime : null, resources: performance.getEntriesByType('resource').length }; })()`), new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('تعذرت قراءة قياسات الصفحة في الوقت المحدد.')), 3000); })]).finally(() => clearTimeout(timer));
      if (wc.isDestroyed() || tab.view?.webContents !== wc || wc.getURL() !== capturedURL) break;
      const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e12 ? value : null;
      let memory = null, gpu = 'unavailable';
      try { memory = number(app.getAppMetrics().find(item => item.pid === wc.getOSProcessId())?.memory?.workingSetSize); gpu = String(app.getGPUFeatureStatus().gpu_compositing || 'unavailable').slice(0, 80); } catch {}
      tab.diagnostics = { response: number(raw?.response), dom: number(raw?.dom), load: number(raw?.load), paint: number(raw?.paint), resources: number(raw?.resources), memory, gpu, measuredAt: Date.now() };
      break;
    }
    case 'save-pdf': {
      if (!wc || wc.isDestroyed()) break;
      const capturedURL = wc.getURL();
      const result = testMode ? { canceled: false, filePath: path.join(app.getPath('userData'), 'sanad-page.pdf') } : await dialog.showSaveDialog(win, { title: 'حفظ الصفحة PDF', defaultPath: 'sanad-page.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (result.canceled || !result.filePath || wc.isDestroyed() || wc.getURL() !== capturedURL) break;
      const buffer = await wc.printToPDF({ printBackground: true, preferCSSPageSize: true }); fs.writeFileSync(result.filePath, buffer); message('تم حفظ الصفحة PDF.'); break;
    }
    case 'save-image':
    case 'save-offline': {
      if (!wc || wc.isDestroyed()) break;
      const capturedURL = wc.getURL(), image = action === 'save-image';
      const filename = image ? 'sanad-page.png' : 'sanad-page.mhtml';
      const result = testMode ? { canceled: false, filePath: path.join(app.getPath('userData'), filename) } : await dialog.showSaveDialog(win, { title: image ? 'حفظ صورة الجزء الظاهر من الصفحة' : 'حفظ الصفحة للقراءة دون اتصال', defaultPath: filename, filters: [{ name: image ? 'PNG image' : 'MHTML web archive', extensions: [image ? 'png' : 'mhtml'] }] });
      if (result.canceled || !result.filePath || wc.isDestroyed() || wc.getURL() !== capturedURL) break;
      if (image) { overlay = false; layout(); const capture = await wc.capturePage(); if (capture.isEmpty()) throw new Error('تعذر تصوير الصفحة.'); fs.writeFileSync(result.filePath, capture.toPNG()); }
      else await wc.savePage(result.filePath, 'MHTML');
      message(image ? 'تم حفظ صورة الصفحة.' : 'تم حفظ نسخة MHTML للقراءة بمتصفح متوافق دون اتصال.'); break;
    }
    case 'overlay': overlay = data.value === true; layout(); break;
    case 'toolbar-height': if (Number.isFinite(data.value)) { toolbarHeight = Math.max(80, Math.min(320, Math.ceil(data.value))); layout(); } break;
    case 'devtools': wc?.openDevTools({ mode: 'detach' }); break;
    case 'fullscreen': win.setFullScreen(!win.isFullScreen()); break;
    case 'copy-link': { const url = cleanURL(tab?.url); if (url) { clipboard.writeText(url); message('نُسخ الرابط دون معاملات التتبع.'); } break; }
    case 'account': createTab('https://ip-murad.com/profile/studio'); break;
    case 'updates-check': if (!data.automatic || (app.isPackaged && !tab?.private)) await updates.check({ automatic: data.automatic === true }); break;
    case 'updates-open': { if (storeDistribution) { if (networkPrivacy.enabled) { message('Microsoft Store تطبيق خارجي لا يشمله مسار الوسيط. أوقف وضع الوسيط قبل فتح تحديثات المتجر من هنا.'); break; } await shell.openExternal(STORE_UPDATES_URI); break; } const release = updates.snapshot(); if (release.releaseUrl && ['available', 'current', 'ahead'].includes(release.status)) createTab(release.releaseUrl, tab?.private); break; }
    case 'about-copy': clipboard.writeText(`Sanad Browser ${app.getVersion()} (${process.platform} ${process.arch})\nChromium ${process.versions.chrome}\nElectron ${process.versions.electron}\n${storeDistribution ? 'Microsoft Store · Store-managed updates' : 'Preview channel · manual installation'}`); message('نُسخت معلومات الإصدار.'); break;
    case 'chromium-licenses': { const next = createTab(homeURL, Boolean(tab?.private), false); if (next) { activate(next.id); void loadTabURL(next, 'sanad-licenses://app/chromium'); } break; }
    default: throw new Error('إجراء غير معروف.');
  }
  publish(); return snapshot();
}
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true; clearTimeout(publishTimer);
  for (const tab of tabs) destroyView(tab);
  tabs.length = 0;
  try { await store?.flush(); } catch { /* Preserve the last committed snapshot. */ }
  protection?.dispose(); app.quit();
}
async function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 860, minWidth: 700, minHeight: 540, title: 'سَنَد الحرمين', icon: path.join(__dirname, 'assets/mark.png'), backgroundColor: '#101820', autoHideMenuBar: true, webPreferences: { ...preferences(session.defaultSession), preload: path.join(__dirname, 'preload.cjs') } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('before-input-event', handleKeyboard);
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.on('resize', layout);
  win.webContents.on('did-finish-load', publish);
  win.on('close', event => { if (!shuttingDown) { event.preventDefault(); void shutdown(); } });
  await win.loadURL('sanad-app://browser/index.html');
  createTab(homeURL);
}
app.whenReady().then(async () => {
  if (privacyStartupError) { dialog.showErrorBox('تعذر فتح إعدادات حماية الاتصال', privacyStartupError.message); throw privacyStartupError; }
  if (networkPrivacy.enabled) app.configureHostResolver({ secureDnsMode: 'off', enableBuiltInResolver: false, enableAdditionalDnsQueryTypes: false });
  store = await openEncryptedStore(app.getPath('userData'), { safeStorage, onError: () => message('تعذّر فتح البيانات المحمية أو حفظها. بقي الملف الأصلي محفوظًا؛ راجع حالة حماية البيانات في «حول Sanad».') });
  const feedURL = testMode && safeURL(process.env.SANAD_BROWSER_TEST_UPDATE_URL, true) ? process.env.SANAD_BROWSER_TEST_UPDATE_URL : UPDATE_FEED;
  updates = storeDistribution ? createStoreUpdateChecker() : createUpdateChecker({ version: app.getVersion(), feedURL, changed: publish, fetchImpl: (url, options) => net.fetch(url, options) });
  nativeTheme.themeSource = store.state.preferences.theme;
  protection = createProtection(app.getPath('userData'), request => { const tab = tabs.find(item => item.view?.webContents.id === Number(request.tabId)); if (tab) { tab.blocked++; publish(); } });
  regularSession = session.fromPartition(networkPrivacy.enabled ? `sanad-network-${crypto.randomUUID()}` : 'persist:sanad-web');
  prepareSession(session.defaultSession); prepareSession(regularSession);
  await Promise.all([sessionSetup.get(session.defaultSession), sessionSetup.get(regularSession)]);
  protocol.handle('sanad-app', request => {
    const url = new URL(request.url);
    const file = url.hostname === 'browser' && localFiles.get(url.pathname);
    if (!file) return new Response('Not found', { status: 404 });
    return new Response(fs.readFileSync(path.join(__dirname, file[0])), { headers: { 'Content-Type': file[1], 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'" } });
  });
  ipcMain.handle('sanad-browser:command', async (event, action, data = {}) => {
    if (!trustedSender(event, win?.webContents) || typeof action !== 'string' || !data || typeof data !== 'object' || JSON.stringify(data).length > 10000) throw new Error('Request rejected');
    try { return await command(action, data); } catch (error) { message(error instanceof Error ? error.message : 'تعذر تنفيذ الإجراء.'); return snapshot(); }
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'سَنَد', submenu: [{ label: 'تبويب جديد', accelerator: 'CmdOrCtrl+T', click: () => { createTab(homeURL, Boolean(active()?.private)); focusAddress(); } }, { label: 'بحث دون حفظ السجل', accelerator: 'CmdOrCtrl+Shift+N', click: () => { createTab(homeURL, true); focusAddress(); } }, { label: 'استعادة التبويب', accelerator: 'CmdOrCtrl+Shift+T', click: restoreTab }, { type: 'separator' }, { role: 'quit' }] }]));
  await createWindow();
}).catch(error => { console.error(error.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => { if (!shuttingDown && store) { event.preventDefault(); void shutdown(); } });



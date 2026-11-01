'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, session, protocol, dialog, shell, clipboard, Menu, nativeTheme, safeStorage, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readBoundedText } = require('./bounded-file.cjs');
const { brandedUserAgent, userAgentOverride } = require('./user-agent.cjs');
const { configureEnginePerformance } = require('./engine-performance.cjs');
const { faviconAsset, omniboxSuggestions } = require('./network-assets.cjs');
const { moveTabBefore } = require('./tab-order.cjs');
const { normalizeSearchPreferences, officialSearchPage, searchPreferenceScript } = require('./search-preferences.cjs');
const { readNetworkPrivacy, writeNetworkPrivacy, configureStartupPrivacy, configureSessionPrivacy, hardenWebContents, locationPermissionAllowed, validateConfig } = require('./location-privacy.cjs');
const { HOME, MAX_TABS, safeURL, resolveDestination, cleanURL, nativeSiteURL, mayRemember, sanitizeBookmarks, trustedSender } = require('./policy.cjs');
const { openProfileManager } = require('./profile-manager.cjs');
const { openPrivateVault } = require('./private-vault.cjs');
const { createExtensionsManager } = require('./extensions-manager.cjs');
const { createVaultActions, handleFormSubmission } = require('./vault-actions.cjs');
const { openEncryptedStore } = require('./store.cjs');
const { createNativeAccount } = require('./browser-cloud.cjs');
const { parseAuthCallback } = require('./browser-account-state.cjs');
const { MAX_STATE_BYTES } = require('./state-encryption.cjs');
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
configureEnginePerformance(app.commandLine, networkPrivacy);
configureStartupPrivacy(app.commandLine, networkPrivacy);
app.on('web-contents-created', (_event, wc) => hardenWebContents(wc));
// Set the global default before creating any sessions, windows or popups.
app.userAgentFallback = brandedUserAgent(app.userAgentFallback, app.getVersion());
protocol.registerSchemesAsPrivileged([{ scheme: 'sanad-app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }, { scheme: 'sanad-licenses', privileges: { standard: true, secure: true } }]);
let win, store, protection, regularSession, privateSession, updates, browserAccount,profileManager,privateVault,vaultActions,extensionsManager;
let switchingProfile=false,profileEpoch=0,sessionsReady=false;
const pendingAuthURLs=[];
const primaryInstance=app.requestSingleInstanceLock();
if(!primaryInstance)app.quit();
const receiveAuthURL=raw=>{if(!parseAuthCallback(raw))return;if(browserAccount)void browserAccount.handleURL(raw);else pendingAuthURLs.push(raw);};
app.on('open-url',(event,url)=>{event.preventDefault();receiveAuthURL(url);});
app.on('second-instance',(_event,argv)=>{for(const arg of argv)receiveAuthURL(arg);if(win){if(win.isMinimized())win.restore();win.focus();}});
for(const arg of process.argv)if(parseAuthCallback(arg))pendingAuthURLs.push(arg);
const licenceNotices = fs.readFileSync(path.join(__dirname, 'LICENSE'), 'utf8') + '\n\n' + fs.readFileSync(path.join(__dirname, 'THIRD_PARTY_NOTICES.md'), 'utf8') + '\n\n' + fs.readFileSync(path.join(__dirname, 'ui/settings/THIRD_PARTY_LICENSES.txt'), 'utf8');
let activeId, toolbarHeight = 100, overlay = false, overlayGeneration = 0, notice = '';
let updatingProtection = false, shuttingDown = false;
let publishTimer, omniboxRequest;
const tabs = [], closedTabs = [], downloads = new Map(), permissionGrants = new Map();
const tabIcons = new Map();
const preparedSessions = new Set();
const sessionSetup = new WeakMap();
const localFiles = new Map([
  ['/index.html', ['ui/index.html', 'text/html; charset=utf-8']],
  ['/account-panel.js', ['ui/account-panel.js', 'text/javascript; charset=utf-8']],
  ['/renderer.js', ['ui/renderer.js', 'text/javascript; charset=utf-8']],
  ['/tab-strip.js', ['ui/tab-strip.js', 'text/javascript; charset=utf-8']],
  ['/browser-menu.js', ['ui/browser-menu.js', 'text/javascript; charset=utf-8']],
  ['/omnibox.js', ['ui/omnibox.js', 'text/javascript; charset=utf-8']],
  ['/settings.js', ['ui/settings/settings.js', 'text/javascript; charset=utf-8']],
  ['/settings.css', ['ui/settings/settings.css', 'text/css; charset=utf-8']],
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
    tabs: tabs.map(tab => ({ id: tab.id, title: tab.title, url: tab.url, favicon: tab.iconVersion ? `sanad-app://browser/favicon/${tab.id}?v=${tab.iconVersion}` : '', private: tab.private, pinned: tab.pinned, muted: tab.muted, closing: Boolean(tab.closing), sleeping: !tab.view, loading: Boolean(tab.view?.webContents.isLoading()), back: Boolean(tab.view?.webContents.navigationHistory.canGoBack()), forward: Boolean(tab.view?.webContents.navigationHistory.canGoForward()), blocked: tab.blocked, error: tab.error, zoom: tab.zoom, diagnostics: tab.diagnostics || null })),
    activeId, preferences: store.state.preferences, bookmarks: store.state.bookmarks, history: store.state.history,
    profiles:profileManager?{activeId:profileManager.active.id,entries:profileManager.list(),protection:profileManager.protection.status}:null,
    extensions:extensionsManager?.status(),
    vault:privateVault?{protection:privateVault.protection.status,passwords:privateVault.metadata().passwords.length,autofill:privateVault.metadata().autofill.length}:null,
    downloads: [...downloads.values()].filter(x=>!x.profileId||x.profileId===profileManager?.active.id).map(publicDownload), closedCount: closedTabs.length,
    notice, reader: active()?.reader || null, protectionSource: protection.source(), protectionRevision: protection.revision(), updatingProtection,
    versions: { chromium: process.versions.chrome, electron: process.versions.electron, app: app.getVersion(), platform: process.platform, arch: process.arch, packaged: app.isPackaged, distribution: storeDistribution ? 'microsoft-store' : 'direct' },
    updates: updates?.snapshot(), storageProtection: store.storageProtection, licenceNotices,
    locationPrivacy: { enabled: networkPrivacy.enabled, port: networkPrivacy.port, routing: networkPrivacy.enabled ? 'configured-unverified' : 'system', geolocation: 'blocked' },
    sync: browserAccount?.status() || {phase:'signed-out',identity:null,signedIn:false,enabled:false,profiles:[]},
    searchPolicy: { level: 'strict', locked: true }
  };
}
function publish() {
  if(!switchingProfile){rememberSession();browserAccount?.changed();}
  if (publishTimer || shuttingDown || switchingProfile) return;
  publishTimer = setTimeout(() => { publishTimer = null; if (!switchingProfile && win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('sanad-browser:state', snapshot()); }, 50);
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
function openPanel(name) { win?.webContents.focus(); win?.webContents.send('sanad-browser:open-panel', name); }
function dismissOverlay() { overlayGeneration++; overlay = false; }
async function showOverlay() {
  const generation = ++overlayGeneration, tab = active(), wc = tab?.view?.webContents, url = wc?.getURL();
  let preview, timer;
  // A bounded, memory-only raster keeps the page visible behind shell panels.
  // No page HTML enters the privileged renderer and no preview is persisted.
  if (!overlay && wc && !wc.isDestroyed()) {
    try {
      const image = await Promise.race([wc.capturePage(), new Promise(resolve => { timer = setTimeout(() => resolve(null), 1000); })]).finally(() => clearTimeout(timer));
      if (image && !image.isEmpty()) {
        const bounded = image.resize({ width: Math.min(1600, image.getSize().width) });
        const jpeg = bounded.toJPEG(75);
        if (jpeg.length <= 1500000) preview = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
      }
    } catch { /* Panels remain usable if the compositor cannot provide a frame. */ }
  }
  if (generation !== overlayGeneration || tab?.id !== activeId || wc?.isDestroyed() || wc?.getURL() !== url) return snapshot();
  overlay = true; layout();
  return { ...snapshot(), ...(preview ? { pagePreview: preview } : {}) };
}
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
      const allow = result.response === 1 && tab.profileId===profileManager.active.id && tab.id===activeId && !wc.isDestroyed() && new URL(wc.getURL()).origin === origin;
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
    const entry = { id: crypto.randomUUID(), name, received: 0, total: item.getTotalBytes(), status: 'progressing', profileId:profileManager?.active.id, private: Boolean(source.private), item, path: '' };
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
  if(!tabs.includes(tab)||tab.profileId!==profileManager.active.id)return;
  if (networkPrivacy.enabled || tab.private || store.state.preferences.search?.saveHistory === false || !mayRemember(tab.url, testMode)) return;
  store.state.history = [{ url: tab.url, title: tab.title, timestamp: Date.now() }, ...store.state.history.filter(item => item.url !== tab.url)].slice(0, 200);
  store.persist();
}
function publicSearchPreferences() { return normalizeSearchPreferences({ ...store.state.preferences.search, theme: store.state.preferences.theme }); }
async function syncSearchPreferences(wc, action = 'sync') {
  if (!tabs.some(tab=>tab.profileId===profileManager.active.id&&tab.view?.webContents===wc) || !wc || wc.isDestroyed() || !officialSearchPage(wc.getURL())) return;
  try { await wc.executeJavaScriptInIsolatedWorld(1005, [{ code: searchPreferenceScript(publicSearchPreferences(), action) }]); } catch { /* A future ready document receives the current preferences. */ }
}
function syncAllSearchPages(action = 'sync') { for (const tab of tabs) if (tab.view) void syncSearchPreferences(tab.view.webContents, action); }
function handleKeyboard(event, input) {
  if(switchingProfile){event.preventDefault();return;}
  if (input.type !== 'keyDown' || input.isComposing) return;
  const command = input.control || input.meta;
  const key = input.key.toLowerCase();
  if (command && ['l', 'k'].includes(key) && !input.shift) { event.preventDefault(); focusAddress(); }
  else if (command && key === 't') { event.preventDefault(); if (input.shift) restoreTab(); else { createTab(homeURL, Boolean(active()?.private)); focusAddress(); } }
  else if (command && input.shift && key === 'n') { event.preventDefault(); createTab(homeURL, true); focusAddress(); }
  else if (command && key === 'h') { event.preventDefault(); openPanel('history'); }
  else if (command && key === 'j') { event.preventDefault(); openPanel('downloads'); }
  else if (command && input.shift && key === 'o') { event.preventDefault(); openPanel('bookmarks'); }
  else if (command && input.shift && key === 'i') { event.preventDefault(); contents()?.openDevTools({ mode: 'detach' }); }
  else if (command && ['p', 's'].includes(key)) { event.preventDefault(); void commandFromKeyboard(key === 'p' ? 'print' : 'save-offline'); }
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
async function commandFromKeyboard(action) { try { await command(action, {}); } catch { message('تعذر تنفيذ الإجراء. جرّب مرة أخرى.'); } }
function attachView(tab, inheritedContents) {
  const ses = sessionFor(tab.private);
  const view = new WebContentsView({ webPreferences: {...preferences(ses),preload:path.join(__dirname,'page-preload.cjs')}, ...(inheritedContents ? { webContents: inheritedContents } : {}) });
  tab.view = view;
  win.contentView.addChildView(view);
  const wc = view.webContents;
  tab.youtube = createYouTubeInjection(wc, store.state.preferences.protection, Boolean(inheritedContents), userAgentOverride(ses.getUserAgent(), process.versions.chrome));
  wc.on('dom-ready', () => { void syncSearchPreferences(wc); void applyPageProtection(tab, wc); });
  wc.on('did-finish-load', () => { void syncSearchPreferences(wc); });
  wc.on('page-favicon-updated', (_event, urls) => {
    const url = urls.find(value => safeURL(value, testMode));
    if (!url || url === tab.iconURL) return;
    tab.iconURL = url; tab.iconRequest?.abort(); const controller = new AbortController(); tab.iconRequest = controller; const page = wc.getURL();
    void faviconAsset(ses.fetch.bind(ses), url, controller.signal, testMode).then(asset => {
      if (!asset || controller.signal.aborted || wc.isDestroyed() || wc.getURL() !== page || tab.view !== view) return;
      tabIcons.set(tab.id, asset); tab.iconVersion = (tab.iconVersion || 0) + 1; publish();
    });
  });
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
  for (const event of ['will-navigate', 'will-redirect']) wc.on(event, (e, url) => { const target = typeof url === 'string' ? url : e.url; if (event === 'will-navigate' && e.isMainFrame !== false && tab.id === activeId && officialSearchPage(wc.getURL()) && officialSearchPage(target) && ['native-settings','native-sync'].includes(new URL(target).searchParams.get('panel'))) { e.preventDefault(); openPanel(new URL(target).searchParams.get('panel')==='native-sync'?'sync':'settings'); return; } const normalized = nativeSiteURL(target, tab.private, testMode); if (!normalized) { e.preventDefault(); message('يسمح المتصفح بالمواقع المشفرة فقط.'); } else if (e.isMainFrame !== false && normalized !== target) { e.preventDefault(); void loadTabURL(tab, normalized); } });
  wc.setWindowOpenHandler(details => {
    if(switchingProfile||!tabs.includes(tab)||tab.profileId!==profileManager.active.id)return {action:'deny'};
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
  wc.on('did-navigate', (_event, url) => { if (url === 'about:blank' && !inheritedContents && tab.url !== 'about:blank') return; tab.iconRequest?.abort(); tab.iconURL = ''; tab.iconVersion = 0; tabIcons.delete(tab.id); tab.url = url; tab.error = ''; tab.diagnostics = null; tab.reader = null; remember(tab); publish(); });
  wc.on('did-navigate-in-page', (_event, url, isMainFrame) => { if (isMainFrame) { const normalized = nativeSiteURL(url, tab.private, testMode); if (normalized && normalized !== url) { void loadTabURL(tab, normalized); return; } tab.url = url; remember(tab); void applyPageProtection(tab, wc); publish(); } });
  wc.on('page-title-updated', (_event, title) => { if(!tabs.includes(tab)||tab.profileId!==profileManager.active.id)return;tab.title = String(title).slice(0, 200); if (!networkPrivacy.enabled && !tab.private) { const item = store.state.history.find(item => item.url === tab.url); if (item) { item.title = tab.title; store.persist(); } } publish(); });
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
  const tab = { id: crypto.randomUUID(), profileId:profileManager.active.id, title: 'تبويب جديد', url: safe, private: Boolean(isPrivate), pinned: false, muted: false, blocked: 0, error: '', zoom: 1, view: null };
  tabs.push(tab);
  attachView(tab, inheritedContents);
  if (load) { activate(tab.id); void loadTabURL(tab, safe); }
  publish(); return tab;
}
function activate(id, focusPage = true) {
  const tab = tabs.find(item => item.id === id);
  if (!tab) return;
  activeId = id; dismissOverlay(); notice = '';
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
  tab.iconRequest?.abort(); tabIcons.delete(id);
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
  if(!tabs.includes(tab)||tab.profileId!==profileManager.active.id||tab.view?.webContents!==wc)return;
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
  if(switchingProfile&&action!=='state')throw Error('جارٍ تبديل ملف التعريف.');
  if(action.startsWith('download-')&&downloads.get(data.id)?.profileId!==profileManager.active.id)return snapshot();
  const wc = contents(), tab = active();
  switch (action) {
    case 'state': return snapshot();
    case 'extension-install': case 'extension-toggle': case 'extension-remove': await extensionsManager.run(action,data);break;
    case 'profile-create': {const next=await profileManager.create(data.label,data.colour);await switchProfile(next.id);openPanel('sync');break;}
    case 'profile-switch': await switchProfile(data.id);openPanel('sync');break;
    case 'profile-rename': await profileManager.rename(profileManager.active.id,data.label,data.colour);break;
    case 'profile-archive': await profileManager.archive(data.id,data.archived!==false);break;
    case 'sync-selection': case 'sync-pause': await browserAccount.run(action,data);break;
    case 'omnibox-suggest': {
      omniboxRequest?.abort(); const request = new AbortController(); omniboxRequest = request;
      return { suggestions: await omniboxSuggestions(wc.session.fetch.bind(wc.session), data.value, publicSearchPreferences(), Boolean(tab.private || networkPrivacy.enabled), request.signal) };
    }
    case 'preconnect': { const url = safeURL(data.url, testMode); if (url && !tab.private && !networkPrivacy.enabled && !store.state.preferences.search?.dataSaver) wc.session.preconnect({ url: new URL(url).origin, numSockets: 1 }); break; }
    case 'settings': openPanel('settings'); break;
    case 'search-preferences': {
      const next = normalizeSearchPreferences(data.value);
      const { theme, ...search } = next;
      store.state.preferences.search = search; store.state.preferences.theme = theme; nativeTheme.themeSource = theme; store.persist(); syncAllSearchPages(); break;
    }
    case 'search-cache-clear': syncAllSearchPages('clear-cache'); message('تم مسح نتائج البحث والاقتراحات المؤقتة.'); break;
    case 'new': createTab(homeURL, data.private === true || (data.private !== false && Boolean(tab?.private))); focusAddress(); break;
    case 'activate': activate(data.id, data.focus !== 'tab-strip'); break;
    case 'tab-move': moveTab(data.id, typeof data.beforeId === 'string' ? data.beforeId : null); break;
    case 'duplicate': duplicateTab(data.id || activeId); break;
    case 'tab-context-menu': tabContextMenu(data); break;
    case 'close': closeTab(data.id); break;
    case 'restore': restoreTab(); break;
    case 'navigate': { const destination = resolveDestination(data.value, testMode); if (!destination) { message('اكتب رابطًا مشفرًا أو عبارة بحث.'); break; } if (destination.panel) { openPanel(destination.panel); break; } dismissOverlay(); layout(); tab.error = ''; void loadTabURL(tab, nativeSiteURL(destination.url, tab.private, testMode)); wc.focus(); break; }
    case 'home': dismissOverlay(); layout(); void loadTabURL(tab, nativeSiteURL(homeURL, tab.private, testMode)); break;
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
    case 'history-clear': store.state.history = []; store.persist(); syncAllSearchPages('clear-history'); break;
    case 'theme': store.state.preferences.theme = store.state.preferences.theme === 'dark' ? 'light' : 'dark'; nativeTheme.themeSource = store.state.preferences.theme; store.persist(); syncAllSearchPages(); break;
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
    case 'print': {
      if (!wc || wc.isDestroyed()) break;
      dismissOverlay(); layout();
      wc.print({ silent: false, printBackground: true }, (success, reason) => { if (!success && reason && !/cancel/i.test(reason)) message('تعذرت الطباعة. تحقق من إعدادات الطابعة وأعد المحاولة.'); });
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
      if (image) { dismissOverlay(); layout(); const capture = await wc.capturePage(); if (capture.isEmpty()) throw new Error('تعذر تصوير الصفحة.'); fs.writeFileSync(result.filePath, capture.toPNG()); }
      else await wc.savePage(result.filePath, 'MHTML');
      message(image ? 'تم حفظ صورة الصفحة.' : 'تم حفظ نسخة MHTML للقراءة بمتصفح متوافق دون اتصال.'); break;
    }
    case 'overlay': if (data.value === true) return showOverlay(); dismissOverlay(); layout(); break;
    case 'toolbar-height': if (Number.isFinite(data.value)) { toolbarHeight = Math.max(80, Math.min(320, Math.ceil(data.value))); layout(); } break;
    case 'devtools': wc?.openDevTools({ mode: 'detach' }); break;
    case 'fullscreen': win.setFullScreen(!win.isFullScreen()); break;
    case 'copy-link': { const url = cleanURL(tab?.url); if (url) { clipboard.writeText(url); message('نُسخ الرابط دون معاملات التتبع.'); } break; }
    case 'account': openPanel('sync'); break;
    case 'sync-sign-in': case 'sync-enable': case 'sync-now': case 'sync-sign-out': case 'chrome-profiles': case 'chrome-preview': case 'chrome-file-import': case 'chrome-import': await browserAccount.run(action,data); break;
    case 'updates-check': if (!data.automatic || (app.isPackaged && !tab?.private)) await updates.check({ automatic: data.automatic === true }); break;
    case 'updates-open': { if (storeDistribution) { if (networkPrivacy.enabled) { message('Microsoft Store تطبيق خارجي لا يشمله مسار الوسيط. أوقف وضع الوسيط قبل فتح تحديثات المتجر من هنا.'); break; } await shell.openExternal(STORE_UPDATES_URI); break; } const release = updates.snapshot(); if (release.releaseUrl && ['available', 'current', 'ahead'].includes(release.status)) createTab(release.releaseUrl, tab?.private); break; }
    case 'about-copy': clipboard.writeText(`Sanad Browser ${app.getVersion()} (${process.platform} ${process.arch})\nChromium ${process.versions.chrome}\nElectron ${process.versions.electron}\n${storeDistribution ? 'Microsoft Store · Store-managed updates' : 'Preview channel · manual installation'}`); message('نُسخت معلومات الإصدار.'); break;
    case 'chromium-licenses': { const next = createTab(homeURL, Boolean(tab?.private), false); if (next) { activate(next.id); void loadTabURL(next, 'sanad-licenses://app/chromium'); } break; }
    default: throw new Error('إجراء غير معروف.');
  }
  publish(); return snapshot();
}
async function applyCloudSnapshot({snapshot:incoming,restore,restoreDocument,includeHistory,importing=false}) {
  if(store.storageProtection.readOnly)throw Error('التخزين المحلي محمي من الكتابة.');
  const beforeCounts={bookmarks:store.state.bookmarks.length,history:store.state.history.length,tabs:tabs.length};
  const mergedBookmarks=importing?[...store.state.bookmarks,...incoming.bookmarks]:incoming.bookmarks;
  const nextBookmarks=sanitizeBookmarks(mergedBookmarks);
  const nextHistory=includeHistory?(importing?[...incoming.history,...store.state.history]:incoming.history).filter((item,index,all)=>safeURL(item.url)&&mayRemember(item.url)&&all.findIndex(other=>other.url===item.url)===index).sort((a,b)=>b.timestamp-a.timestamp).slice(0,200):store.state.history;
  const nextSearch=normalizeSearchPreferences({...store.state.preferences.search,theme:store.state.preferences.theme,...incoming.settings,safeSearch:'strict'});
  const {theme,...search}=nextSearch;const nextPreferences={...store.state.preferences,theme,search};
  if(Buffer.byteLength(JSON.stringify({...store.state,bookmarks:nextBookmarks,history:nextHistory,preferences:nextPreferences}))>MAX_STATE_BYTES)throw Error('حجم البيانات المختارة يتجاوز سعة الملف المحلي. اختر مجموعة أصغر.');
  store.state.bookmarks=nextBookmarks;store.state.history=nextHistory;store.state.preferences=nextPreferences;nativeTheme.themeSource=theme;store.persist();syncAllSearchPages();
  if(restore){const source=Object.values(restoreDocument?.tabs||{}).sort((a,b)=>b.updated-a.updated)[0];const known=new Set(tabs.filter(tab=>!tab.private).map(tab=>tab.url));
    for(const item of source?.entries||[]){if(tabs.length>=MAX_TABS)break;const url=safeURL(item.url);if(!url||!mayRemember(url)||known.has(url))continue;known.add(url);const next=createTab(url,false,false);if(next){next.title=String(item.title||url).slice(0,200);next.pinned=item.pinned===true;destroyView(next);}}
  }
  publish();
  return {bookmarks:Math.max(0,nextBookmarks.length-beforeCounts.bookmarks),history:Math.max(0,nextHistory.length-beforeCounts.history),tabs:Math.max(0,tabs.length-beforeCounts.tabs),settings:Object.keys(incoming.settings||{}).length};
}
function rememberSession(){if(!store||!sessionsReady||switchingProfile||networkPrivacy.enabled)return;store.state.session=tabs.filter(tab=>!tab.private&&mayRemember(tab.url)).slice(0,32).map(tab=>({url:tab.url,title:tab.title,pinned:tab.pinned,active:tab.id===activeId}));store.persist();}
function restoreSession(){sessionsReady=false;const saved=store.state.session||[];let selected;for(const item of saved){const tab=createTab(item.url,false,false);if(!tab)continue;tab.title=item.title;tab.pinned=item.pinned;destroyView(tab);if(item.active)selected=tab.id;}if(tabs.length)activate(selected||tabs[0].id);else createTab(homeURL);sessionsReady=true;}
async function startProfileServices(){
 const currentStore=store,currentVault=privateVault,epoch=profileEpoch,profileId=profileManager.active.id;
 extensionsManager=await createExtensionsManager({directory:profileManager.directory(profileId),profileId,session:regularSession,safeStorage,dialog,window:()=>win,enabled:!networkPrivacy.enabled,onChange:publish});
 vaultActions=createVaultActions({vault:currentVault,active,profileId:()=>profileManager.active.id,expectedProfile:profileId,clipboard,dialog,window:()=>win,onChange:publish});
 browserAccount=await createNativeAccount({store:currentStore,vault:currentVault,session:regularSession,
 readSnapshot:()=>({bookmarks:currentStore.state.bookmarks,history:currentStore.state.history,settings:{...currentStore.state.preferences.search,theme:currentStore.state.preferences.theme},tabs:epoch===profileEpoch?tabs.filter(tab=>!tab.private).map(tab=>({url:tab.url,title:tab.title,pinned:tab.pinned})):[]}),
 applyRemote:data=>{if(epoch!==profileEpoch)throw Error('profile_changed');return applyCloudSnapshot(data);},onStatus:publish,openExternal:url=>shell.openExternal(url),showPanel:openPanel,notify:message,isPrivate:()=>epoch!==profileEpoch||switchingProfile||Boolean(active()?.private),proxyEnabled:()=>networkPrivacy.enabled,dialog,window:()=>win,
 onAuthenticated:async auth=>{if(epoch!==profileEpoch)throw Error('profile_changed');let target=profileManager.findAccount(auth.identity.uid);if(!target&&!profileManager.active.identity){await profileManager.claim(profileId,auth.identity);return false;}if(target?.id===profileId){await profileManager.claim(profileId,auth.identity);return false;}if(!target)target=await profileManager.create(auth.identity.name||auth.identity.email);if(target.archived)await profileManager.archive(target.id,false);delete currentStore.state.syncPending;await currentStore.flush();await switchProfile(target.id,auth);openPanel('sync');return true;}
 });
}
async function switchProfile(id,auth){
 if(switchingProfile||id===profileManager.active.id)return;
 rememberSession();switchingProfile=true;
 try{
  const dir=profileManager.directory(id);
  const nextStore=await openEncryptedStore(dir,{safeStorage,context:profileManager.context(id)});
  const nextVault=await openPrivateVault(dir,id,{safeStorage});
  if(nextStore.storageProtection.status!=='encrypted'||nextVault.protection.status!=='encrypted')throw Error('تعذر فتح ملف التعريف المشفر.');
  if(auth){
   const {accountRequest}=await import('./browser-account-client.mjs');
   await accountRequest('device',{token:auth.token,body:{deviceId:nextStore.state.deviceId},fetchImpl:regularSession.fetch.bind(regularSession)});
   await profileManager.claim(id,auth.identity);
   nextStore.state.sync={...auth,deviceId:nextStore.state.deviceId};await nextStore.flush();
  }
  const targetIdentity=profileManager.get(id).identity;
  if(targetIdentity&&nextStore.state.sync?.identity?.uid&&targetIdentity.uid!==nextStore.state.sync.identity.uid)throw Error('profile_account_mismatch');
  await store.flush();await privateVault.flush().catch(()=>{});await profileManager.activate(id);
  browserAccount.stop();vaultActions.dispose();await extensionsManager?.dispose();profileEpoch++;omniboxRequest?.abort();
  for(const tab of tabs){tab.iconRequest?.abort();destroyView(tab);}
  tabs.length=0;closedTabs.length=0;tabIcons.clear();permissionGrants.clear();await cleanupPrivate();
  store=nextStore;privateVault=nextVault;
  regularSession=session.fromPartition(networkPrivacy.enabled?'sanad-network-'+crypto.randomUUID():profileManager.partition(id));
  prepareSession(regularSession);protection.set(regularSession,store.state.preferences.protection);await sessionSetup.get(regularSession);
  nativeTheme.themeSource=store.state.preferences.theme;activeId=null;await startProfileServices();restoreSession();
 }finally{switchingProfile=false;publish();}
 void browserAccount.start();
}
async function shutdown() {
  if (shuttingDown) return;
  rememberSession();shuttingDown = true; browserAccount?.stop();vaultActions?.dispose();await extensionsManager?.dispose(); clearTimeout(publishTimer);
  for (const tab of tabs) destroyView(tab);
  tabs.length = 0;
  try { await store?.flush();await privateVault?.flush().catch(()=>{}); } catch { /* Preserve the last committed snapshot. */ }
  protection?.dispose(); app.quit();
}
async function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 860, minWidth: 700, minHeight: 540, title: 'سَنَد الحرمين', icon: path.join(__dirname, 'assets/mark.png'), backgroundColor: '#101820', autoHideMenuBar: true, webPreferences: { ...preferences(session.defaultSession), preload: path.join(__dirname, 'preload.cjs') } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('before-input-event', handleKeyboard);
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.on('resize', layout);
  win.on('focus', () => { void browserAccount?.run('sync-now').catch(() => {}); });
  win.webContents.on('did-finish-load', publish);
  win.on('close', event => { if (!shuttingDown) { event.preventDefault(); void shutdown(); } });
  await win.loadURL('sanad-app://browser/index.html');
  restoreSession();
}
app.whenReady().then(async () => {
  if(!primaryInstance)return;
  if(!process.windowsStore){if(process.defaultApp&&process.argv[1])app.setAsDefaultProtocolClient('sanad',process.execPath,[path.resolve(process.argv[1])]);else app.setAsDefaultProtocolClient('sanad');}
  if (privacyStartupError) { dialog.showErrorBox('تعذر فتح إعدادات حماية الاتصال', privacyStartupError.message); throw privacyStartupError; }
  if (networkPrivacy.enabled) app.configureHostResolver({ secureDnsMode: 'off', enableBuiltInResolver: false, enableAdditionalDnsQueryTypes: false });
  profileManager=await openProfileManager(app.getPath('userData'),{safeStorage});
  store = await openEncryptedStore(profileManager.directory(profileManager.active.id), { safeStorage,context:profileManager.context(profileManager.active.id), onError: () => message('تعذّر فتح البيانات المحمية أو حفظها. بقي الملف الأصلي محفوظًا؛ راجع حالة حماية البيانات في «حول Sanad».') });
  privateVault=await openPrivateVault(profileManager.directory(profileManager.active.id),profileManager.active.id,{safeStorage});
  if(store.state.sync?.identity&&!profileManager.active.identity&&profileManager.protection.status==='encrypted')await profileManager.claim(profileManager.active.id,store.state.sync.identity);
  if(profileManager.active.identity&&store.state.sync?.identity?.uid&&profileManager.active.identity.uid!==store.state.sync.identity.uid)throw Error('profile_account_mismatch');
  const feedURL = testMode && safeURL(process.env.SANAD_BROWSER_TEST_UPDATE_URL, true) ? process.env.SANAD_BROWSER_TEST_UPDATE_URL : UPDATE_FEED;
  updates = storeDistribution ? createStoreUpdateChecker() : createUpdateChecker({ version: app.getVersion(), feedURL, changed: publish, fetchImpl: (url, options) => net.fetch(url, options) });
  nativeTheme.themeSource = store.state.preferences.theme;
  protection = createProtection(app.getPath('userData'), request => { const tab = tabs.find(item => item.view?.webContents.id === Number(request.tabId)); if (tab) { tab.blocked++; publish(); } });
  regularSession = session.fromPartition(networkPrivacy.enabled ? `sanad-network-${crypto.randomUUID()}` : profileManager.partition(profileManager.active.id));
  prepareSession(session.defaultSession); prepareSession(regularSession);
  await Promise.all([sessionSetup.get(session.defaultSession), sessionSetup.get(regularSession)]);
  protocol.handle('sanad-app', request => {
    const url = new URL(request.url);
    const file = url.hostname === 'browser' && localFiles.get(url.pathname);
    if (url.hostname === 'browser' && url.pathname.startsWith('/favicon/')) { const icon = tabIcons.get(url.pathname.slice('/favicon/'.length)); return icon ? new Response(icon.data, { headers: { 'Content-Type': icon.mime, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; script-src 'none'" } }) : new Response('Not found', { status: 404 }); }
    if (!file) return new Response('Not found', { status: 404 });
    return new Response(fs.readFileSync(path.join(__dirname, file[0])), { headers: { 'Content-Type': file[1], 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'" } });
  });
  ipcMain.handle('sanad-browser:command', async (event, action, data = {}) => {
    if (switchingProfile || !trustedSender(event, win?.webContents) || typeof action !== 'string' || !data || typeof data !== 'object' || JSON.stringify(data).length > 10000) throw new Error('Request rejected');
    try { return await command(action, data); } catch (error) { message(error instanceof Error ? error.message : 'تعذر تنفيذ الإجراء.'); return snapshot(); }
  });
  ipcMain.handle('sanad-browser:vault',async(event,action,data={})=>{if(!trustedSender(event,win?.webContents)||switchingProfile||!data||typeof data!=='object'||JSON.stringify(data).length>12000)throw Error('Request rejected');return vaultActions.run(action,data);});
  ipcMain.handle('sanad-browser:form-submission',async(event,data)=>{if(!switchingProfile)await handleFormSubmission(event,data,{active,profileId:()=>profileManager.active.id,vault:()=>privateVault,dialog,window:()=>win,onChange:publish});});
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'سَنَد', submenu: [{ label: 'تبويب جديد', accelerator: 'CmdOrCtrl+T', click: () => { createTab(homeURL, Boolean(active()?.private)); focusAddress(); } }, { label: 'بحث دون حفظ السجل', accelerator: 'CmdOrCtrl+Shift+N', click: () => { createTab(homeURL, true); focusAddress(); } }, { label: 'استعادة التبويب', accelerator: 'CmdOrCtrl+Shift+T', click: restoreTab }, { type: 'separator' }, { role: 'quit' }] }]));
  await createWindow();
  await startProfileServices();
  browserAccount.start();for(const url of pendingAuthURLs.splice(0))void browserAccount.handleURL(url);publish();
}).catch(error => { console.error(error.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => { if (!shuttingDown && store) { event.preventDefault(); void shutdown(); } });



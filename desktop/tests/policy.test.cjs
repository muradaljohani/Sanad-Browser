'use strict';
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { HOME, safeURL, resolveDestination, cleanURL, nativeSiteURL, mayRemember, sanitizeBookmarks, trustedSender } = require('../policy.cjs');
const { openStore } = require('../store.cjs');
const { pageActions } = require('../page-actions.cjs');
test('remote destinations allow encrypted websites and reject executable or privileged protocols', () => {
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hello', 'chrome://settings', 'https://u:p@example.com', 'http://example.com', 'https://exam\nple.com']) assert.equal(safeURL(url), null);
  assert.equal(safeURL('https://example.com'), 'https://example.com/');
  assert.equal(safeURL('http://127.0.0.1:8000', true), 'http://127.0.0.1:8000/');
  assert.equal(safeURL('http://127.0.0.1:8000'), null);
  assert.equal(safeURL('http://example.com', true), null);
});
test('address resolution preserves literal search terms, and credits are a local panel', () => {
  for (const value of ['C++ std::vector', '100% & safeSearch=off#x', 'الحرم المكي']) {
    const url = new URL(resolveDestination(value).url); assert.equal(url.searchParams.get('q'), value); assert.equal(url.searchParams.get('surface'), 'desktop'); assert.equal(url.hash, '');
  }
  assert.equal(resolveDestination('github.com/brave/brave-core').url, 'https://github.com/brave/brave-core');
  assert.equal(resolveDestination('sanad://newtab').url, HOME);
  assert.deepEqual(resolveDestination('chrome://credits/'), { panel: 'about' });
  assert.equal(resolveDestination('javascript:alert(1)'), null);
});
test('private Sanad searches retain private mode without advertising it to unrelated sites', () => {
  const url = new URL(nativeSiteURL('https://ip-murad.com/browser?q=C%2B%2B', true)); assert.equal(url.searchParams.get('q'), 'C++'); assert.equal(url.searchParams.get('surface'), 'desktop'); assert.equal(url.searchParams.get('mode'), 'private');
  assert.equal(new URL(nativeSiteURL(url.href, false)).searchParams.has('mode'), false);
  assert.equal(nativeSiteURL('https://example.com/news?q=article', true), 'https://example.com/news?q=article');
  assert.equal(cleanURL(url.href), 'https://sanadbrowser.com/web/?q=C%2B%2B'); assert.equal(nativeSiteURL('javascript:alert(1)', true), null);
});
test('authentication callback secrets are excluded from history and saved bookmarks', () => {
  for (const url of ['https://example.com/oauth/callback?code=secret', 'https://example.com/?token=secret', 'https://example.com/#access_token=secret', 'https://example.com/sign-in']) assert.equal(mayRemember(url), false);
  assert.equal(mayRemember('https://example.com/docs?q=C%2B%2B'), true);
});
test('bookmark import deduplicates and bounds entries while ignoring malformed or unsafe links', () => {
  const list = sanitizeBookmarks({ bookmarks: [{ url: 'https://example.com/', title: 'First' }, { url: 'https://example.com', title: 'Duplicate' }, { url: 'javascript:alert(1)', title: 'Unsafe' }, null, { url: 'https://example.com?code=secret' }, { url: 'https://example.org', title: '<img src=x>' }] });
  assert.equal(list.length, 2); assert.equal(list[0].title, 'First'); assert.equal(list[1].title, '<img src=x>');
  assert.throws(() => sanitizeBookmarks({ wrong: [] }));
  assert.equal(sanitizeBookmarks(Array.from({ length: 1100 }, (_, i) => ({ url: `https://example.com/${i}` }))).length, 1000);
});
test('clean link removes known trackers without damaging signed or application parameters', () => {
  assert.equal(cleanURL('https://example.com/page?utm_source=ads&fbclid=x&q=C%2B%2B&signature=ok#section'), 'https://example.com/page?q=C%2B%2B&signature=ok#section');
  assert.equal(cleanURL('javascript:alert(1)'), null);
  assert.equal(cleanURL('https://ip-murad.com/browser?surface=desktop&q=C%2B%2B'), 'https://ip-murad.com/browser?q=C%2B%2B');
});
test('only the exact trusted shell and its main frame may issue privileged commands', () => {
  const frame = { url: 'sanad-app://browser/index.html' }; const shell = { mainFrame: frame, isDestroyed: () => false };
  assert.equal(trustedSender({ sender: shell, senderFrame: frame }, shell), true);
  assert.equal(trustedSender({ sender: {}, senderFrame: frame }, shell), false);
  assert.equal(trustedSender({ sender: shell, senderFrame: { url: frame.url } }, shell), false);
  frame.url = 'https://example.com'; assert.equal(trustedSender({ sender: shell, senderFrame: frame }, shell), false);
});
test('atomic state survives restart and corrupt files recover without storing arbitrary fields', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-policy-'));
  try {
    const store = openStore(directory); store.state.bookmarks = [{ url: 'https://example.com/', title: 'Saved' }]; store.state.history = [{ url: 'https://example.com/', title: 'Visit', timestamp: 10 }]; store.state.preferences.theme = 'light'; store.flush();
    const reopened = openStore(directory); assert.deepEqual(reopened.state, store.state);
    fs.writeFileSync(path.join(directory, 'browser-state-v1.json'), 'bad JSON'); assert.equal(openStore(directory).state.bookmarks.length, 0);
    fs.writeFileSync(path.join(directory, 'browser-state-v1.json'), JSON.stringify({ cookies: 'secret', history: [{ url: 'https://example.com/?access_token=secret', title: 'Auth' }] })); const clean = openStore(directory); assert.equal(clean.state.history.length, 0); assert.equal(clean.state.cookies, undefined);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('page context actions reject unsafe links and keep selected searches literal', () => {
  const opened = [], copied = [], actions = []; const callbacks = { open: (...value) => opened.push(value), copy: text => copied.push(text), run: name => actions.push(name) };
  const menu = pageActions({ linkURL: 'https://example.com/?utm_source=ads&q=C%2B%2B', selectionText: 'C++ & 100% #literal', formControlType: 'none' }, callbacks);
  menu.find(item => item.label === 'فتح الرابط في تبويب خاص').click(); assert.equal(opened[0][1], true);
  menu.find(item => item.label?.startsWith('نسخ رابط')).click(); assert.equal(copied[0], 'https://example.com/?q=C%2B%2B');
  menu.find(item => item.label?.startsWith('البحث عن')).click(); const url = new URL(opened[1][0]); assert.equal(url.searchParams.get('q'), 'C++ & 100% #literal'); assert.equal(url.hash, '');
  menu.find(item => item.label === 'فتح الرابط في الخلفية').click(); assert.deepEqual(opened[2], ['https://example.com/?utm_source=ads&q=C%2B%2B', false, true]);
  for (const linkURL of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:secret@example.com']) assert.equal(pageActions({ linkURL }, callbacks).some(item => item.label?.startsWith('فتح الرابط')), false);
  const password = pageActions({ selectionText: 'secret', isEditable: true, formControlType: 'input-password', editFlags: { canCopy: false, canPaste: true } }, callbacks); assert.equal(password.some(item => item.label?.startsWith('البحث عن')), false); assert.equal(password.find(item => item.role === 'copy').enabled, false);
});

test('malformed dotted addresses finish promptly while normal hostname forms retain navigation', () => {
  const policy = require.resolve('../policy.cjs');
  const source = "const { resolveDestination } = require(process.argv[1]); for (const value of ['a.'.repeat(999)+'@', '!.'.repeat(600)+'@']) { const result=resolveDestination(value); if (!result || !result.url.includes('/web/?')) process.exit(1); }";
  const result = spawnSync(process.execPath, ['-e', source, policy], { timeout: 2000, encoding: 'utf8' });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
  for (const value of ['example.com.', 'sub.example.com:8443/a.b?q=a.b#part', 'münich.example']) assert.equal(resolveDestination(value).url, new URL(`https://${value}`).href);
});



test('desktop home and searches use the lightweight official entry, including legacy search returns', () => {
  assert.equal(new URL(HOME).origin, 'https://sanadbrowser.com'); assert.equal(new URL(HOME).pathname, '/web/');
  const search = new URL(resolveDestination('تشفير C++ & 100%').url); assert.equal(search.origin, 'https://sanadbrowser.com'); assert.equal(search.searchParams.get('q'), 'تشفير C++ & 100%');
  const migrated = new URL(nativeSiteURL('https://ip-murad.com/browser?q=test&category=images&language=ar#section', true));
  assert.equal(migrated.origin, 'https://sanadbrowser.com'); assert.equal(migrated.searchParams.get('category'), 'images'); assert.equal(migrated.searchParams.get('language'), 'ar'); assert.equal(migrated.hash, '#section'); assert.equal(migrated.searchParams.get('mode'), 'private');
  for (const url of ['https://sanadbrowser.com.evil.example/web/?q=x', 'https://ip-murad.com/profile/studio', 'https://sanadbrowser.com:8443/web/?q=x']) assert.equal(nativeSiteURL(url, true), url);
});

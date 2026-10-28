'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { unsafeStartupSwitch, downloadName, executableDownload, downloadSourceAllowed } = require('../security.cjs');
const { safeURL, trustedSender } = require('../policy.cjs');
test('packaged startup refuses switches that bypass isolation, TLS or expose remote debugging', () => {
  for (const name of ['no-sandbox', 'disable-web-security', 'ignore-certificate-errors', 'remote-debugging-port', 'inspect-brk']) assert.equal(unsafeStartupSwitch({ hasSwitch: value => value === name }), name);
  assert.equal(unsafeStartupSwitch({ hasSwitch: () => false }), null);
});
test('download names cannot create paths, NTFS streams, reserved Windows devices or direction spoofing', () => {
  for (const raw of ['../../evil.exe', 'file.txt:payload.exe', 'CON.exe', 'NUL', 'safe\u202eexe.txt', 'trailing. ']) {
    const name = downloadName(raw); assert(!/[\\/:\u202a-\u202e\u2066-\u2069]/.test(name)); assert(!/^(CON|NUL)(\.|$)/i.test(name)); assert(!/[. ]$/.test(name));
  }
  assert.equal(executableDownload('setup.exe'), true); assert.equal(executableDownload('invoice.PS1'), true); assert.equal(executableDownload('photo.jpg'), false);
});
test('downloads allow HTTPS redirects and same-origin blobs, rejecting privileged and foreign blobs', () => {
  assert(downloadSourceAllowed(['https://download.example/setup.exe'], 'https://example.com', safeURL));
  assert(downloadSourceAllowed(['blob:https://example.com/id'], 'https://example.com/page', safeURL));
  for (const chain of [[], ['file:///tmp/payload'], ['javascript:alert(1)'], ['blob:https://evil.example/id'], ['http://download.example/file']]) assert.equal(downloadSourceAllowed(chain, 'https://example.com', safeURL), false);
});
test('privileged IPC cannot be sent from a sibling custom-protocol document or a remote page', () => {
  const frame = { url: 'sanad-app://browser/index.html' }; const shell = { mainFrame: frame, isDestroyed: () => false };
  assert(trustedSender({ sender: shell, senderFrame: frame }, shell));
  for (const url of ['sanad-app://browser/other.html', 'sanad-app://browser/index.html?query=x', 'https://example.com']) { frame.url = url; assert.equal(trustedSender({ sender: shell, senderFrame: frame }, shell), false); }
});
test('distribution enables Electron fuse protections and installs without administrator privileges', () => {
  const config = require('../package.json').build;
  for (const key of ['runAsNode', 'enableNodeOptionsEnvironmentVariable', 'enableNodeCliInspectArguments', 'grantFileProtocolExtraPrivileges']) assert.equal(config.electronFuses[key], false);
  for (const key of ['enableCookieEncryption', 'enableEmbeddedAsarIntegrityValidation', 'onlyLoadAppFromAsar']) assert.equal(config.electronFuses[key], true);
  assert.equal(config.nsis.perMachine, false); assert.equal(config.nsis.allowElevation, false);
  assert(!fs.readFileSync(require.resolve('../preload.cjs'), 'utf8').includes('sendSync'));
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { brandedUserAgent, userAgentOverride } = require('../user-agent.cjs');
const core = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.8078.49 Safari/537.36';

test('brands the actual Chromium engine without Electron or the package name', () => {
  const actual = brandedUserAgent(core + ' sanad-browser-desktop/1.3.4 Electron/45.1.0', '1.3.5');
  assert.equal(actual, core + ' SanadBrowser/1.0.0');
  assert.ok(!/Electron|sanad-browser-desktop/i.test(actual));
});

test('replaces old or repeated Sanad tokens and stays idempotent', () => {
  for (const product of ['SanadBrowser/1.0.0', 'Sanad-Browser/1.0.0', 'Sanad Browser/1.0.0', 'ElectronApplication/1.0.0']) {
    const once = brandedUserAgent(core + ' ' + product + ' Electron/45.1.0 SanadBrowser/1.2.0', '1.3.5');
    assert.equal(once, core + ' SanadBrowser/1.0.0'); assert.equal(brandedUserAgent(once, '1.3.5'), once);
  }
});

test('retains platform and real engine versions across supported desktop systems', () => {
  for (const platform of ['Windows NT 10.0; Win64; x64', 'X11; Linux x86_64', 'Macintosh; Intel Mac OS X 14_6']) {
    const base = core.replace('Windows NT 10.0; Win64; x64', platform).replace('156.0.8078.49', '157.1.2.3');
    assert.equal(brandedUserAgent(base + ' Electron/46.0.0', '2.0.0'), base + ' SanadBrowser/1.0.0');
  }
});

test('rejects invalid versions, control characters and incomplete engine identities', () => {
  for (const version of ['', '1.0\r\nX-Test: bad', '1.3.5\n', '1.2', '1.2.3 x', null]) assert.throws(() => brandedUserAgent(core, version));
  for (const base of ['', 'Electron/45.1.0', core + '\nX-Test: bad', 'x'.repeat(4097), null]) assert.throws(() => brandedUserAgent(base, '1.3.5'));
});
test('network Client Hints use SanadBrowser 1.0.0 while retaining the real Chromium platform and engine', () => {
  const identity = userAgentOverride(core + ' Electron/45.1.0', '156.0.8078.49', 'win32', 'x64');
  assert(identity.userAgent.endsWith('SanadBrowser/1.0.0'));
  assert.deepEqual(identity.userAgentMetadata.fullVersionList, [{ brand: 'Chromium', version: '156.0.8078.49' }, { brand: 'SanadBrowser', version: '1.0.0' }]);
  assert.equal(identity.userAgentMetadata.platform, 'Windows'); assert.equal(identity.userAgentMetadata.mobile, false);
});


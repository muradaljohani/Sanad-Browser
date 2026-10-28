'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStoreConfig } = require('../store-config.cjs');
const { createStoreUpdateChecker, STORE_UPDATES_URI } = require('../store-distribution.cjs');
const identity = {
  SANAD_STORE_IDENTITY_NAME: '12345.MuradSanad',
  SANAD_STORE_PUBLISHER: 'CN=12345678-1234-1234-1234-123456789abc',
  SANAD_STORE_PUBLISHER_DISPLAY_NAME: 'Murad Aljohani',
  SANAD_STORE_DISPLAY_NAME: 'سَنَد الحرمين',
};
test('a Store submission requires every exact Partner Center identity field', () => {
  assert.throws(() => createStoreConfig({}), /Partner Center/);
  for (const key of Object.keys(identity)) { const env = { ...identity }; delete env[key]; assert.throws(() => createStoreConfig(env), new RegExp(key)); }
  for (const bad of [{ SANAD_STORE_IDENTITY_NAME: '../outside' }, { SANAD_STORE_PUBLISHER: 'CN=ms' }, { SANAD_STORE_PUBLISHER: 'CN=Sanad Store CI' }, { SANAD_STORE_DISPLAY_NAME: 'name\nInjected' }]) assert.throws(() => createStoreConfig({ ...identity, ...bad }));
});
test('Store config preserves the real identity, hardening and minimum capabilities', () => {
  const config = createStoreConfig(identity);
  assert.equal(config.appx.identityName, identity.SANAD_STORE_IDENTITY_NAME);
  assert.equal(config.appx.publisher, identity.SANAD_STORE_PUBLISHER);
  assert.equal(config.appx.displayName, identity.SANAD_STORE_DISPLAY_NAME);
  assert.equal(config.appx.applicationId, 'SanadBrowser');
  assert.deepEqual(config.appx.capabilities, ['internetClient', 'runFullTrust']);
  assert.equal(config.appx.addAutoLaunchExtension, false);
  assert.equal(config.appx.electronUpdaterAware, false);
  assert.equal(config.electronFuses.runAsNode, false);
  assert.equal(config.electronFuses.enableNodeOptionsEnvironmentVariable, false);
  assert.equal(config.electronFuses.onlyLoadAppFromAsar, true);
  assert.equal(config.electronFuses.enableEmbeddedAsarIntegrityValidation, true);
  assert.equal(config.directories.output, 'dist-store');
  assert.match(config.appx.artifactName, /-Store\.msix$/);
});
test('CI packages have a separate test identity and artifact directory', () => {
  const config = createStoreConfig({ SANAD_STORE_BUILD_KIND: 'ci-test' });
  assert.equal(config.appx.identityName, 'SanadAlHaramain.CI');
  assert.equal(config.appx.publisher, 'CN=Sanad Store CI');
  assert.equal(config.directories.output, 'dist-store-ci');
  assert.match(config.appx.artifactName, /CI-ONLY/);
  assert.throws(() => createStoreConfig({ SANAD_STORE_BUILD_KIND: 'other' }));
});
test('Store-managed updates never expose a direct installer or query a release feed', async () => {
  const checker = createStoreUpdateChecker();
  assert.equal(STORE_UPDATES_URI, 'ms-windows-store://downloadsandupdates');
  assert.equal(checker.snapshot().installation, 'microsoft-store');
  assert.equal((await checker.check({ automatic: true })).status, 'store-managed');
  assert.equal((await checker.check()).releaseUrl, null);
  const snapshot = checker.snapshot(); snapshot.notes.push('modified');
  assert.deepEqual(checker.snapshot().notes, []);
});

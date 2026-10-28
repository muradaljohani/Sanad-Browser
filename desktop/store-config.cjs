'use strict';
const base = require('./package.json').build;
function required(env, key, max) {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) throw new Error(`Set ${key} from Partner Center Product identity before building a Store submission.`);
  return value;
}
function createStoreConfig(env = process.env) {
  const kind = env.SANAD_STORE_BUILD_KIND || 'submission';
  if (!['submission', 'ci-test'].includes(kind)) throw new Error('Unknown Store package build kind');
  const ci = kind === 'ci-test';
  const identityName = ci ? 'SanadAlHaramain.CI' : required(env, 'SANAD_STORE_IDENTITY_NAME', 50);
  const publisher = ci ? 'CN=Sanad Store CI' : required(env, 'SANAD_STORE_PUBLISHER', 1024);
  const publisherDisplayName = ci ? 'Sanad CI fixture' : required(env, 'SANAD_STORE_PUBLISHER_DISPLAY_NAME', 256);
  const displayName = ci ? 'Sanad Store CI' : required(env, 'SANAD_STORE_DISPLAY_NAME', 256);
  if (!/^[A-Za-z0-9.-]{3,50}$/.test(identityName)) throw new Error('Invalid Store package identity name');
  if (!publisher.startsWith('CN=')) throw new Error('Copy the exact Package/Identity/Publisher value from Partner Center');
  if (!ci && (identityName === 'SanadAlHaramain.CI' || ['CN=ms', 'CN=Sanad Store CI'].includes(publisher))) throw new Error('A CI or placeholder publisher cannot be used for a Store submission');
  const { nsis, portable, linux, ...common } = base;
  return {
    ...common,
    directories: { ...base.directories, output: ci ? 'dist-store-ci' : 'dist-store' },
    // v26's AppX target uses MakeAppx for both AppX and MSIX, with the same
    // Windows manifest. The output is packed as MSIX by the Windows SDK.
    win: { ...base.win, target: [{ target: 'appx', arch: ['x64'] }], forceCodeSigning: false },
    appx: {
      identityName, publisher, publisherDisplayName, displayName,
      applicationId: 'SanadBrowser',
      artifactName: ci ? 'Sanad-Browser-${version}-x64-CI-ONLY.msix' : 'Sanad-Browser-${version}-x64-Store.msix',
      languages: ['ar-SA'],
      capabilities: ['internetClient', 'runFullTrust'],
      addAutoLaunchExtension: false,
      electronUpdaterAware: false,
      setBuildNumber: false,
      minVersion: '10.0.19041.0',
      maxVersionTested: '10.0.26100.0',
      customManifestPath: 'store-manifest.xml',
      backgroundColor: '#071a16',
    },
  };
}
module.exports = { createStoreConfig };

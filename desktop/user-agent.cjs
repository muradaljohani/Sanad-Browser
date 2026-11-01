'use strict';

// Preserve Chromium's real engine, OS and architecture tokens. Replace only
// this application's old product tokens with one stable Sanad identity.
const OWN_PRODUCTS = /(?:^|\s)(?:Electron(?:Application)?|Electron[ -]Application|sanad-browser-desktop|SanadBrowser|Sanad(?:[- ]Browser)?)\/[^\s]+/gi;
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const BRAND_VERSION = '1.0.0';

function brandedUserAgent(original, version) {
  if (typeof original !== 'string' || original.length > 4096 || /[\x00-\x1f\x7f]/.test(original)) throw new Error('Invalid browser user agent');
  if (typeof version !== 'string' || version.length > 80 || /[\x00-\x20\x7f]/.test(version) || !VERSION.test(version)) throw new Error('Invalid browser version');
  const engine = original.replace(OWN_PRODUCTS, ' ').replace(/\s+/g, ' ').trim();
  if (!engine || !/\bChrome\/\d+(?:\.\d+)*/.test(engine)) throw new Error('Missing Chromium user agent');
  return `${engine} SanadBrowser/${BRAND_VERSION}`;
}

function userAgentOverride(original, chromeVersion, platform = process.platform, arch = process.arch) {
  if (typeof chromeVersion !== 'string' || !/^\d+(?:\.\d+){1,3}$/.test(chromeVersion)) throw new Error('Invalid Chromium version');
  const major = chromeVersion.split('.')[0];
  return { userAgent: brandedUserAgent(original, BRAND_VERSION), userAgentMetadata: {
    brands: [{ brand: 'Chromium', version: major }, { brand: 'SanadBrowser', version: BRAND_VERSION }],
    fullVersionList: [{ brand: 'Chromium', version: chromeVersion }, { brand: 'SanadBrowser', version: BRAND_VERSION }],
    platform: platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux', platformVersion: '', architecture: arch.startsWith('arm') ? 'arm' : 'x86', model: '', mobile: false, bitness: arch.includes('64') ? '64' : '32'
  } };
}
module.exports = { BRAND_VERSION, brandedUserAgent, userAgentOverride };


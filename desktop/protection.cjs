'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { net } = require('electron');
const { parse: parseDomain } = require('tldts-experimental');
const { MAX_BUNDLE_BYTES, fetchFilterLists, compileFilters, parseBundle } = require('./filter-lists.cjs');
const warningSetting = process.env.ELECTRON_DISABLE_SECURITY_WARNINGS;
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
if (warningSetting === undefined) delete process.env.ELECTRON_DISABLE_SECURITY_WARNINGS;
else process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = warningSetting;
// Last-resort rules if both the packaged and updated filter bundles are invalid.
const STARTER = [
  '||google-analytics.com^$third-party', '||googletagmanager.com^$third-party',
  '||doubleclick.net^$third-party', '||googlesyndication.com^$third-party',
  '||scorecardresearch.com^$third-party', '||hotjar.com^$third-party',
  '||clarity.ms^$third-party', '||facebook.net^$third-party',
  '||adsrvr.org^$third-party', '||criteo.com^$third-party',
  '||taboola.com^$third-party', '||outbrain.com^$third-party',
  '||adnxs.com^$third-party', '||quantserve.com^$third-party'
].join('\n');
function createProtection(directory, onBlocked) {
  const cache = path.join(directory, 'privacy-bundle-v2.json');
  let blocker, cosmetic, revision = '', source = 'offline';
  for (const [filename, label] of [[cache, 'standard'], [path.join(__dirname, 'assets', 'filters', 'bundle.json'), 'bundled']]) {
    try { if (fs.statSync(filename).size > MAX_BUNDLE_BYTES) continue; const saved = parseBundle(JSON.parse(fs.readFileSync(filename, 'utf8')), ElectronBlocker); blocker = saved.network; cosmetic = saved.cosmetic; revision = saved.revision; source = label; break; } catch {}
  }
  // Network-only integration keeps untrusted pages free of preloads/IPC and supports multiple sessions.
  if (!blocker) blocker = ElectronBlocker.parse(STARTER, { loadCosmeticFilters: false, loadCSPFilters: false });
  const sessions = new Set();
  const observe = engine => engine.on('request-blocked', request => onBlocked(request));
  observe(blocker);
  const enabled = ses => blocker.isBlockingEnabled(ses);
  const set = (ses, value) => { sessions.add(ses); if (value && !enabled(ses)) blocker.enableBlockingInSession(ses); if (!value && enabled(ses)) blocker.disableBlockingInSession(ses); };
  const update = async () => {
    const lists = await fetchFilterLists({ fetchImpl: (url, options) => net.fetch(url, options) });
    const bundle = compileFilters(lists);
    const next = parseBundle(bundle, ElectronBlocker);
    observe(next.network);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(`${cache}.tmp`, JSON.stringify(bundle), { mode: 0o600 }); fs.renameSync(`${cache}.tmp`, cache);
    const active = [...sessions].filter(enabled);
    for (const ses of active) blocker.disableBlockingInSession(ses);
    blocker = next.network; cosmetic = next.cosmetic; revision = next.revision;
    for (const ses of active) blocker.enableBlockingInSession(ses);
    source = 'standard';
  };
  const stylesFor = url => {
    if (!cosmetic || typeof url !== 'string' || url.length > 4096) return '';
    try {
      const parsedURL = new URL(url); if (parsedURL.protocol !== 'https:') return '';
      const { hostname, domain } = parseDomain(url);
      const result = cosmetic.getCosmeticsFilters({ url, hostname, domain, getInjectionRules: false, getExtendedRules: false, getRulesFromDOM: false });
      return typeof result.styles === 'string' && result.styles.length < 1_000_000 ? result.styles : '';
    } catch { return ''; }
  };
  const release = ses => { if (enabled(ses)) blocker.disableBlockingInSession(ses); sessions.delete(ses); };
  return { set, update, release, stylesFor, source: () => source, revision: () => revision, dispose: () => { for (const ses of [...sessions]) release(ses); } };
}
module.exports = { createProtection };


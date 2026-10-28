'use strict';
const crypto = require('node:crypto');
const { FiltersEngine } = require('@ghostery/adblocker');
const FILTER_REVISION = 'easylist-maintainer-snapshot';
const FILTER_FILES = ['easylist.txt', 'easyprivacy.txt'];
const MAX_LIST_BYTES = 15_000_000;
const MAX_BUNDLE_BYTES = 50_000_000;
// Original, narrowly scoped rules. Never block shared googlevideo content streams.
const LOCAL_RULES_VERSION = 'sanad-youtube-1';
const LOCAL_RULES = [
  '||youtube.com/pagead/$xmlhttprequest,script,ping,domain=youtube.com',
  '||youtube.com/api/stats/ads^$xmlhttprequest,ping,domain=youtube.com'
].join('\n');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function boundedText(response, limit = MAX_LIST_BYTES) {
  if (!response.ok || Number(response.headers.get('content-length') || 0) > limit) throw new Error('Filter list unavailable');
  const reader = response.body?.getReader(); if (!reader) throw new Error('Empty filter list');
  const chunks = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) { await reader.cancel(); throw new Error('Filter list too large'); } chunks.push(Buffer.from(value)); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
async function fetchFilterLists({ fetchImpl = fetch } = {}) {
  const deadline = AbortSignal.timeout(30_000);
  return Promise.all(FILTER_FILES.map(async name => {
    const url = `https://easylist.to/easylist/${name}`;
    const response = await fetchImpl(url, { signal: AbortSignal.any([deadline, AbortSignal.timeout(15_000)]), redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' });
    const text = await boundedText(response);
    if (text.length < 1000 || /<html[\s>]/i.test(text.slice(0, 1000))) throw new Error('Invalid filter list');
    return { name, url, text, sha256: digest(text), version: text.match(/^! Version:\s*(.+)$/m)?.[1] || '' };
  }));
}
function compileFilters(lists, revision) {
  const text = [...lists.map(item => item.text), LOCAL_RULES].join('\n');
  // Never install the library's remote-page preload or global IPC handlers.
  const network = FiltersEngine.parse(text, { loadCosmeticFilters: false, loadCSPFilters: false });
  const cosmetic = FiltersEngine.parse(text, { loadNetworkFilters: false, loadCosmeticFilters: true, loadExtendedSelectors: false, loadCSPFilters: false });
  const net = Buffer.from(network.serialize()), css = Buffer.from(cosmetic.serialize());
  return { schema: 1, localRulesVersion: LOCAL_RULES_VERSION, revision: revision || digest(text).slice(0, 40), createdAt: new Date().toISOString(), sources: lists.map(({ name, url, sha256, version }) => ({ name, url, sha256, version })), network: net.toString('base64'), cosmetic: css.toString('base64'), networkSha256: digest(net), cosmeticSha256: digest(css) };
}
function parseBundle(raw, NetworkEngine = FiltersEngine) {
  if (!raw || raw.schema !== 1 || raw.localRulesVersion !== LOCAL_RULES_VERSION || typeof raw.network !== 'string' || typeof raw.cosmetic !== 'string' || raw.network.length + raw.cosmetic.length > MAX_BUNDLE_BYTES) throw new Error('Invalid filter bundle');
  const net = Buffer.from(raw.network, 'base64'), css = Buffer.from(raw.cosmetic, 'base64');
  if (digest(net) !== raw.networkSha256 || digest(css) !== raw.cosmeticSha256) throw new Error('Corrupt filter bundle');
  const network = NetworkEngine.deserialize(new Uint8Array(net)), cosmetic = FiltersEngine.deserialize(new Uint8Array(css));
  if (network.config.loadCosmeticFilters || network.config.loadCSPFilters || cosmetic.config.loadCSPFilters || cosmetic.config.loadNetworkFilters || !cosmetic.config.loadCosmeticFilters) throw new Error('Unsafe filter configuration');
  return { network, cosmetic, revision: String(raw.revision || '').slice(0, 60) };
}
module.exports = { FILTER_REVISION, MAX_BUNDLE_BYTES, LOCAL_RULES_VERSION, LOCAL_RULES, boundedText, fetchFilterLists, compileFilters, parseBundle };


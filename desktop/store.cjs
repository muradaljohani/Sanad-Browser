'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { safeURL, mayRemember, sanitizeBookmarks } = require('./policy.cjs');
const { readBoundedText } = require('./bounded-file.cjs');
const { createStateCipher, MAX_STATE_BYTES } = require('./state-encryption.cjs');
const { normalizedSyncState, normalizedPendingLogin } = require('./browser-account-state.cjs');
const { normalizeSearchPreferences } = require('./search-preferences.cjs');
function normalizeState(saved = {}) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  const theme = saved.preferences?.theme === 'light' ? 'light' : 'dark';
  const { theme: _searchTheme, ...search } = normalizeSearchPreferences(saved.preferences?.search);
  const preferences = { theme, protection: saved.preferences?.protection !== false, search };
  let bookmarks = [];
  try { bookmarks = sanitizeBookmarks(saved.bookmarks ?? []); } catch {}
  const history = Array.isArray(saved.history) ? saved.history.slice(0, 200).filter(entry => entry && safeURL(entry.url) && mayRemember(entry.url)).map(entry => ({ url: entry.url, title: String(entry.title ?? '').slice(0, 200), timestamp: Number(entry.timestamp) || 0 })) : [];
  const sync=normalizedSyncState(saved.sync),syncPending=normalizedPendingLogin(saved.syncPending);
  const deviceId=typeof saved.deviceId==='string'&&/^[A-Za-z0-9_-]{16,80}$/.test(saved.deviceId)?saved.deviceId:sync?.deviceId||randomUUID();
  const session=(Array.isArray(saved.session)?saved.session:[]).slice(0,32).filter(x=>x&&safeURL(x.url)&&mayRemember(x.url)).map(x=>({url:x.url,title:String(x.title||'').slice(0,200),pinned:x.pinned===true,active:x.active===true}));
  return { deviceId, session, preferences, bookmarks, history, ...(sync?{sync}:{}), ...(syncPending?{syncPending}:{}) };
}
function openStore(directory) {
  const filename = path.join(directory, 'browser-state-v1.json');
  let saved = {};
  try { saved = JSON.parse(readBoundedText(filename, 1_999_999)); } catch {}
  const state = normalizeState(saved);
  let timer;
  const flush = () => {
    clearTimeout(timer);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${filename}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temporary, filename);
  };
  const persist = () => { clearTimeout(timer); timer = setTimeout(() => { try { flush(); } catch {} }, 150); };
  return { state, persist, flush, storageProtection: { status: 'unavailable', readOnly: false } };
}

async function openEncryptedStore(directory, { safeStorage, platform = process.platform, context, onError = () => {} } = {}) {
  const filename = path.join(directory, 'browser-state-v2.enc');
  const legacy = path.join(directory, 'browser-state-v1.json');
  const locked = (state = normalizeState()) => {
    onError();
    return { state, storageProtection: { status: 'locked', readOnly: true }, persist: () => {}, flush: async () => {} };
  };
  let encoded;
  try { encoded = readBoundedText(filename, 2_800_000); }
  catch (error) { if (error.code !== 'ENOENT') return locked(); }
  const cipher = await createStateCipher(safeStorage, platform, {context});
  // Existing encrypted profiles must never fall back to an older plaintext
  // copy or overwrite ciphertext when the OS key is unavailable.
  if (!cipher) return encoded === undefined ? openStore(directory) : locked();
  let state, migrate = false;
  try {
    if (encoded !== undefined) { state = normalizeState(JSON.parse(await cipher.open(encoded))); migrate = fs.existsSync(legacy); }
    else {
      let saved = {};
      try { saved = JSON.parse(readBoundedText(legacy, MAX_STATE_BYTES)); migrate = true; }
      catch (error) { if (error.code !== 'ENOENT') return locked(); }
      state = normalizeState(saved);
    }
  } catch { return locked(); }
  const storageProtection = { status: 'encrypted', readOnly: false };
  let timer, writes = Promise.resolve(), lastSaved;
  const flush = () => {
    clearTimeout(timer);
    writes = writes.catch(() => {}).then(async () => {
      const serialized = JSON.stringify(normalizeState(state));
      if (serialized === lastSaved && !cipher.needsRewrite) return;
      const sealed = await cipher.seal(serialized);
      const temporary = `${filename}.${randomUUID()}.tmp`;
      try {
        await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
        await fs.promises.writeFile(temporary, sealed, { mode: 0o600, flag: 'wx', flush: true });
        await fs.promises.rename(temporary, filename);
        // Remove a plaintext predecessor only after the complete encrypted
        // snapshot has been committed. Downloaded files are never touched.
        if (migrate) { await fs.promises.unlink(legacy).catch(error => { if (error.code !== 'ENOENT') throw error; }); migrate = false; }
        lastSaved = serialized; storageProtection.status = 'encrypted';
      } finally { await fs.promises.unlink(temporary).catch(() => {}); }
    });
    return writes;
  };
  const persist = () => { clearTimeout(timer); timer = setTimeout(() => { void flush().catch(() => { storageProtection.status = 'error'; onError(); }); }, 150); };
  const result = { state, storageProtection, persist, flush };
  if (migrate || cipher.needsRewrite) {
    try { await flush(); } catch { return locked(state); }
  }
  return result;
}
module.exports = { openStore, openEncryptedStore };



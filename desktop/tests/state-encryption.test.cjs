'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { openEncryptedStore } = require('../store.cjs');
const { createStateCipher, MAX_STATE_BYTES } = require('../state-encryption.cjs');

// Unit-test substitute for the OS vault. Actual DPAPI is checked separately
// by the installed Windows package test, without exporting any real OS key.
function vault() {
  const master = randomBytes(32), calls = { wrap: 0, unwrap: 0 };
  return { calls,
    isAsyncEncryptionAvailable: async () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    async encryptStringAsync(plain) { calls.wrap++; const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', master, iv); const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]); },
    async decryptStringAsync(data) { calls.unwrap++; const cipher = createDecipheriv('aes-256-gcm', master, data.subarray(0, 12)); cipher.setAuthTag(data.subarray(12, 28)); return { result: Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8'), shouldReEncrypt: false }; },
  };
}
function fixture(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-crypto-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return { dir, encrypted: path.join(dir, 'browser-state-v2.enc'), legacy: path.join(dir, 'browser-state-v1.json') }; }
const options = safeStorage => ({ safeStorage, platform: 'win32' });

test('migrates plaintext only after an authenticated snapshot is committed, and reopens it', async t => {
  const f = fixture(t), safeStorage = vault();
  fs.writeFileSync(f.legacy, JSON.stringify({ preferences: { theme: 'light' }, bookmarks: [{ url: 'https://example.edu/private-note', title: 'مفضلتي الخاصة' }], history: [{ url: 'https://example.edu/history', title: 'زيارة خاصة', timestamp: 123 }], cookies: 'never copy arbitrary fields' }));
  const store = await openEncryptedStore(f.dir, options(safeStorage));
  assert.equal(store.storageProtection.status, 'encrypted'); assert.equal(fs.existsSync(f.legacy), false);
  const raw = fs.readFileSync(f.encrypted, 'utf8');
  for (const secret of ['private-note', 'history', 'مفضلتي', 'زيارة', 'cookies']) assert.ok(!raw.includes(secret));
  const envelope = JSON.parse(raw); assert.equal(envelope.algorithm, 'AES-256-GCM'); assert.equal(Buffer.from(envelope.iv, 'base64').length, 12);
  const reopened = await openEncryptedStore(f.dir, options(safeStorage)); assert.deepEqual(reopened.state, store.state); assert.equal(reopened.state.cookies, undefined);
  reopened.state.preferences.theme = 'dark'; await reopened.flush();
  assert.deepEqual((await openEncryptedStore(f.dir, options(safeStorage))).state, reopened.state);
});

test('tampered ciphertext, nonce, wrapped key and algorithm fail closed without replacing the original', async t => {
  const f = fixture(t), safeStorage = vault(), store = await openEncryptedStore(f.dir, options(safeStorage));
  store.state.bookmarks = [{ url: 'https://example.edu/keep', title: 'Keep' }]; await store.flush();
  const original = JSON.parse(fs.readFileSync(f.encrypted, 'utf8'));
  for (const field of ['data', 'iv', 'wrappedKey', 'algorithm']) {
    const changed = { ...original };
    if (field === 'algorithm') changed[field] = 'AES-128-CBC';
    else { const bytes = Buffer.from(changed[field], 'base64'); bytes[0] ^= 1; changed[field] = bytes.toString('base64'); }
    const raw = JSON.stringify(changed); fs.writeFileSync(f.encrypted, raw);
    const locked = await openEncryptedStore(f.dir, options(safeStorage)); assert.equal(locked.storageProtection.readOnly, true);
    locked.state.bookmarks = []; locked.persist(); await locked.flush(); assert.equal(fs.readFileSync(f.encrypted, 'utf8'), raw);
  }
});

test('an unavailable or different OS key never downgrades an encrypted profile or revives stale plaintext', async t => {
  const f = fixture(t), safeStorage = vault(), store = await openEncryptedStore(f.dir, options(safeStorage));
  await store.flush(); const original = fs.readFileSync(f.encrypted, 'utf8');
  fs.writeFileSync(f.legacy, JSON.stringify({ bookmarks: [{ url: 'https://example.edu/stale', title: 'Stale' }] }));
  for (const unavailable of [{ isAsyncEncryptionAvailable: async () => false }, vault()]) {
    const locked = await openEncryptedStore(f.dir, options(unavailable)); assert.equal(locked.storageProtection.status, 'locked'); assert.equal(locked.state.bookmarks.length, 0);
    await locked.flush(); assert.equal(fs.readFileSync(f.encrypted, 'utf8'), original); assert.equal(fs.existsSync(f.legacy), true);
  }
});

test('migration failures and malformed legacy files preserve the recoverable predecessor', async t => {
  const f = fixture(t), safeStorage = vault(), raw = JSON.stringify({ bookmarks: [{ url: 'https://example.edu/keep', title: 'Keep' }] });
  fs.writeFileSync(f.legacy, raw);
  t.mock.method(fs.promises, 'rename', async () => { throw new Error('disk failure'); });
  const locked = await openEncryptedStore(f.dir, options(safeStorage)); assert.equal(locked.storageProtection.readOnly, true);
  assert.equal(locked.state.bookmarks[0].title, 'Keep'); assert.equal(fs.readFileSync(f.legacy, 'utf8'), raw); assert.equal(fs.existsSync(f.encrypted), false);
  assert.deepEqual(fs.readdirSync(f.dir), ['browser-state-v1.json']);
  fs.writeFileSync(f.legacy, 'broken JSON'); assert.equal((await openEncryptedStore(f.dir, options(safeStorage))).storageProtection.status, 'locked'); assert.equal(fs.readFileSync(f.legacy, 'utf8'), 'broken JSON');
});

test('basic_text is never presented as secure OS storage, while unsupported new profiles retain legacy behavior', async t => {
  const safeStorage = vault(); safeStorage.getSelectedStorageBackend = () => 'basic_text';
  assert.equal(await createStateCipher(safeStorage, 'linux'), null); assert.equal(safeStorage.calls.wrap, 0);
  const f = fixture(t), store = await openEncryptedStore(f.dir, { safeStorage, platform: 'linux' });
  assert.equal(store.storageProtection.status, 'unavailable'); store.state.preferences.theme = 'light'; store.flush();
  assert.equal(JSON.parse(fs.readFileSync(f.legacy)).preferences.theme, 'light');
});

test('serializes concurrent saves, reuses the protected key and uses a fresh nonce for every changed snapshot', async t => {
  const f = fixture(t), safeStorage = vault(), store = await openEncryptedStore(f.dir, options(safeStorage));
  store.state.preferences.theme = 'light'; const a = store.flush(); store.state.preferences.theme = 'dark'; const b = store.flush(); await Promise.all([a, b]);
  const first = JSON.parse(fs.readFileSync(f.encrypted, 'utf8')); const raw = fs.readFileSync(f.encrypted, 'utf8'); await store.flush(); assert.equal(fs.readFileSync(f.encrypted, 'utf8'), raw);
  store.state.preferences.theme = 'light'; await store.flush(); const second = JSON.parse(fs.readFileSync(f.encrypted, 'utf8'));
  assert.notEqual(first.iv, second.iv); assert.equal(first.wrappedKey, second.wrappedKey); assert.equal(safeStorage.calls.wrap, 1);
  assert.equal((await openEncryptedStore(f.dir, options(safeStorage))).state.preferences.theme, 'light');
});

test('honors OS key rotation without discarding the data', async t => {
  const f = fixture(t), safeStorage = vault(), store = await openEncryptedStore(f.dir, options(safeStorage)); await store.flush();
  const before = JSON.parse(fs.readFileSync(f.encrypted, 'utf8')); const decrypt = safeStorage.decryptStringAsync;
  safeStorage.decryptStringAsync = async data => ({ ...await decrypt(data), shouldReEncrypt: true });
  const reopened = await openEncryptedStore(f.dir, options(safeStorage)); const after = JSON.parse(fs.readFileSync(f.encrypted, 'utf8'));
  assert.deepEqual(reopened.state, store.state); assert.notEqual(before.wrappedKey, after.wrappedKey); assert.notEqual(before.iv, after.iv);
});

test('bounds file and encryption sizes before writing or allocating unbounded cryptographic input', async t => {
  const cipher = await createStateCipher(vault(), 'win32'); await assert.rejects(cipher.seal('x'.repeat(MAX_STATE_BYTES + 1)));
  const f = fixture(t); fs.writeFileSync(f.encrypted, 'x'.repeat(2_800_001));
  const store = await openEncryptedStore(f.dir, options(vault())); assert.equal(store.storageProtection.status, 'locked'); await store.flush(); assert.equal(fs.statSync(f.encrypted).size, 2_800_001);
});

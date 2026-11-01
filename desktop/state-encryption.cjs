'use strict';
const { randomBytes, webcrypto } = require('node:crypto');
const MAX_STATE_BYTES = 1_999_999;
const AAD = Buffer.from('Sanad-Browser:local-state:v2:AES-256-GCM');

function decode(value, limit) {
  if (typeof value !== 'string' || !value.length || value.length > Math.ceil(limit / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Invalid encrypted state');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > limit || bytes.toString('base64') !== value) throw new Error('Invalid encrypted state');
  return bytes;
}

// No embedded password, application secret, raw key file or renderer key access.
// Electron's async OS provider protects only the random data key. AES-GCM
// authenticates each bounded state snapshot with a fresh 96-bit nonce.
async function createStateCipher(safeStorage, platform = process.platform, {context} = {}) {
  const aad = context ? Buffer.from(AAD.toString('utf8') + ':' + String(context).slice(0,200)) : AAD;
  if (!safeStorage?.isAsyncEncryptionAvailable || !safeStorage.encryptStringAsync || !safeStorage.decryptStringAsync) return null;
  try {
    if (!await safeStorage.isAsyncEncryptionAvailable()) return null;
    // Do not describe Linux's hardcoded-password fallback as secure storage.
    if (platform === 'linux' && !['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(safeStorage.getSelectedStorageBackend?.())) return null;
  } catch { return null; }
  let key, wrappedKey, rewrite = false;
  const importKey = bytes => webcrypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return {
    get needsRewrite() { return rewrite; },
    async open(serialized) {
      const envelope = JSON.parse(serialized);
      if (envelope?.schema !== 2 || envelope.algorithm !== 'AES-256-GCM') throw new Error('Unsupported encrypted state');
      const wrapped = decode(envelope.wrappedKey, 8192), iv = decode(envelope.iv, 12), data = decode(envelope.data, MAX_STATE_BYTES + 16);
      if (iv.length !== 12 || data.length < 16) throw new Error('Invalid encrypted state');
      const result = await safeStorage.decryptStringAsync(wrapped);
      if (typeof result?.result !== 'string' || result.isTemporarilyUnavailable) throw new Error('State key unavailable');
      const raw = decode(result.result, 32);
      try {
        if (raw.length !== 32) throw new Error('Invalid state key');
        key = await importKey(raw);
        const plain = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, key, data);
        wrappedKey = envelope.wrappedKey;
        if (result.shouldReEncrypt) { wrappedKey = (await safeStorage.encryptStringAsync(raw.toString('base64'))).toString('base64'); rewrite = true; }
        return new TextDecoder('utf-8', { fatal: true }).decode(plain);
      } finally { raw.fill(0); }
    },
    async seal(plain) {
      if (typeof plain !== 'string' || Buffer.byteLength(plain) > MAX_STATE_BYTES) throw new Error('State too large');
      if (!key) {
        const raw = randomBytes(32);
        try {
          const nextKey = await importKey(raw);
          const nextWrapped = await safeStorage.encryptStringAsync(raw.toString('base64'));
          decode(nextWrapped.toString('base64'), 8192);
          key = nextKey; wrappedKey = nextWrapped.toString('base64');
        } finally { raw.fill(0); }
      }
      const iv = randomBytes(12);
      const data = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, key, Buffer.from(plain));
      rewrite = false;
      return JSON.stringify({ schema: 2, algorithm: 'AES-256-GCM', wrappedKey, iv: iv.toString('base64'), data: Buffer.from(data).toString('base64') });
    },
  };
}

module.exports = { createStateCipher, MAX_STATE_BYTES };


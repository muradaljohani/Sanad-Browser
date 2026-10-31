'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

async function main() {
  assert.equal(process.platform, 'win32', 'This check exercises the actual Windows OS vault.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-real-encryption-'));
  const encrypted = path.join(profile, 'browser-state-v2.enc'), legacy = path.join(profile, 'browser-state-v1.json');
  const saved = { preferences: { theme: 'light', protection: true }, bookmarks: [{ url: 'https://example.edu/encrypted-fixture', title: 'Encrypted fixture bookmark' }], history: [] };
  fs.writeFileSync(legacy, JSON.stringify(saved));
  const server = http.createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><title>Encryption fixture</title><p>Local fixture</p>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let app;
  const launch = async () => {
    app = await electron.launch({ args: [path.join(__dirname, '..')], env: { ...process.env, SANAD_BROWSER_TEST_MODE: '1', SANAD_BROWSER_TEST_PROFILE: profile, SANAD_BROWSER_TEST_URL: `http://127.0.0.1:${server.address().port}` }, timeout: 30000 });
    const shell = await app.firstWindow(); await shell.waitForFunction(() => Boolean(window.sanadBrowser));
    return shell.evaluate(() => window.sanadBrowser.command('state'));
  };
  try {
    let state = await launch();
    assert.equal(state.storageProtection.status, 'encrypted'); assert.deepEqual(state.bookmarks, saved.bookmarks); assert.equal(state.preferences.theme, 'light');
    assert.equal(fs.existsSync(legacy), false); const raw = fs.readFileSync(encrypted, 'utf8');
    assert.ok(!raw.includes('encrypted-fixture')); assert.ok(!raw.includes('Encrypted fixture bookmark')); assert.ok(!raw.includes('preferences'));
    assert.equal(JSON.parse(raw).algorithm, 'AES-256-GCM');
    await app.close(); app = undefined;
    state = await launch(); assert.equal(state.storageProtection.status, 'encrypted'); assert.deepEqual(state.bookmarks, saved.bookmarks);
    await app.close(); app = undefined;
    const envelope = JSON.parse(fs.readFileSync(encrypted, 'utf8')); const bytes = Buffer.from(envelope.data, 'base64'); bytes[0] ^= 1; envelope.data = bytes.toString('base64');
    const modified = JSON.stringify(envelope); fs.writeFileSync(encrypted, modified);
    state = await launch(); assert.equal(state.storageProtection.status, 'locked'); assert.equal(state.storageProtection.readOnly, true);
    await app.close(); app = undefined; assert.equal(fs.readFileSync(encrypted, 'utf8'), modified);
    console.log(JSON.stringify({ ok: true, checks: ['real-Windows-OS-key', 'plaintext-migration', 'encrypted-on-disk', 'cross-process-decryption', 'tamper-rejection', 'no-corrupt-file-overwrite'] }));
  } finally { if (app) await app.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(profile, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

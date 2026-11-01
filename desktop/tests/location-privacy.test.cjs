'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CONFIG_FILE, readNetworkPrivacy, writeNetworkPrivacy, validateConfig, proxyConfig, configureStartupPrivacy, configureSessionPrivacy, hardenWebContents, locationPermissionAllowed } = require('../location-privacy.cjs');
const enabled = { version: 1, enabled: true, port: 9050 };
test('only missing routing settings use the ordinary mode; invalid settings fail closed', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-network-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(readNetworkPrivacy(dir), { version: 1, enabled: false, port: 9050 });
  for (const text of ['{', '{}', 'null', 'x'.repeat(1025), JSON.stringify({ ...enabled, port: '9050' }), JSON.stringify({ ...enabled, enabled: 'false' })]) {
    fs.writeFileSync(path.join(dir, CONFIG_FILE), text);
    assert.throws(() => readNetworkPrivacy(dir), /network-privacy-v1.json/);
  }
  fs.rmSync(path.join(dir, CONFIG_FILE)); fs.mkdirSync(path.join(dir, CONFIG_FILE));
  assert.throws(() => readNetworkPrivacy(dir), /network-privacy-v1.json/);
});
test('routing survives restart; invalid writes retain prior configuration without arbitrary data', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-network-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  writeNetworkPrivacy(dir, { ...enabled, account: 'do not store', password: 'do not store' });
  assert.deepEqual(readNetworkPrivacy(dir), enabled);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, CONFIG_FILE), 'utf8'), /account|password/);
  for (const port of [0, 1023, 65536, NaN, Infinity, 9050.1, '9050', '9050,direct://']) assert.throws(() => writeNetworkPrivacy(dir, { ...enabled, port }));
  assert.deepEqual(readNetworkPrivacy(dir), enabled);
  writeNetworkPrivacy(dir, { version: 1, enabled: false, port: 9150 });
  assert.equal(readNetworkPrivacy(dir).enabled, false);
  assert.throws(() => validateConfig({ enabled: true, port: 9050 }));
});
test('startup removes inherited proxy overrides without direct fallback or loopback bypass', () => {
  const switches = new Map([['no-proxy-server', ''], ['proxy-pac-url', 'https://untrusted.invalid/pac'], ['proxy-auto-detect', ''], ['proxy-bypass-list', '*'], ['host-rules', 'MAP * leaked.invalid'], ['enable-quic', '']]);
  const cli = { removeSwitch: name => switches.delete(name), appendSwitch: (name, value = '') => switches.set(name, value) };
  configureStartupPrivacy(cli, enabled);
  for (const name of ['no-proxy-server', 'proxy-pac-url', 'proxy-auto-detect', 'enable-quic', 'host-rules']) assert.equal(switches.has(name), false);
  assert.equal(switches.get('proxy-server'), 'socks5://127.0.0.1:9050');
  assert.equal(switches.get('proxy-bypass-list'), '<-loopback>');
  assert.equal(switches.get('host-resolver-rules'), 'MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
  assert(switches.has('disable-quic')); assert(switches.has('dns-prefetch-disable'));
  assert.doesNotMatch(switches.get('proxy-server'), /direct|[,;]/i);
  assert.deepEqual(proxyConfig(enabled), { mode: 'fixed_servers', proxyRules: 'socks5://127.0.0.1:9050', proxyBypassRules: '<-loopback>' });
  const ordinary = new Map(switches); configureStartupPrivacy(cli, { ...enabled, enabled: false }); assert.deepEqual(switches, ordinary);
});
test('session preparation waits for routing and drops pooled sockets; failures never request direct mode', async () => {
  let resolveProxy;
  const calls = [];
  const ses = { setProxy: config => { calls.push(config); return new Promise(resolve => { resolveProxy = resolve; }); }, closeAllConnections: async () => calls.push('close'), setSpellCheckerEnabled: value => calls.push(['spelling', value]) };
  const pending = configureSessionPrivacy(ses, enabled);
  assert.deepEqual(calls, [proxyConfig(enabled)]);
  resolveProxy(); await pending;
  assert.deepEqual(calls, [proxyConfig(enabled), 'close', ['spelling', false]]);
  let attempts = 0;
  await assert.rejects(configureSessionPrivacy({ setProxy: async config => { attempts++; assert.equal(config.mode, 'fixed_servers'); throw new Error('failed'); } }, enabled), /failed/);
  assert.equal(attempts, 1);
  await configureSessionPrivacy({}, { ...enabled, enabled: false });
});
test('geolocation stays denied with previous grants; WebRTC restricts non-proxied UDP', () => {
  for (const granted of [true, false, undefined]) assert.equal(locationPermissionAllowed('geolocation', granted), false);
  assert.equal(locationPermissionAllowed('media', true), true);
  assert.equal(locationPermissionAllowed('media', false), false);
  assert.equal(locationPermissionAllowed('notifications', undefined), false);
  let policy;
  hardenWebContents({ setWebRTCIPHandlingPolicy: value => { policy = value; } });
  assert.equal(policy, 'disable_non_proxied_udp');
  assert(require('../package.json').build.files.includes('location-privacy.cjs'), 'installed application includes privacy module');
});

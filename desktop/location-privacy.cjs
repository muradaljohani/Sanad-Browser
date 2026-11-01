'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { readBoundedText } = require('./bounded-file.cjs');
const CONFIG_FILE = 'network-privacy-v1.json';
const DEFAULT_PORT = 9050;
const WEBRTC_POLICY = 'disable_non_proxied_udp';
function validateConfig(value) {
  if (!value || value.version !== 1 || typeof value.enabled !== 'boolean' || !Number.isInteger(value.port) || value.port < 1024 || value.port > 65535) throw new Error('إعداد وسيط الاتصال غير صالح.');
  return { version: 1, enabled: value.enabled, port: value.port };
}
function readNetworkPrivacy(directory) {
  try { return validateConfig(JSON.parse(readBoundedText(path.join(directory, CONFIG_FILE), 1024))); }
  catch (error) {
    if (error.code === 'ENOENT') return { version: 1, enabled: false, port: DEFAULT_PORT };
    // A damaged/unreadable setting must never silently downgrade to direct traffic.
    throw new Error(`تعذرت قراءة ${CONFIG_FILE}. أعد إصلاح الملف أو نقله يدويًا قبل تشغيل المتصفح.`, { cause: error });
  }
}
function writeNetworkPrivacy(directory, value) {
  const config = validateConfig(value);
  fs.mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, CONFIG_FILE);
  fs.writeFileSync(`${filename}.tmp`, JSON.stringify(config), { mode: 0o600 });
  fs.renameSync(`${filename}.tmp`, filename);
  return config;
}
function proxyConfig(config) {
  validateConfig(config);
  // One numeric loopback endpoint, no PAC, direct fallback, or implicit loopback bypass.
  return { mode: 'fixed_servers', proxyRules: `socks5://127.0.0.1:${config.port}`, proxyBypassRules: '<-loopback>' };
}
function configureStartupPrivacy(commandLine, config) {
  validateConfig(config);
  if (!config.enabled) return;
  for (const name of ['no-proxy-server', 'proxy-auto-detect', 'proxy-pac-url', 'proxy-server', 'proxy-bypass-list', 'host-rules', 'host-resolver-rules', 'enable-quic']) commandLine.removeSwitch(name);
  commandLine.appendSwitch('proxy-server', proxyConfig(config).proxyRules);
  commandLine.appendSwitch('proxy-bypass-list', '<-loopback>');
  commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
  commandLine.appendSwitch('dns-prefetch-disable');
  commandLine.appendSwitch('disable-quic');
}
async function configureSessionPrivacy(ses, config) {
  if (!config.enabled) return;
  await ses.setProxy(proxyConfig(config));
  await ses.closeAllConnections();
  // Avoid automatic dictionary downloads in this mode.
  ses.setSpellCheckerEnabled(false);
}
function hardenWebContents(wc) { wc.setWebRTCIPHandlingPolicy(WEBRTC_POLICY); }
function locationPermissionAllowed(permission, granted) { return permission !== 'geolocation' && granted === true; }
module.exports = { CONFIG_FILE, DEFAULT_PORT, WEBRTC_POLICY, validateConfig, readNetworkPrivacy, writeNetworkPrivacy, proxyConfig, configureStartupPrivacy, configureSessionPrivacy, hardenWebContents, locationPermissionAllowed };

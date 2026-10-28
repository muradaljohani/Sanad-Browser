'use strict';
const UNSAFE_SWITCHES = ['no-sandbox', 'disable-web-security', 'allow-running-insecure-content', 'ignore-certificate-errors', 'remote-debugging-port', 'remote-debugging-pipe', 'inspect', 'inspect-brk'];
function unsafeStartupSwitch(commandLine) { return UNSAFE_SWITCHES.find(name => commandLine.hasSwitch(name)) || null; }
function downloadName(raw) {
  let name = String(raw || 'download').normalize('NFKC').replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069<>:"/\\|?*]/g, '_').replace(/[. ]+$/, '').slice(0, 180);
  if (!name || /^\.+$/.test(name)) name = 'download';
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
  return name;
}
const executableDownload = name => /\.(?:exe|msi|msix|appx|com|scr|bat|cmd|ps1|vbs|vbe|js|jse|wsf|hta|lnk|url|reg|pif|cpl|jar|iso|img)$/i.test(name);
function downloadSourceAllowed(chain, pageURL, safeURL, testMode = false) {
  if (!Array.isArray(chain) || !chain.length || !safeURL(pageURL, testMode)) return false;
  return chain.every(raw => { if (safeURL(raw, testMode)) return true; try { const url = new URL(raw); return url.protocol === 'blob:' && url.origin === new URL(pageURL).origin; } catch { return false; } });
}
module.exports = { unsafeStartupSwitch, downloadName, executableDownload, downloadSourceAllowed };

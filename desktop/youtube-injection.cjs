'use strict';
const { isYouTube } = require('./youtube-guard.cjs');
const { youtubeDataScript } = require('./youtube-data.cjs');
/** Main-process-only transport for one fixed, packaged script. No port or page bindings. */
function createYouTubeInjection(wc, initialEnabled, inherited = false) {
  let desired = initialEnabled === true, installed = false, identifier, owned = false, detached = false;
  const update = async () => {
    if (wc.isDestroyed() || detached) return false;
    if (!desired && !owned) return true;
    try {
      if (!owned) {
        if (wc.debugger.isAttached() || wc.isDevToolsOpened()) return false;
        wc.debugger.attach('1.3'); owned = true;
        wc.debugger.once('detach', () => { detached = true; owned = false; identifier = undefined; installed = false; });
      }
      if (desired !== installed) {
        if (identifier) { await wc.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument', { identifier }); identifier = undefined; installed = false; }
        if (desired) {
          const result = await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: youtubeDataScript(true), runImmediately: true });
          identifier = result.identifier; installed = true;
        }
      }
      return true;
    } catch { return false; }
  };
  // Electron may defer debugger command replies until the first navigation.
  // Prime only newly created contents; never replace an adopted popup's POST/opener.
  const ready = (inherited ? Promise.resolve() : wc.loadURL('about:blank')).then(update).catch(() => false);
  let pending = ready;
  return {
    ready,
    setEnabled(value) {
      desired = value === true;
      pending = pending.then(async () => {
        await update();
        if (!wc.isDestroyed() && isYouTube(wc.getURL())) await wc.executeJavaScript(youtubeDataScript(desired)).catch(() => {});
      }).catch(() => {});
      return pending;
    }
  };
}
module.exports = { createYouTubeInjection };

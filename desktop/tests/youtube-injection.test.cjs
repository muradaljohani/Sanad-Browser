'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createYouTubeInjection } = require('../youtube-injection.cjs');
function fixture() {
  const calls = [], debuggerAPI = new EventEmitter(); let attached = false, destroyed = false, url = '';
  debuggerAPI.attach = version => { attached = true; calls.push(['attach', version]); };
  debuggerAPI.isAttached = () => attached;
  debuggerAPI.sendCommand = async (method, params) => { calls.push([method, params]); return { identifier: 'fixture-script' }; };
  const wc = Object.assign(new EventEmitter(), { debugger: debuggerAPI, isDestroyed: () => destroyed, isDevToolsOpened: () => false,
    loadURL: async next => { calls.push(['load', next]); url = next; }, getURL: () => url,
    executeJavaScript: async source => { calls.push(['execute', source]); },
    navigationHistory: { getActiveIndex: () => 1, getEntryAtIndex: () => ({url:'about:blank'}), removeEntryAtIndex: index => { calls.push(['remove-history',index]); } } });
  return { wc, calls, destroy: () => { destroyed = true; }, navigate: next => { url = next; } };
}
test('packaged injection registers before real navigation, toggles future documents and only uses fixed page code', async () => {
  const f = fixture(), protection = createYouTubeInjection(f.wc, true);
  assert.equal(await protection.ready, true);
  assert.deepEqual(f.calls.slice(0,2), [['load','about:blank'],['attach','1.3']]);
  const registration = f.calls.find(c => c[0] === 'Page.addScriptToEvaluateOnNewDocument');
  assert.equal(registration[1].runImmediately, true); assert.match(registration[1].source, /youtubeDataGuard/);
  assert(!f.calls.some(c => /Network|Fetch|Runtime.addBinding|setBypassCSP/.test(c[0])));
  f.wc.emit('did-navigate', {}, 'https://www.youtube.com/watch?v=fixture');
  assert(f.calls.some(c => c[0] === 'remove-history' && c[1] === 0));
  f.navigate('https://www.youtube.com/watch?v=fixture'); await protection.setEnabled(false);
  assert(f.calls.some(c => c[0] === 'Page.removeScriptToEvaluateOnNewDocument'));
  assert(f.calls.some(c => c[0] === 'execute' && c[1].endsWith('(false)')));
  await protection.setEnabled(true); assert.equal(f.calls.filter(c => c[0] === 'Page.addScriptToEvaluateOnNewDocument').length,2);
});
test('opt-out does not attach, popup contents retain navigation and DevTools detachment is respected', async () => {
  const f = fixture(), protection = createYouTubeInjection(f.wc, false, true); await protection.ready;
  assert.equal(f.calls.length,0); await protection.setEnabled(true); assert.equal(f.calls[0][0],'attach');
  assert(!f.calls.some(c => c[0] === 'load'));
  f.wc.debugger.emit('detach', {}, 'replaced_with_devtools'); const before = f.calls.length;
  await protection.setEnabled(false); await protection.setEnabled(true); assert.equal(f.calls.length,before);
  f.destroy(); await protection.setEnabled(true); assert.equal(f.calls.length,before);
});

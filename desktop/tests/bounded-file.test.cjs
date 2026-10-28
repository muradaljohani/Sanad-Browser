'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readBoundedText } = require('../bounded-file.cjs');
const { openStore } = require('../store.cjs');

function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-bounded-'));
  try { run(directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
test('bounded file reads preserve UTF-8 and inclusive byte limits', () => fixture(directory => {
  const filename = path.join(directory, 'text.json');
  const text = JSON.stringify({ title: 'سَنَد'.repeat(20_000) });
  fs.writeFileSync(filename, text);
  assert.equal(readBoundedText(filename, Buffer.byteLength(text)), text);
  assert.throws(() => readBoundedText(filename, Buffer.byteLength(text) - 1), /الحجم/);
  fs.writeFileSync(filename, '');
  assert.equal(readBoundedText(filename, 0), '');
}));
test('path replacement after metadata inspection cannot switch the file being read', () => fixture(directory => {
  const filename = path.join(directory, 'selected.json');
  const replacement = path.join(directory, 'replacement.json');
  fs.writeFileSync(filename, '{"selected":true}'); fs.writeFileSync(replacement, 'x'.repeat(100));
  const original = fs.fstatSync;
  let swapped = false;
  fs.fstatSync = (...args) => {
    const stat = original(...args);
    if (!swapped) { swapped = true; fs.renameSync(replacement, filename); }
    return stat;
  };
  try { assert.equal(readBoundedText(filename, 30), '{"selected":true}'); assert(swapped); }
  finally { fs.fstatSync = original; }
}));
test('growth after metadata inspection is rejected by the actual read limit', () => fixture(directory => {
  const filename = path.join(directory, 'growing.json'); fs.writeFileSync(filename, '{}');
  const original = fs.fstatSync;
  fs.fstatSync = (...args) => { const stat = original(...args); fs.writeFileSync(filename, 'x'.repeat(100)); return stat; };
  try { assert.throws(() => readBoundedText(filename, 30), /الحجم/); }
  finally { fs.fstatSync = original; }
}));
test('nonregular inputs and invalid limits are rejected', () => fixture(directory => {
  assert.throws(() => readBoundedText(directory, 30));
  for (const limit of [-1, Infinity, 0.5, 50_000_001]) assert.throws(() => readBoundedText(directory, limit), /Invalid/);
}));
test('oversized and corrupt profile files recover without accepting their preferences', () => fixture(directory => {
  const filename = path.join(directory, 'browser-state-v1.json');
  fs.writeFileSync(filename, JSON.stringify({ preferences: { theme: 'light' }, padding: 'x'.repeat(2_000_000) }));
  assert.equal(openStore(directory).state.preferences.theme, 'dark');
  fs.writeFileSync(filename, '{'); assert.deepEqual(openStore(directory).state.history, []);
}));

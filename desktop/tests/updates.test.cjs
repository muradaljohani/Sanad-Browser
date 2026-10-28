'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { compareVersions, parseRelease, createUpdateChecker, UPDATE_FEED } = require('../updates.cjs');
const release = version => ({ schema: 1, version, channel: 'preview', installation: 'manual', releaseUrl: `https://github.com/muradaljohani/Browser/releases/tag/desktop-v${version}`, notes: ['Release notes'] });
test('release version comparison is numeric and rejects malformed and injected versions', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.2.0', '1.2.0'), 0);
  assert.equal(compareVersions('1.1.0', '1.2.0'), -1);
  for (const value of ['1.2', '01.2.0', '1.2.3/evil', 'NaN.1.0', '1.2.3-beta']) assert.throws(() => compareVersions(value, '1.2.0'));
});
test('release metadata only permits the fixed project destination and bounded plain notes', () => {
  assert.equal(parseRelease(release('1.2.0')).version, '1.2.0');
  assert.equal(parseRelease({ ...release('1.3.0'), downloadPage: 'https://ip-murad.com/browser/download/' }).releaseUrl, 'https://ip-murad.com/browser/download/');
  for (const downloadPage of ['https://evil.example/', 'https://ip-murad.com.evil.example/browser/download/', 'javascript:alert(1)', 'https://ip-murad.com/browser/download/?redirect=evil']) assert.throws(() => parseRelease({ ...release('1.3.0'), downloadPage }));
  for (const change of [{ releaseUrl: 'https://evil.example/setup.exe' }, { channel: 'stable' }, { installation: 'automatic' }]) assert.throws(() => parseRelease({ ...release('1.2.0'), ...change }));
  const parsed = parseRelease({ ...release('1.2.0'), notes: [null, '<script>plain text</script>', ...Array(10).fill('x'.repeat(1000))] });
  assert.equal(parsed.notes.length, 6); assert.equal(parsed.notes[1].length, 300);
});
test('checking coalesces requests, exposes actual states and limits automatic polling', async () => {
  let calls = 0, time = 1000;
  const checker = createUpdateChecker({ version: '1.2.0', now: () => time, fetchImpl: async (url, options) => {
    calls++; assert.equal(url, UPDATE_FEED); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    await new Promise(resolve => setTimeout(resolve, 10)); return Response.json(release('1.3.0'));
  } });
  const a = checker.check(); assert.equal(checker.snapshot().status, 'checking');
  const b = checker.check(); await Promise.all([a, b]);
  assert.equal(calls, 1); assert.equal(checker.snapshot().status, 'available'); assert.equal(checker.snapshot().checkedAt, 1000);
  await checker.check({ automatic: true }); assert.equal(calls, 1);
  time += 900001; await checker.check({ automatic: true }); assert.equal(calls, 2);
});
test('failed or oversized responses never claim an update is ready; retry recovers', async () => {
  let response = new Response('<html>Not found</html>', { status: 404 });
  const checker = createUpdateChecker({ version: '1.2.0', fetchImpl: async () => response });
  await checker.check(); assert.equal(checker.snapshot().status, 'error'); assert.equal(checker.snapshot().checkedAt, null);
  response = new Response('x'.repeat(32769), { headers: { 'content-type': 'application/json' } });
  await checker.check(); assert.equal(checker.snapshot().status, 'error');
  response = Response.json(release('1.2.0')); await checker.check(); assert.equal(checker.snapshot().status, 'current');
  response = Response.json(release('1.1.0')); await checker.check(); assert.equal(checker.snapshot().status, 'ahead');
});


'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const minimatch = require('minimatch');

test('patched matcher retains callable and named APIs used by packaging dependencies', () => {
  assert.equal(typeof minimatch, 'function'); assert.equal(typeof minimatch.minimatch, 'function');
  assert.equal(minimatch('src/state.cjs', '**/*.cjs'), true); assert.equal(minimatch.minimatch('src/state.cjs', '**/*.json'), false);
  assert.deepEqual(minimatch.match(['a.cjs', 'b.json'], '*.cjs'), ['a.cjs']);
  assert.deepEqual(['a.cjs', 'b.json'].filter(minimatch.filter('*.json')), ['b.json']);
  assert.deepEqual(minimatch.braceExpand('a{1,2}'), ['a1', 'a2']);
  assert.equal(new minimatch.Minimatch('**/*.cjs').match('ui/renderer.cjs'), true);
  assert.equal(minimatch.defaults({ nocase: true })('A.CJS', '*.cjs'), true);
});

test('legacy glob preserves recursive packaging selection and ignored files', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-package-glob-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const file of ['main.cjs', 'ui/renderer.cjs', 'ui/theme.css', 'node_modules/ignored.cjs']) { const target = path.join(dir, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, 'fixture'); }
  const matches = require('glob').sync('**/*.cjs', { cwd: dir, nodir: true, ignore: 'node_modules/**' }).map(file => file.replace(/\\/g, '/')).sort();
  assert.deepEqual(matches, ['main.cjs', 'ui/renderer.cjs']);
});

test('amplifying preprocessing patterns complete within a bounded child process', () => {
  const source = "const m=require(process.argv[1]); new m.Minimatch('**/../'.repeat(40)+'x', {optimizationLevel:2});";
  const result = spawnSync(process.execPath, ['--max-old-space-size=64', '-e', source, require.resolve('minimatch')], { timeout: 2000, encoding: 'utf8' });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
});

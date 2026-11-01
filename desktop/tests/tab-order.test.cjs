'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moveTabBefore } = require('../tab-order.cjs');
const fixture = () => [{ id: 'p1', pinned: true }, { id: 'p2', pinned: true }, { id: 'a', pinned: false }, { id: 'b', pinned: false }, { id: 'c', pinned: false }].map(item => ({ ...item, view: { webContents: { marker: item.id } } }));
const ids = tabs => tabs.map(tab => tab.id);
test('drag ordering preserves every tab object and its existing renderer', () => {
  const tabs = fixture(), moved = moveTabBefore(tabs, 'c', 'a');
  assert.deepEqual(ids(moved), ['p1', 'p2', 'c', 'a', 'b']);
  assert.deepEqual(ids(tabs), ['p1', 'p2', 'a', 'b', 'c']);
  for (const tab of tabs) assert.equal(moved.find(item => item.id === tab.id), tab);
  assert.deepEqual(ids(moveTabBefore(moved, 'a')), ['p1', 'p2', 'c', 'b', 'a']);
});
test('pinned and ordinary tabs cannot cross their boundary through drag or forged move requests', () => {
  const tabs = fixture();
  assert.deepEqual(ids(moveTabBefore(tabs, 'a', 'p1')), ['p1', 'p2', 'a', 'b', 'c']);
  assert.deepEqual(ids(moveTabBefore(tabs, 'p1')), ['p2', 'p1', 'a', 'b', 'c']);
  assert.deepEqual(ids(moveTabBefore(tabs, 'p2', 'p1')), ['p2', 'p1', 'a', 'b', 'c']);
});
test('stale, self and unknown drag targets do not lose or duplicate tabs', () => {
  const tabs = fixture();
  for (const [id, before] of [['a', 'a'], ['missing', 'a'], ['a', 'missing']]) assert.deepEqual(ids(moveTabBefore(tabs, id, before)), ids(tabs));
  assert.deepEqual(moveTabBefore([], 'missing'), []);
  const single = [{ id: 'one', pinned: false }]; assert.equal(moveTabBefore(single, 'one')[0], single[0]);
});

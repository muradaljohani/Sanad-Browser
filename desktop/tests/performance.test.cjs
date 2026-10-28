'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { FiltersEngine } = require('@ghostery/adblocker');
const { createStyleCache } = require('../style-cache.cjs');
test('cosmetic cache reuses real engine results with a bounded memory budget', () => {
  const engine = FiltersEngine.parse(Array.from({ length: 300 }, (_, i) => `example.com##.fixture-ad-${i}`).join('\n'), { loadNetworkFilters: false, loadCosmeticFilters: true, loadCSPFilters: false });
  let computations = 0;
  const compute = () => { computations++; return engine.getCosmeticsFilters({ url: 'https://example.com/', hostname: 'example.com', domain: 'example.com', getInjectionRules: false, getExtendedRules: false, getRulesFromDOM: false }).styles; };
  const cache = createStyleCache();
  const before = performance.now(); let expected;
  for (let i = 0; i < 500; i++) expected = compute();
  const uncachedMs = performance.now() - before;
  computations = 0; const start = performance.now();
  for (let i = 0; i < 500; i++) assert.equal(cache.get('https://example.com/', compute), expected);
  const cachedMs = performance.now() - start;
  assert.equal(computations, 1); assert(cache.stats().units <= 1_000_000);
  cache.clear(); assert.deepEqual(cache.stats(), { entries: 0, units: 0 });
  console.log(JSON.stringify({ benchmark: '500 repeated cosmetic lookups, synthetic 300-rule fixture', uncachedMs, cachedMs, engineComputations: '500 → 1' }));
});
test('LRU bounds both entries and string memory and does not retain oversized values', () => {
  const cache = createStyleCache({ maxEntries: 2, maxUnits: 20 });
  let calls = 0; const compute = () => { calls++; return '12345'; };
  cache.get('a', compute); cache.get('b', compute); cache.get('a', compute); cache.get('c', compute);
  cache.get('a', compute); assert.equal(calls, 3); cache.get('b', compute); assert.equal(calls, 4);
  for (let i = 0; i < 100; i++) { cache.get(String(i), compute); assert(cache.stats().entries <= 2); assert(cache.stats().units <= 20); }
  cache.get('large', () => 'x'.repeat(30)); assert(cache.stats().units <= 20);
  const empty = createStyleCache(); let emptyCalls = 0;
  for (let i = 0; i < 10; i++) empty.get('empty', () => { emptyCalls++; return ''; });
  assert.equal(emptyCalls, 1);
});

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { FILTER_REVISION, fetchFilterLists, compileFilters, parseBundle } = require('../filter-lists.cjs');
const httpsResponse = require('./https-response.cjs');
async function main() {
  const target = path.join(__dirname, '..', 'assets', 'filters');
  const lists = await fetchFilterLists({ fetchImpl: httpsResponse });
  const bundle = compileFilters(lists);
  parseBundle(bundle);
  fs.mkdirSync(target, { recursive: true });
  for (const list of lists) fs.writeFileSync(path.join(target, list.name), list.text);
  fs.writeFileSync(path.join(target, 'bundle.json'), JSON.stringify(bundle));
  fs.writeFileSync(path.join(target, 'SOURCES.json'), JSON.stringify({ revision: bundle.revision, createdAt: bundle.createdAt, sources: bundle.sources }, null, 2));
  console.log(`Bundled and validated ${lists.length} maintainer filter lists; SHA-256 snapshot ${bundle.revision}.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

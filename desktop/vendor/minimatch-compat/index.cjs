'use strict';
// Build-only adapter. Matching and pattern parsing always use the patched
// upstream NFA engine; no old glob parser or generated matching regex is used.
const modern = require('minimatch-core');
class Minimatch extends modern.Minimatch {
  parse(pattern) {
    const matcher = super.parse(pattern);
    if (matcher && typeof matcher === 'object' && typeof matcher.test === 'function') {
      // glob 7 inspects _glob and calls String.match on each segment. Bridge
      // those legacy hooks directly to the upstream bounded matcher.
      matcher._glob = pattern;
      matcher[Symbol.match] = value => matcher.test(String(value)) ? [String(value)] : null;
    }
    return matcher;
  }
}
module.exports = Object.assign(modern.minimatch, modern, { Minimatch });

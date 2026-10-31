'use strict';
// Older packaging dependencies call require('minimatch') as a function. Modern
// consumers use named properties. Preserve both APIs on the upstream patched
// function; all matching and parsing remains in minimatch 11.0.1, not old code.
const modern = require('minimatch-core');
module.exports = Object.assign(modern.minimatch, modern);

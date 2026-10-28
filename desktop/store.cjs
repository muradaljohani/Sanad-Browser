'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { safeURL, mayRemember, sanitizeBookmarks } = require('./policy.cjs');
function openStore(directory) {
  const filename = path.join(directory, 'browser-state-v1.json');
  let saved = {};
  try { if (fs.statSync(filename).size < 2_000_000) saved = JSON.parse(fs.readFileSync(filename, 'utf8')); } catch {}
  const preferences = { theme: saved.preferences?.theme === 'light' ? 'light' : 'dark', protection: saved.preferences?.protection !== false };
  let bookmarks = [];
  try { bookmarks = sanitizeBookmarks(saved.bookmarks ?? []); } catch {}
  const history = Array.isArray(saved.history) ? saved.history.slice(0, 200).filter(entry => entry && safeURL(entry.url) && mayRemember(entry.url)).map(entry => ({ url: entry.url, title: String(entry.title ?? '').slice(0, 200), timestamp: Number(entry.timestamp) || 0 })) : [];
  const state = { preferences, bookmarks, history };
  let timer;
  const flush = () => {
    clearTimeout(timer);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${filename}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temporary, filename);
  };
  const persist = () => { clearTimeout(timer); timer = setTimeout(() => { try { flush(); } catch {} }, 150); };
  return { state, persist, flush };
}
module.exports = { openStore };

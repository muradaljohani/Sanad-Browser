'use strict';
/** Reorder existing objects without replacing their WebContents or crossing the pinned boundary. */
function moveTabBefore(tabs, id, beforeId = null) {
  const tab = tabs.find(item => item.id === id);
  if (!tab || id === beforeId) return [...tabs];
  const remaining = tabs.filter(item => item !== tab);
  const requested = beforeId === null ? remaining.length : remaining.findIndex(item => item.id === beforeId);
  if (requested < 0) return [...tabs];
  const boundary = remaining.filter(item => item.pinned).length;
  const index = Math.max(tab.pinned ? 0 : boundary, Math.min(tab.pinned ? boundary : remaining.length, requested));
  remaining.splice(index, 0, tab);
  return remaining;
}
module.exports = { moveTabBefore };

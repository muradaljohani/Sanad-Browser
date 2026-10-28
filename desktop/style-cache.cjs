'use strict';
/** In-memory LRU. The budget counts key+value UTF-16 code units, including empty results. */
function createStyleCache({ maxEntries = 64, maxUnits = 1_000_000 } = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || !Number.isInteger(maxUnits) || maxUnits < 1) throw new Error('Invalid style cache budget');
  const values = new Map();
  let units = 0;
  const remove = key => { const value = values.get(key); if (value !== undefined) { units -= key.length + value.length; values.delete(key); } };
  return {
    get(key, compute) {
      if (values.has(key)) { const value = values.get(key); values.delete(key); values.set(key, value); return value; }
      const value = compute();
      if (typeof value !== 'string' || key.length + value.length > maxUnits) return value;
      while (values.size && (values.size >= maxEntries || units + key.length + value.length > maxUnits)) remove(values.keys().next().value);
      values.set(key, value); units += key.length + value.length;
      return value;
    },
    clear() { values.clear(); units = 0; },
    stats: () => ({ entries: values.size, units })
  };
}
module.exports = { createStyleCache };

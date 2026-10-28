'use strict';
const fs = require('node:fs');
/** Pin the opened file and bound bytes actually consumed, including concurrent growth. */
function readBoundedText(filename, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 50_000_000) throw new Error('Invalid file size limit');
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('الملف غير صالح أو يتجاوز الحجم المسموح.');
    const chunks = [];
    let size = 0;
    while (true) {
      // Read one byte beyond the remaining allowance to detect growth at the boundary.
      const chunk = Buffer.allocUnsafe(Math.min(65_536, maxBytes - size + 1));
      const count = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (!count) break;
      size += count;
      if (size > maxBytes) throw new Error('الملف يتجاوز الحجم المسموح.');
      chunks.push(chunk.subarray(0, count));
    }
    return Buffer.concat(chunks, size).toString('utf8');
  } finally { fs.closeSync(fd); }
}
module.exports = { readBoundedText };

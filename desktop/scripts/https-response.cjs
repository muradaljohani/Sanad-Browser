'use strict';
const https = require('node:https');
const { Readable } = require('node:stream');
// Build-time list downloads use Node's TLS stream, avoiding the Windows fetch
// parser failure seen when lazy Electron downloads and list fetches overlapped.
module.exports = function httpsResponse(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { signal: options.signal, headers: { accept: 'text/plain', 'user-agent': 'Sanad-Browser-filter-build' } }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('Filter list unavailable')); return; }
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      resolve(new Response(Readable.toWeb(response), { status: 200, headers }));
    });
    request.on('error', reject);
  });
};

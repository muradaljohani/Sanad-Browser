'use strict';
const assert = require('node:assert/strict');
const { getCurrentFuseWire, FuseState, FuseV1Options } = require('@electron/fuses');
async function main() {
  const filename = process.argv[2]; if (!filename) throw new Error('Packaged executable path is required');
  const wire = await getCurrentFuseWire(filename);
  for (const option of ['RunAsNode', 'EnableNodeOptionsEnvironmentVariable', 'EnableNodeCliInspectArguments', 'GrantFileProtocolExtraPrivileges']) assert.equal(wire[FuseV1Options[option]], FuseState.DISABLE, option);
  for (const option of ['EnableCookieEncryption', 'EnableEmbeddedAsarIntegrityValidation', 'OnlyLoadAppFromAsar']) assert.equal(wire[FuseV1Options[option]], FuseState.ENABLE, option);
  console.log('Verified the installed executable: Node/debug injection disabled, encrypted cookies, verified ASAR only, no privileged file protocol.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

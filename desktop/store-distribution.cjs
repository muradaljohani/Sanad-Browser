'use strict';
const STORE_UPDATES_URI = 'ms-windows-store://downloadsandupdates';
function createStoreUpdateChecker() {
  const snapshot = () => ({ status: 'store-managed', installation: 'microsoft-store', latestVersion: null, checkedAt: null, releaseUrl: null, notes: [] });
  return { snapshot, check: async () => snapshot() };
}
module.exports = { STORE_UPDATES_URI, createStoreUpdateChecker };

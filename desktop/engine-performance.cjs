'use strict';
function configureEnginePerformance(commandLine, privacy) {
  commandLine.appendSwitch('enable-gpu-rasterization');
  commandLine.appendSwitch('enable-zero-copy');
  const current = commandLine.getSwitchValue?.('enable-features') || '';
  commandLine.appendSwitch('enable-features', [...new Set([...current.split(',').filter(Boolean), 'ParallelDownloading', 'BackForwardCache'])].join(','));
  if (!privacy.enabled) commandLine.appendSwitch('enable-quic');
}
module.exports = { configureEnginePerformance };

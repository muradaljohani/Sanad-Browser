'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const actions = new Set(['state', 'new', 'activate', 'close', 'restore', 'navigate', 'back', 'forward', 'reload', 'stop', 'home', 'pin', 'mute', 'suspend', 'zoom', 'bookmark', 'bookmark-remove', 'bookmark-import', 'bookmark-export', 'history-clear', 'theme', 'protection', 'protection-update', 'network-privacy', 'downloads', 'download-pause', 'download-resume', 'download-cancel', 'download-reveal', 'find', 'find-stop', 'reader', 'reader-clear', 'diagnostics', 'save-pdf', 'save-image', 'save-offline', 'overlay', 'toolbar-height', 'devtools', 'fullscreen', 'copy-link', 'account', 'updates-check', 'updates-open', 'about-copy', 'chromium-licenses']);
contextBridge.exposeInMainWorld('sanadBrowser', Object.freeze({
  command: (action, data = {}) => actions.has(action) ? ipcRenderer.invoke('sanad-browser:command', action, data) : Promise.reject(new Error('Unknown action')),
  onState: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('sanad-browser:state', listener); return () => ipcRenderer.removeListener('sanad-browser:state', listener); },
  onFocusAddress: callback => { const listener = () => callback(); ipcRenderer.on('sanad-browser:focus-address', listener); return () => ipcRenderer.removeListener('sanad-browser:focus-address', listener); },
  onOpenPanel: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('sanad-browser:open-panel', listener); return () => ipcRenderer.removeListener('sanad-browser:open-panel', listener); }
}));


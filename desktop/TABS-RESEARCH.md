# Tab interaction references

Reviewed on 2026-11-01. The implementation is original and has no new runtime dependency.

- [Chromium tab strip](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/ui/views/tabs/tab_strip.cc): separate the tab model from animated removal, preserve close targets during mouse closure, and distinguish pinned ordering and selected state.
- [adamschwartz/chrome-tabs](https://github.com/adamschwartz/chrome-tabs), MIT: add/remove/move interactions and bounded visual transitions. Its Draggabilly dependency is not imported.
- [pansinm/react-chrome-tabs](https://github.com/pansinm/react-chrome-tabs): current location found for the supplied Sinm link; explicit activation, close and reorder callbacks. Sanad's desktop shell is Vanilla JS rather than React, so this wrapper is not installed.
- [minbrowser/min](https://github.com/minbrowser/min), Apache-2.0: separate tab creation, incremental updates, close events and tab state.
- [wexond/browser-base](https://github.com/wexond/browser-base): model/UI separation and keeping WebContents tied to tab identity. This repository is archived and its README disallows using its code/assets. No source or asset is incorporated.
- [joelshepherd/tabliss](https://github.com/joelshepherd/tabliss), [CaretTab](https://github.com/bluecaret/caretTab) and [nightTab](https://github.com/zombieFox/nightTab): references for the distinct role of a new-tab start page. Sanad's existing search page remains the new-tab destination, with immediate address focus and no added background/widget services.

## Implemented behavior

The privileged shell reconciles tab nodes by their UUID. Titles, loading and media flags update in place. Only structural layout changes animate; reduced-motion preferences disable movement. A mouse close freezes existing tab widths until the pointer leaves, keeping later close targets stable. Reordering changes model order without replacing or reloading page renderers, and cannot move an unpinned tab ahead of pinned tabs.

The strip exposes a horizontal tablist, selected state, one tab stop, RTL-aware arrow/Home/End navigation, Delete close, middle-click close, a tab count and overflow scrolling. Browser-level Ctrl+1…9, Ctrl+PageUp/PageDown and Ctrl+Shift+PageUp/PageDown switch or move tabs. Native menus provide duplicate, pin, mute, close and reopen actions. Private tabs create private successors. Page sandboxing, the trusted IPC sender check and strict search policy remain in force.

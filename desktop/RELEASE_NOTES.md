# 1.3.7 — Clear browser controls and permanent strict-search lock

- Refine tabs with connected active-tab curves, clear close targets, compact pinned tabs, and a rounded address bar.
- Replace the tools grid with grouped menu rows, icons, shortcuts, expandable save/tools groups, and stable zoom controls.
- Add actual system printing and shortcuts for printing, saving, history, bookmarks and downloads.
- Show a permanent green strict-search lock that opens a clear explanation of the enforced search policy. It has no disable control.
- Keep a bounded page image only in memory while a shell panel is open, then discard it when closed or the active tab changes.

---

# 1.3.6 — Fluent tabs and location privacy

- Keep tab elements stable during title/loading updates; animate opening, closing and reordering with reduced-motion support.
- Add drag ordering, RTL keyboard navigation, middle-click close, a tab count, overflow controls and native tab actions.
- Keep pinned tabs together, preserve renderer sessions during moves, inherit private mode for new tabs, and focus the address field for new searches.
- Include geolocation denial, restricted non-proxied WebRTC UDP and optional local SOCKS5 routing. Routing is configured but not a guarantee of anonymity; a trusted external tunnel is required.
- Keep Sanad SafeSearch locked to strict. Store publication remains a separate release step.

---

# 1.3.5 — Sanad browser identity

- Replace Electron and old package product tokens in the User-Agent with one `SanadBrowser/<version>` identity.
- Apply the identity before startup and to regular/private browsing sessions, retaining the runtime Chromium version and platform information.
- Verify both network request headers and navigator.userAgent, including popup and private tabs. Authentication-provider policies remain independent of browser branding.

---

# 1.3.4 — Local data protection and efficient search/update paths

- Encrypt application history, bookmarks and preferences using AES-256-GCM with an OS-protected random key, asynchronous writes and safe migration from JSON.
- Preserve inaccessible or modified encrypted profiles in a read-only recovery state; About Sanad shows actual protection availability. Linux basic_text is not represented as secure encryption.
- Open the lightweight official web-search entry directly from desktop, preserving query/filter/private-mode behavior.
- Revalidate update metadata with ETag and bound stalled response bodies; Store-managed updates remain on the Store channel.
- Replace vulnerable build-time minimatch implementations with patched 11.0.1 through a small legacy API adapter, with compatibility and amplification regression tests. Existing dependency/security/signature gates remain enabled.

These source changes require a new desktop distribution. Store submission and trusted-publisher signing follow the existing release gates.

---

# Sanad Browser 1.3.3 — earlier YouTube ad protection

- Remove known advertising metadata before YouTube's initial inline player consumes it, and from scoped player/playlist/Shorts fetch and XHR responses.
- Preserve the original Response, media URLs, request bodies, playback status, normal Shorts entries and opt-out behavior. Re-enabling protection also applies to subsequent documents.
- Keep fixed packaged code, HTTPS checks, renderer sandboxing and exact shell-only IPC. No downloaded scriptlets, remote-page preload, debugging port or privileged page bindings are introduced.
- Add native before-inline/fetch/XHR/reload regressions and a separate live YouTube playback probe that records service walls as inconclusive.

This requires a new Microsoft Store submission. Live campaign coverage varies; there is no guarantee that every present or future YouTube advertisement is blocked. Server-inserted advertisements embedded in ordinary media are not independently removed by metadata pruning.

---

Sanad Browser 1.3.2 — security maintenance

- Avoid exponential backtracking when resolving malformed dotted addresses; preserve normal hostnames, trailing-dot DNS, ports and literal search terms.
- Pin each opened JSON/filter file to one descriptor and bound bytes actually read, preventing path-replacement and concurrent-growth bypasses of the size checks.
- Reuse cosmetic filtering with a bounded per-session cache and avoid whole-page class monitoring on YouTube.
- Add narrow first-party YouTube ad-request rules, delayed skip-control retries and SPA player replacement handling, while preserving ordinary video APIs and media preferences.
- Preserve Chromium sandboxing, private-session isolation, consent prompts, signed distribution gates and Store-managed updates.
- Add focused denial-of-service and file-race regression fixtures and remove generated JavaScript from the tab-test click helper.

This source update requires a new Microsoft Store submission. Existing Store installations do not receive a code change merely because the GitHub repository changed. No claim of zero unknown vulnerabilities or guaranteed advertisement blocking is made.

---

Sanad Browser 1.3.0 — Windows x64 security and protection preview

Engine: Electron 45.1.0 / Chromium 156, pinned in the lockfile. Supported target: Windows 10/11 x64.

Security changes: forced renderer sandboxing; exact local-shell IPC sender validation; production rejection of sandbox/TLS/debugging bypass switches; encrypted-cookie and ASAR-integrity fuses; disabled Node environment/inspector escape paths; per-user installation without administrator elevation; active-tab/concurrency download limits; safe Windows filenames and explicit executable-download confirmation. Downloaded files are never executed automatically.

Ad/tracker protection: EasyList and EasyPrivacy snapshots are bundled at build time, with publisher version, source URL and SHA-256 recorded inside the package. The network adapter never installs a remote-page preload/IPC bridge. A separate engine supplies CSS hiding only: downloaded list scriptlets and CSP rewriting are disabled. YouTube-specific handling runs original, fixed code in an isolated page world, attempts to skip positively identified ads, and restores media preferences. This is best effort: it does not guarantee that every present/future YouTube ad is blocked. Protection can be disabled in the privacy panel.

Validation gates: unit security/policy/update/filter tests, actual Chromium desktop interaction tests, full dependency audit, Windows/Linux packaging, and installation/launch/About/fuse verification of the actual Windows Setup executable. The Windows proof artifact records Authenticode status and SHA-256. A passing audit is not proof of the absence of unknown vulnerabilities; no independent penetration-test certification is claimed.

Choose Setup.exe to install, or Portable.exe to run without installation. Code signing is enabled only when the publisher has configured a trusted Windows certificate in the release workflow. If the proof reports NotSigned, this remains an unsigned preview and Windows may warn about the publisher. Never bypass a security warning merely because this release exists. Update installation remains manual; the checker never executes downloaded code.




# Sanad Browser 1.3.2 — security maintenance

- Avoid exponential backtracking when resolving malformed dotted addresses; preserve normal hostnames, trailing-dot DNS, ports and literal search terms.
- Pin each opened JSON/filter file to one descriptor and bound bytes actually read, preventing path-replacement and concurrent-growth bypasses of the size checks.
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



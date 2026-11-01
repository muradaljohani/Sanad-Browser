# Sanad Browser desktop

An executable Chromium browser built with Electron 45.1.0, alongside Sanad's existing mobile web search. This directory is additive: the original browser site, APIs, Electron templates and future-system entries remain available. Klaok is a separate system.

Location privacy: geolocation is denied and WebRTC non-proxied UDP is restricted. The privacy panel also offers an optional local SOCKS5 route with no direct fallback for web requests and a fresh in-memory browsing session. It requires a separately operated, trusted tunnel; it does not bundle Tor or a VPN and does not promise anonymity. See [LOCATION-PRIVACY-AR.md](LOCATION-PRIVACY-AR.md) for setup, limits and verification requirements.

Sanad search links always use `safeSearch=strict`, including private sessions and legacy search returns. The search service enforces this policy independently of URL parameters; other websites remain outside this Sanad search policy.

## Microsoft Store channel

The source version 1.3.1 adds a separate Microsoft Store MSIX build and Store-managed update UI. See [STORE.md](STORE.md) for reserved identity variables, CI package installation proof and the owner onboarding/submission steps. Store packaging does not require buying a publisher certificate; Microsoft signs after certification. The existing 1.3.0 direct EXE preview remains unsigned.

## Run and build

```sh
cd desktop
npm ci
npm start
npm test
# Linux CI / a desktop with X11:
xvfb-run -a npm run test:desktop
npm run dist:win
npm run dist:linux
```

Windows x64 installer and portable EXE, and Linux x64 AppImage, are produced by `.github/workflows/desktop.yml`. Version 1.3.0 is an unsigned preview. New Windows release publication requires a valid timestamped signature from the pinned trusted publisher; unsigned builds are CI test artifacts only. See [SIGNING.md](SIGNING.md) for certificate/provider prerequisites and the release gate. The About panel checks published versions and opens the release/download page; installation remains manual. See the update contract below. The application does not disable certificate verification or ask users to disable operating-system protection.

## Working features

- Real isolated `WebContentsView` tabs: navigation, back/forward, loading/stop, popup tabs, zoom, audio mute, pin, search and restore closed tabs. Maximum 32 tabs.
- Downloads from Electron's actual download events: progress, pause/resume where the server supports it, cancel, and show the saved file. Files never execute automatically.
- Find in page with actual Chromium matches; developer tools and fullscreen.
- Reader view using Mozilla Readability, executed against a cloned document in a sandboxed isolated world. Only bounded plain text enters the trusted shell; closing it returns to the original page.
- A native page/link/text context menu with safe link opening, private opening, copy/edit roles and literal selected-text search. Save the visible page as PNG or export a single-file MHTML archive for an offline-capable reader, alongside PDF export.
- On-demand navigation/first-contentful-paint timing, actual renderer-process working-set memory when available, GPU compositor status, and PDF export through Chromium's renderer. Metrics remain local and are not invented when an API is unavailable.
- Device-local bookmarks with JSON import/export and deduplication, bounded history, and tracking-parameter removal when copying a link.
- Optional tracker/ad request blocking using Ghostery's MPL-2.0 engine. Basic offline network rules run immediately; updating EasyList/EasyPrivacy is an explicit action. CSS hiding and fixed packaged YouTube helpers complement network blocking; no remote-page preload is used.
- Private tabs share a temporary in-memory partition separate from normal cookies. Closing the last private tab clears its storage/cache and completed download records. Downloaded files remain on the device. Private visits and closed tabs are not persisted to history. Pending download records are removed after completion if the private session has closed.
- Manually rest inactive tabs to release their renderers. Tabs reload when activated; save text in forms before resting them. No invented memory metrics or saved-memory claims.
- Light/dark appearance and the English `Sanad` wordmark with individually coloured letters.

## Accounts and web integration

The home/search page is the existing `https://ip-murad.com/browser?surface=desktop`. That surface omits its web toolbar so the native toolbar appears once. The app also appends its own `SanadBrowser/1.3.0` identity to its real user agent, so return links from future systems keep a single toolbar; it does not spoof Chrome's identity. Private Sanad pages add a first-party mode hint so typing suggestions and search caches/history stay disabled; unrelated websites receive no private-mode identity marker. Copy-link removes desktop-only surface/mode hints from shared browser URLs. Sanad's existing unified authentication stays on the website. A valid normal-session login persists in `persist:sanad-web`; a new device/profile must sign in once. The app does not copy credentials or cookies from Chrome, and does not silently sign a person in solely because an account exists. Private sessions do not inherit the normal login.

Desktop browsers do not run inside a mobile web page. The responsive web version remains available on phones. Google Sync, a password manager, full Chrome-extension compatibility, Safe Browsing service integration and OS-level default-browser registration are not implemented. This is not a full fork of Chrome or Brave.

## Security and sources

External pages use sandboxing, context isolation, disabled Node integration, enabled web security and HTTPS navigation. The trusted shell uses a restricted custom protocol and a narrow preload API; IPC accepts only its exact main frame. Other protocols, credential-bearing URLs, invalid certificate navigation and unexpected permissions are not bypassed. Camera/microphone, location and notification requests require a contextual prompt for the active site and expire with the session. Test-only localhost support requires an unpackaged app and explicit environment flags.

Architecture references: [Chromium developer guide](https://www.chromium.org/developers/), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view), [Brave Core](https://github.com/brave/brave-core), [Ungoogled Chromium](https://github.com/ungoogled-software/ungoogled-chromium), [Min](https://github.com/minbrowser/min), [Ghostery](https://github.com/ghostery/adblocker). Brave/Ungoogled/Min code is not incorporated. Their automatic-update infrastructure and brand assets are not copied.

See `THIRD_PARTY_NOTICES.md` and the Electron/Chromium licence files accompanying the binaries. The wordmark is an original textual Sanad asset; it does not embed Google's wordmark or a proprietary Google font.

`ARCHITECTURE.md` maps the fetching, DOM/CSS, layout, painting and composition sources to this implementation. Chromium's production Blink/V8 engine performs those stages; no educational toy engine replaces it.

`RESEARCH.md` records the user-supplied engine/framework repositories and maps each reviewed pattern to an actual implementation or an explicit reference-only boundary. It includes the current Firefox repository and the moved developer-roadmap repository.

## Tabs and About in 1.2.0

Middle/Ctrl clicks load real background tabs, including Electron's case where no pre-created `webContents` is supplied. Named windows, POST submissions, `about:blank` openers and script closing stay inside the tab manager. Closing a child returns to its opener when available; a child can survive its opener. Zoom is isolated per tab. HTTPS/permissions/sandbox limits are retained.

About displays actual app/engine/platform versions, copies diagnostic version text, shows bounded plain release notes and distinguishes checking/current/available/ahead/error states with the last successful check time. Local licences, third-party notices and the Chromium licence HTML distributed with Electron are accessible from the panel. Chromium notices use a separate sandboxed, script-disabled document, not the trusted shell origin.

The fixed public metadata feed is `https://ip-murad.com/browser/desktop-release.json`. Only schema 1 / preview / manual metadata and an exact version-specific release URL for this repository are accepted. Responses are limited to 32 KiB and 8 seconds, concurrent checks coalesce, and automatic checks are limited to once per 15 minutes in the running process. Packaged normal sessions check when About opens; development/private sessions require an explicit check. No cookies, account identifiers, telemetry or installer bytes are sent or downloaded by the checker. No executable is installed or launched automatically.

`update.electronjs.org` requires public GitHub releases and a compatible update format (Windows Squirrel or MSIX; macOS ZIP, with the platform signing requirements). This repository is private and currently builds Windows NSIS/Portable. We therefore do not point Electron autoUpdater at an incompatible feed, expose access tokens or change repository visibility. Opening the GitHub release may require an authorised GitHub account. Publish new binaries first, then update the website's version metadata. A future signed, supported distribution channel can add actual automatic installation separately.


## 1.3.0 security/protection build

The current source targets Electron 45.1.0. `npm ci`, `npm audit --audit-level=moderate`, `npm run prepare:filters`, `npm test` and the Chromium interaction suites are required before packaging. `npm run dist:win` bundles current EasyList/EasyPrivacy data and builds per-user NSIS/Portable artifacts. Production bundles disable Node/inspector environment injection, require integrity-checked ASAR loading and encrypted cookies, and reject unsafe startup switches. Downloaded list code/CSP changes are disabled; only network rules and CSS hiding are used, plus fixed packaged YouTube player-data and isolated playback helpers with opt-out. The main process registers the data helper before navigation without opening a debugging port or exposing IPC to the page.

The Windows CI job actually installs Setup.exe and verifies the installed UI, engine version, hardening fuses, renderer flags and clean shutdown. `windows-install-proof` includes the screenshot and JSON status, including actual Authenticode state and binary digests. Publisher verification and the release gate are mandatory. The existing certificate-file signing path uses repository secrets `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` and the public approved-certificate variable `WIN_SIGNING_CERT_SHA1`; hardware/cloud keys need their provider-specific integration. A missing identity blocks release publication and is never replaced with self-signed trust. The installed executable and uninstaller, Setup and Portable files are checked against the pinned publisher. See RELEASE_NOTES.md for the limits of security and YouTube filtering; no 100% safety/ad-blocking guarantee is made.



## Local profile encryption and Tor research

The desktop application encrypts its own history, bookmarks and preferences using AES-256-GCM and a random key protected by Electron's asynchronous OS vault. Existing JSON profiles migrate after a complete encrypted snapshot is committed. Unavailable keys or damaged encrypted profiles enter a read-only recovery state rather than overwriting the original file. About Sanad shows actual encryption availability; Linux basic_text is not treated as a secure vault. Website storage, downloads and explicit bookmark exports are separate from this scope.

See [the Arabic research and implementation report](TOR-RESEARCH-AR.md) for source review, migration, threat boundaries, performance changes and tests. Source changes require a desktop release before installed users receive them.


## Browser identity

The runtime User-Agent identifies the application as `SanadBrowser/<app version>` and retains Chromium's actual OS, architecture and Chrome engine tokens. The global fallback is set before windows/sessions are created, and both regular/private sessions use the same normalization. See [User-Agent behavior and authentication limits](USER-AGENT.md). No fixed Chrome version, Google-specific identity override or authentication bypass is used.


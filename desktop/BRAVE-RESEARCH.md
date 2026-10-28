# Brave architecture review and Sanad 1.3.2

Reviewed on 28 October 2026. `brave/brave-browser` is the issue/release repository; its README points to `brave/brave-core` for implementation.

Primary references reviewed:

- https://github.com/brave/brave-browser/blob/master/README.md
- https://github.com/brave/brave-core/blob/master/components/brave_shields/content/browser/ad_block_engine_wrapper.cc
- https://github.com/brave/brave-core/blob/master/components/brave_shields/core/browser/ad_block_dat_cache_manager.cc
- https://github.com/brave/adblock-rust
- https://github.com/brave/adblock-resources/blob/master/resources/brave-youtube-navigation-fix.js
- https://github.com/brave/adblock-resources/blob/master/resources/brave-youtube-playback-speed-fix.js

The useful principles are separate network and cosmetic decisions, explicit first-party policy, reuse of compiled work, bounded caches, and care around YouTube SPA navigation and user playback speed. Sanad implements its own changes using the existing pinned Ghostery engine; it does not copy Brave's code or enable downloadable page scriptlets.

Changes in this release:

- Original first-party rules target YouTube's `/pagead/` and `/api/stats/ads` ad requests. Normal player API calls and shared `googlevideo.com` media streams remain allowed in focused regression fixtures.
- A session-scoped cosmetic LRU avoids repeated engine computation for the same full URL. Each cache is bounded to 64 entries and one million UTF-16 code units (keys plus styles, about 2 MB of string contents). It is cleared on protection disable, filter replacement and session release. Authentication callback URLs are not cached.
- The isolated YouTube guard observes the player rather than every class mutation across the page. It has no polling timer during ordinary video, handles late skip controls and SPA player replacement, retries only during a positive ad state, avoids repeatedly seeking one ad segment, and restores the user's mute/speed state.
- TLS, process sandboxing, context isolation, denied Node integration, exact shell IPC checks and disabled remote scriptlets remain enforced.

A local synthetic benchmark of 500 repeated cosmetic lookups with 300 fixture rules measured about 87.13 ms without reuse and 0.48 ms with the cache, reducing engine computations from 500 to 1. This measures only repeated filter lookups in that fixture; it is not a claim that websites load that much faster. Timing varies by machine.

Automated native Chromium tests use controlled ad/player fixtures, including opt-out and isolation checks. They cannot prove that every live YouTube campaign, region, account or future anti-adblock change is handled. Brave-level security equivalence and zero vulnerabilities are not claimed. A new Store submission is required to distribute this source update to installed users.


## Sanad 1.3.3: document-start player metadata

Further primary sources reviewed on 28 October 2026:

- https://github.com/brave/adblock-resources/blob/master/filter_lists/list_catalog.json
- https://github.com/uBlockOrigin/uAssets/blob/master/filters/quick-fixes.txt (blob `4c58d44b41914a1087b8ed980b495fcac939447c`)
- https://github.com/uBlockOrigin/uAssets/blob/master/filters/filters.txt (blob `a290933a160d7a648015c64242e6cb8eb7e62246`)
- https://www.electronjs.org/docs/latest/api/debugger
- https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-addScriptToEvaluateOnNewDocument

Brave's default filter catalog includes uBlock Origin's lists. Those lists combine initial player-response pruning with fetch/XHR rules for `adPlacements`, `adSlots` and `playerAds`, and remove explicitly marked advertising Shorts entries. Merely hiding the Skip button area cannot implement those rules. Sanad's new implementation is original code inspired by these mechanisms; no Brave/uBO scriptlet code was copied and no arbitrary downloaded rules are executed.

`youtube-injection.cjs` uses Electron's internal main-process Debugger transport to register exactly one packaged script before application-controlled navigation. It opens no debugging port, installs no page bindings and does not enable network interception, TLS/CSP bypass or remote preloads. New contents first navigate to local `about:blank` because Electron can defer debugger replies until the first navigation. Adopted popups retain their original POST body/opener and receive best-effort immediate injection. Opening DevTools can detach this transport; it is not reattached against the user's inspector, and existing network/CSS/isolated-player protection remains available.

`youtube-data.cjs` is inert outside HTTPS YouTube hosts. It hooks only the initial player property and same-origin known player/playlist/Shorts API responses. It removes three named advertisement fields and explicitly marked ad Shorts entries, preserving media URL, playability and ordinary content fields. Native fetch Response objects, status/headers/URL, clones, body consumption and request bodies are retained. Text parsing is limited to eight million characters and malformed/non-JSON bodies pass through. JSON.parse is not globally replaced; direct readable-stream consumers and server-inserted ads within normal media may not be covered. No account, user-agent, attestation, anti-bot or access-control spoofing is performed.

Protection disable restores installed hooks and unregisters future-document code; already consumed/pruned data requires a reload for a fresh unmodified response. The isolated positive-ad skip/mute helper remains a fallback. Unit and native fixtures cover first inline consumption, fetch text/JSON/clones, XHR, scoped endpoints, lookalike origins, opt-out and reload. A separate fresh-profile live probe records playback observations or a service/network wall. A blocked live probe is inconclusive, never evidence of ad-free playback.

The first live probe in GitHub Actions reached the real `Me at the zoo` watch page on 28 October 2026. YouTube returned `LOGIN_REQUIRED` with “Sign in to confirm you’re not a bot”; media time stayed at zero. The hook was installed and the remote page still had no Node or shell bridge, but playback/ad coverage was inconclusive. No login wall, user-agent or bot check was bypassed. Deterministic Chromium regressions for before-inline consumption, real fetch/XHR, opt-out/reload, media restoration and clean initial history passed separately.

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

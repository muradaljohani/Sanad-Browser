# Rendering architecture

Sanad desktop uses the actual Chromium engine bundled with Electron 44.7.0. Engine versions come from `process.versions`, and the app does not pretend to be a source fork of Google Chrome. Blink, LayoutNG, V8 and Chromium's painting/compositing implementation handle website content.

| Stage | Production engine responsibility | Sanad integration |
| --- | --- | --- |
| Fetching | Chromium networking, caching and session cookies | HTTPS destinations, persistent normal profile, isolated temporary private profile, network-rule filtering, real download events |
| DOM / CSS | Blink parses HTML and CSS, applies styles and invalidates affected elements | Untrusted pages have no Node integration or privileged preload; rendering tests verify DOM, CSS grid and computed colours |
| JavaScript | V8 executes site JavaScript in the renderer | Sandboxing/context isolation; page scripts cannot invoke the browser's desktop command bridge |
| Layout | LayoutNG calculates geometry for modern layout | Real responsive page sizing; header ResizeObserver coalesces native bounds changes and ignores unchanged heights |
| Paint / composition | Chromium painting and GPU composition, with platform fallback | The app keeps the engine's acceleration defaults; diagnostic GPU state reports what the device actually supports |
| Visibility / resources | Chromium background scheduling and lifecycle | Background throttling stays enabled; manual resting releases inactive, unpinned, non-audible renderers and reloads them on activation |

The trusted shell is served from the restricted `sanad-app://browser` protocol. Website views use separate WebContents objects; IPC accepts only the trusted shell's exact main frame. High-frequency state pushes (including blocked-request counts) coalesce into one update per 50 ms, while command responses remain immediate. The hosted Sanad home page uses `surface=desktop` and the app's own SanadBrowser user-agent identity to avoid duplicate toolbars after return navigation. The mobile web page continues to use the device browser and does not claim to ship a desktop engine into a website.

Timing diagnostics read Navigation Timing and Paint Timing only after an explicit request, with a timeout and finite-value validation. Missing metrics stay unavailable. Working-set memory refers to the renderer **process**, which can be shared; it is not a per-tab estimate or a claim about saved RAM. Private metrics never enter the persistent store. Chromium itself renders the PDF export.

The web search companion retains the established interface. Result thumbnails decode asynchronously and load lazily; after the first four cards, supported browsers can defer offscreen layout/paint using `content-visibility: auto` and remembered intrinsic sizes. Search requests still cancel stale work, deduplicate equivalent requests and run the internal service index in parallel. These are implementation changes; no universal speed multiplier is claimed.

## Sources reviewed

- [Chromium developer documentation](https://www.chromium.org/developers/) and [RenderingNG](https://developer.chrome.com/docs/chromium/renderingng): production rendering phases, LayoutNG and composition.
- [How browsers work](https://web.dev/articles/howbrowserswork) (the current destination of the supplied HTML5Rocks link): fetching, parsing, style, layout and paint concepts.
- [Build your own X — Web Browser](https://github.com/codecrafters-io/build-your-own-x#build-your-own-web-browser) and [Let's build a browser engine](https://limpet.net/mbrubeck/2014/08/08/toy-layout-engine-1.html): educational DOM/layout models. These clarify the architecture; their toy code is not copied into the production engine.
- [depot_tools tutorial](https://commondatastorage.googleapis.com/chrome-infra-docs/flat/depot_tools/docs/html/depot_tools_tutorial.html): Chromium source checkout and build workflows. GN/Ninja are relevant to a source fork; this application consumes the tested Electron engine distribution rather than claiming to perform a Chromium source checkout.
- [Page Lifecycle API](https://developer.chrome.com/docs/web-platform/page-lifecycle-api), [content-visibility](https://web.dev/articles/content-visibility), [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view), [Electron app metrics](https://www.electronjs.org/docs/latest/api/app#appgetappmetrics).
- [Brave Core](https://github.com/brave/brave-core) and [Ungoogled Chromium](https://github.com/ungoogled-software/ungoogled-chromium): privacy, browser/source separation and explicit control. Their code and proprietary services are not bundled; the app does not weaken certificate validation to imitate a privacy fork.

The release workflow tests rendering, navigation, secure popups, isolation, actual network blocking, private storage cleanup, downloads, find, PDF generation and normal cookie persistence before publishing binaries. Source notices and Chromium's bundled licence catalogue remain with the distribution.

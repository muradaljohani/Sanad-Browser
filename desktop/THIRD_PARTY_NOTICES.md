# Third-party notices

The bundled shared settings UI uses the same BrowserSettings component as Sanad's web application. It includes React and React DOM 19.2.7 (MIT) and Lucide React 0.546.0 (ISC and upstream notices). Exact dependency versions, source commit and bundle SHA-256 values are recorded in `ui/settings/SOURCES.json`; complete license texts are preserved in `ui/settings/THIRD_PARTY_LICENSES.txt`. No remote script is loaded into the privileged shell.

Sanad desktop's original application code and English wordmark are licensed under MIT (see LICENSE). Dependencies retain their original licences.

- Electron 45.1.0: MIT. https://github.com/electron/electron/tree/v45.1.0 . The distribution includes LICENSE.electron.txt and LICENSES.chromium.html; keep these files with the application.
- Chromium and its third-party components: applicable BSD-style and other licences enumerated in LICENSES.chromium.html shipped by Electron. https://www.chromium.org/chromium-projects/ . The application exposes actual Chromium/Electron version numbers, not a fake Chrome version.
- @ghostery/adblocker-electron 2.20.1 and its Ghostery engine dependencies: MPL-2.0, unmodified. Source: https://github.com/ghostery/adblocker/tree/v2.20.1 . Bundled packages contain their licence files. This source repository also provides package-lock.json for reproducible retrieval of the exact npm distribution.
- @mozilla/readability 0.6.0: Apache-2.0, unmodified. Source: https://github.com/mozilla/readability . The bundled package includes LICENSE.md. Copyright (c) 2010 Arc90 Inc and subsequent project contributors. Its output is used only as plain text, not inserted as unsanitized HTML into the trusted shell.
- EasyList / EasyPrivacy: bundled from their maintainers and refreshed only on the user's explicit update action. https://easylist.to/ . Their filter-file licence notices remain in the upstream sources. Lists do not inject scriptlets or cosmetic page preloads in this application.
- electron-builder 26.17.0: MIT; Playwright 1.58.2: Apache-2.0. Build/test dependencies only; not included in app.asar.

Brave, Ungoogled Chromium and Min were consulted as architectural references. Their code, names, logos and licensed browser services are not bundled. Google's browser identity, proprietary fonts, Sync and Chrome Web Store services are not included.


## Bundled filter lists

EasyList and EasyPrivacy are obtained from their maintainers at https://easylist.to/. The full list text, including its original copyright/license notices, and a SOURCES.json with exact versions and SHA-256 values are included under assets/filters in each built application. Compiled network/CSS snapshots use the pinned Ghostery engine. The application does not enable downloaded scriptlets or CSP-modifying filters. The original lists and problem-reporting instructions are available at https://easylist.to/.




# سَنَد الحرمين — Sanad Browser

متصفح سطح مكتب مفتوح المصدر مبني على Chromium عبر Electron، بواجهة عربية وتبويبات معزولة وتوزيع رسمي عبر Microsoft Store.

**[تحميل Windows من الموقع الرسمي](https://ip-murad.com/browser/download/) · [Microsoft Store](https://apps.microsoft.com/detail/9NZB8PG7D7KP) · [الإبلاغ عن ثغرة](SECURITY.md)**

This repository contains the desktop browser application only. The website, account services, search backend, deployment credentials and historical prototypes are separate. Its initial import includes the browser source, tests and build workflows, without importing private Git history.

## What is included

- Chromium tabs with sandboxing, context isolation and no Node.js or privileged IPC bridge in remote pages.
- Separate temporary private sessions, local bookmarks and browsing history.
- Reader mode, find in page, PDF/image/MHTML export and bounded, user-directed downloads.
- Optional EasyList/EasyPrivacy filtering and best-effort YouTube ad handling. Blocking every advertisement is not guaranteed.
- Windows MSIX packaging, Store-managed updates, and CI installation tests.

Sanad is an independent project; it is not Google Chrome and is not affiliated with Google. Chromium, Electron and other dependencies retain their own licenses.

## Build and test

Use Node.js 24 and npm. Linux GUI tests require a desktop session or Xvfb; Windows packaging requires Windows.

```sh
git clone https://github.com/muradaljohani/Sanad-Browser.git
cd Sanad-Browser/desktop
npm ci
npm audit --audit-level=moderate
npm test
npm start
```

```sh
# Actual Chromium interaction tests (on Linux with Xvfb)
npm run prepare:filters
xvfb-run -a npm run test:desktop

# Windows packaging on a Windows development machine
npm run dist:win
```

Source builds are development builds. Only the official Microsoft Store installer carries Microsoft's distribution signature. Never install a CI test certificate on an end-user machine or bypass a Windows security warning.

## Security and contributions

Read [SECURITY.md](SECURITY.md), [the security review](docs/security-review-2026-10-28.md), [architecture](desktop/ARCHITECTURE.md), and [contribution instructions](CONTRIBUTING.md). CodeQL, dependency audits, secret scanning and tests provide repeatable checks; passing them does not prove the absence of unknown vulnerabilities.

[Desktop documentation](desktop/README.md) · [Store packaging](desktop/STORE.md) · [publisher signing](desktop/SIGNING.md) · [third-party notices](desktop/THIRD_PARTY_NOTICES.md) · [privacy policy](https://ip-murad.com/browser/privacy/)

## License

The application source is [MIT licensed](LICENSE). Third-party libraries and filter lists are covered by their respective notices and licenses. Branding and third-party imagery are not an endorsement or a grant of trademark rights.

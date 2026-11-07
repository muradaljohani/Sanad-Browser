# Contributing

يرحب سَنَد الحرمين بالمساهمات عبر Issues وPull Requests. أرسل البلاغات الأمنية سرًا وفق [سياسة الأمان](SECURITY.md).

<div dir="rtl" align="right">

## ابدأ المساهمة

1. ابحث في [البلاغات المفتوحة](https://github.com/muradaljohani/Sanad-Browser/issues)، ثم اختر [النموذج المناسب](https://github.com/muradaljohani/Sanad-Browser/issues/new/choose) للمشكلة أو الاقتراح. يمكنك الكتابة بالعربية أو الإنجليزية.
2. أنشئ نسخة من المستودع وفرعًا مبنيًا على `main`. يعرض [دليل المشروع](docs/README.md#repository-map) مواقع الواجهة والتطبيق والاختبارات.
3. نفّذ فحوصات التطوير أدناه، ثم افتح طلب سحب يصف التغيير وطريقة التحقق منه.

</div>

## Development workflow

1. Fork this repository and create a branch from `main`.
2. In `desktop`, use Node.js 24 and run `npm ci`, `npm test` and `npm audit --audit-level=moderate`.
3. For navigation, permissions, privacy or preload changes, also run `npm run prepare:filters` and `npm run test:desktop` in a desktop session, or `xvfb-run -a npm run test:desktop` on Linux. Windows CI checks the installed application and MSIX fixture.
4. Keep remote content isolated. Add a meaningful regression fixture for a security boundary change; do not weaken checks or grant additional permissions merely to make a fixture work.
5. Open a pull request describing the behavior, validation and any limitations. Do not attach credentials or personal browsing data.

Contributions to the application source are under the MIT license. Third-party notices and filter-list licenses must be preserved. Store publisher identity and production signing credentials belong to the maintainer; contributors do not need them to run unit tests or build the CI Store fixture.

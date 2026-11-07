# دليل متصفح سَنَد الحرمين · Sanad Browser guide

[المستودع · Source](../README.md) · [الموقع الرسمي · Website](https://sanadbrowser.com/) · [Microsoft Store](https://apps.microsoft.com/detail/9NZB8PG7D7KP) · [نسخة الويب · Web companion](https://sanadbrowser.com/web/)

[الاستخدام · Get started](#get-started) · [التطوير · Develop](#develop) · [خريطة الملفات · Repository map](#repository-map) · [الخصوصية · Privacy](#privacy) · [المساعدة · Get help](#get-help)

## Get started

**بالعربية**

- على Windows، افتح [Microsoft Store](https://apps.microsoft.com/detail/9NZB8PG7D7KP) لتثبيت نسخة المتجر، أو انتقل إلى [صفحة التحميل الرسمية](https://ip-murad.com/browser/download/).
- استخدم [نسخة الويب](https://sanadbrowser.com/web/) للبحث من متصفحك على الجوال أو الكمبيوتر. ملفات تطبيق Windows واختباراته موجودة في هذا المستودع، وخدمات الموقع والحساب والبحث تُشغّل بصورة مستقلة.
- لمعرفة إصدار تطبيقك ومحرك Chromium، افتح صفحة «حول» داخل المتصفح. عند طلب المساعدة، أرفق هذه الإصدارات وإصدار نظام التشغيل.

**In English**

- Install the Windows Store build from [Microsoft Store](https://apps.microsoft.com/detail/9NZB8PG7D7KP) or visit the [official download page](https://ip-murad.com/browser/download/).
- Open the [web companion](https://sanadbrowser.com/web/) for browser-based search on a phone or desktop. The desktop source and tests live here. The hosted site, account and search services are separate.
- Check the About panel for the installed application and Chromium versions. Include them and your OS version when asking for help.

## Develop

استخدم Node.js 24 وnpm. تتطلب اختبارات واجهة Chromium جلسة سطح مكتب، ويمكن تشغيلها عبر Xvfb على Linux.

Use Node.js 24 and npm. Chromium UI tests require a desktop session or Xvfb on Linux.

```sh
git clone https://github.com/muradaljohani/Sanad-Browser.git
cd Sanad-Browser/desktop
npm ci
npm test
npm audit --audit-level=moderate
npm start
```

```sh
# Chromium UI tests on Linux
npm run prepare:filters
xvfb-run -a npm run test:desktop
```

On Windows, run `npm run test:desktop` after preparing the filters. For packaging and distribution requirements, see [Microsoft Store packaging](../desktop/STORE.md) and [publisher signing](../desktop/SIGNING.md). Development builds and CI packages serve testing. The Store handles signing and updates for its distribution channel.

## Repository map

| المسار · Path | الغرض · Purpose |
| --- | --- |
| [`desktop/main.cjs`](../desktop/main.cjs) | نوافذ المتصفح والتبويبات والجلسات · Browser windows, tabs and sessions |
| [`desktop/policy.cjs`](../desktop/policy.cjs) and [`desktop/security.cjs`](../desktop/security.cjs) | قواعد التنقل وحدود الأمان · Navigation rules and security boundaries |
| [`desktop/preload.cjs`](../desktop/preload.cjs) and [`desktop/ui/`](../desktop/ui/) | جسر الواجهة المحلية وواجهة المتصفح · Local shell bridge and browser UI |
| [`desktop/tests/`](../desktop/tests/) | اختبارات الوحدات وتفاعل Chromium · Unit and Chromium interaction tests |
| [`.github/workflows/`](../.github/workflows/) | بناء سطح المكتب وحزم المتجر وفحوصات الأمان · Desktop builds, Store packaging and security checks |

[Architecture](../desktop/ARCHITECTURE.md) · [Desktop notes](../desktop/README.md) · [Third-party notices](../desktop/THIRD_PARTY_NOTICES.md) · [MIT license](../LICENSE)

## Privacy

| الموضوع · Topic | ما الذي ينبغي معرفته · What to know |
| --- | --- |
| الجلسة الخاصة · Private session | تُفصل بيانات الجلسة عن التصفح العادي وتُمسح عند إغلاق آخر تبويب خاص. الملفات التي نزّلتها تبقى على الجهاز. Session data is isolated and cleared when the last private tab closes. Downloaded files remain on disk. |
| الفلترة · Filtering | فلترة اختيارية لقوائم التتبّع والإعلانات. تختلف النتيجة حسب الموقع والقواعد المتاحة. Optional tracker and ad filtering. Coverage depends on the site and available rules. |
| الحساب والمزامنة · Account and sync | يدعم حساب سَنَد الحرمين مزامنة فئات محددة. راجع [الفئات وحدود استيراد Chrome](../desktop/ACCOUNT_SYNC.md). Sanad account sync supports selected categories. See the [category and import limits](../desktop/ACCOUNT_SYNC.md). |
| الخزنة · Vault | تتطلب المزامنة الخاصة تفعيلًا صريحًا. الخادم يدير مفاتيح تشفير السجلات السحابية. Private vault sync is opt-in. Cloud record encryption uses service-managed keys. [تفاصيل الخزنة · Vault design](profile-vault-system.md). |
| الموقع والشبكة · Location and network | راجع [ضوابط الموقع وخيار SOCKS5](../desktop/LOCATION-PRIVACY-AR.md) ومتطلبات التحقق منهما. See the [location privacy guide](../desktop/LOCATION-PRIVACY-AR.md) for the SOCKS5 setup and its limits. |

[سياسة الخصوصية · Privacy policy](https://ip-murad.com/browser/privacy/) · [سياسة الأمان · Security policy](../SECURITY.md)

## Get help

| الطلب · Request | القناة · Where to go |
| --- | --- |
| مشكلة استخدام أو اقتراح · Bug or feature request | [اختر نموذج البلاغ · Choose an issue form](https://github.com/muradaljohani/Sanad-Browser/issues/new/choose) |
| المساهمة · Contribution | [دليل المساهمة · Contributing](../CONTRIBUTING.md) · [مجتمع التطوير · Contributor community](https://github.com/SanadBrowser) |
| ثغرة محتملة · Potential vulnerability | [الإبلاغ الخاص · Private reporting](../SECURITY.md#report-a-vulnerability-privately) |

For public reports, use a minimal example and remove passwords, cookies, tokens and personal browsing data from text, logs and screenshots. للبلاغات العامة، أرفق مثالًا مختصرًا وامسح كلمات المرور والرموز وبيانات التصفح الشخصية من المرفقات.

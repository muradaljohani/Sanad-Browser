# Store listing draft — owner review before submission

Reserved Partner Center name: **سَنَد الحرمين — Sanad Browser**. Store ID: `9NZB8PG7D7KP`. Reservation is complete; certification and publication are separate steps. Price: free. Devices: Windows PC, x64. Minimum Windows package version: 10.0.19041.0. Suggested category: Productivity / Web browsers, subject to the categories offered in Partner Center.

## Arabic

Short description: متصفح سَنَد الحرمين للويب، مع تبويبات مستقلة وأدوات للخصوصية والتنزيلات.

Description:

تصفح الإنترنت مع سَنَد الحرمين، متصفح للحاسوب يعتمد على Chromium عبر Electron. يحتاج تصفح المواقع والبحث وخدمات سَنَد إلى اتصال بالإنترنت.

- تبويبات مستقلة مع المفضلة والسجل والبحث داخل الصفحة.
- قوائم لحجب الإعلانات والمتتبعات مرفقة من أول تشغيل، مع تحكم في تفعيل الحماية وتحديثها.
- جلسة خاصة منفصلة عن ملفات الارتباط العادية، دون حفظ زياراتها في السجل المحلي.
- إدارة التنزيلات، ووضع القراءة، وحفظ الصفحات أو طباعتها إلى PDF.
- واجهة عربية، مع مظهر فاتح وداكن.
- تحديثات نسخة المتجر من خلال Microsoft Store.

قد لا تُحجب جميع الإعلانات، وقد تختلف النتائج بحسب الموقع. التصفح الخاص لا يخفي عنوان الإنترنت عن المواقع أو مزود الاتصال. بعض خدمات سَنَد المتصلة قد تتطلب حسابًا، وفق سياسة الخصوصية. لا يتضمن التطبيق Google Sync أو جميع إضافات Chrome أو خدمة Safe Browsing متكاملة.

## English

Short description: Sanad Al-Haramain web browser with tabs, privacy controls and download tools.

Description:

Browse the web with Sanad Al-Haramain, a desktop browser using Chromium through Electron. Web browsing, search and connected Sanad services require an internet connection.

- Independent tabs, bookmarks, local history and find in page.
- Bundled ad/tracker lists with controls to enable protection and update the lists.
- A private session separated from normal cookies, without persisting private visits in local history.
- Download management, reader view, page export and print to PDF.
- Arabic interface with light and dark appearance.
- Store installation updates managed by Microsoft Store.

Blocking may not remove every advertisement. Private browsing does not hide the network address from websites or the internet provider. Some connected Sanad services may require an account under their privacy policy. Google Sync, full Chrome extension compatibility and an integrated Safe Browsing service are not included.

## Certification notes draft

This is an Electron/Chromium desktop web browser for Windows PC. `runFullTrust` is required to launch its Win32 desktop process, create isolated Chromium renderer processes and provide standard user-directed file downloads, save dialogs, reading and printing. The package does not add a startup task, request elevation or broadFileSystemAccess, or change the system's default browser automatically. Internet access is necessary for browsing and the Sanad home/search service at https://ip-murad.com/browser. General browsing can be tested without importing an existing browser's credentials. Do not provide a user's real account as a reviewer demo.

Chromium/Electron versions must match the actual submitted package. Local bookmarks, history, preferences and normal website sessions persist on the device; private-session data is temporary. Website traffic, search queries and explicit site permissions remain subject to the respective website/service policies. Ad-filter updates use the fixed list-maintainer endpoints. Engine protection, code-signing verification and CI passes are not a guarantee of absence of vulnerabilities or universal ad blocking.

Privacy URL: https://ip-murad.com/browser/privacy/ (published and verified).
General Sanad privacy policy: https://ip-murad.com/privacy
Support: IM_MURAD7@hotmail.com (the existing public policy contact).

Store screenshots are actual, unaltered 1600×900 captures from the installed Windows MSIX UI in a disposable CI desktop. Review the `store-*.png` files in `windows-store-proof` before uploading. The CI-only test certificate is not Microsoft's Store signature and is never uploaded.

Complete Partner Center's age/content ratings for a general-purpose browser, supported markets and any account-related disclosures. No ratings have been prefilled or submitted. Review the existing brand images and rights with the owner before listing screenshots. Do not claim Microsoft endorsement or Store signing before certification is complete.

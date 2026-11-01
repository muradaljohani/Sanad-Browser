'use strict';
const api = window.sanadBrowser;
const $ = id => document.getElementById(id);
let state, panelName = '', panelBody, filterInput, lastActiveId, lastTabsKey = '', lastReaderText, lastReaderTitle, lastMenuKey = '', networkPortDraft;
const titles = { menu: 'أدوات المتصفح', tabs: 'التبويبات', bookmarks: 'المفضلة', history: 'السجل على هذا الجهاز', downloads: 'التنزيلات', privacy: 'حماية الخصوصية', reader: 'وضع القراءة', performance: 'أداء الصفحة', about: 'حول Sanad', licenses: 'التراخيص والمصادر المفتوحة' };
const normalize = value => String(value).normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g, '').toLowerCase();
const iconPaths = {
  back: ['M5 12h14', 'm13 6 6 6-6 6'], forward: ['M5 12h14', 'm11 6-6 6 6 6'],
  reload: ['M20 7v5h-5', 'M20 12a8 8 0 1 0-2.3 5.7'], home: ['m3 10 9-7 9 7', 'M5 9v12h5v-7h4v7h5V9'],
  shield: ['M12 3 4 6v6c0 4 3.5 7.5 8 9 4.5-1.5 8-5 8-9V6Z', 'm8 12 3 3 5-6'],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 17v4h16v-4'],
  user: ['M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21v-3a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v3'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'], plus: ['M12 5v14', 'M5 12h14'],
  search: ['M10 16a6 6 0 1 0 0-12 6 6 0 0 0 0 12', 'm15 15 6 6'],
  close: ['m6 6 12 12', 'M6 18 18 6'], lock: ['M7 10V7a5 5 0 0 1 10 0v3', 'M5 10h14v11H5Z'],
  star: ['m12 3 2.8 5.7 6.3 .9 -4.6 4.5 1.1 6.3 -5.6 -3 -5.6 3 1.1 -6.3 L3 9.6l6.2 -.9Z']
};
function setIcon(target, name, filled = false, keep) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '18', height: '18', fill: filled ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  for (const d of iconPaths[name]) { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); svg.append(path); }
  target.replaceChildren(svg); if (keep) target.append(keep);
}
function element(tag, className = '', text = '') { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; }
function button(label, handler, className = '') { const node = element('button', className, label); node.type = 'button'; node.addEventListener('click', handler); return node; }
function tool(symbol, label, handler, pressed) { const node = button(symbol, handler); node.title = label; node.setAttribute('aria-label', label); if (pressed !== undefined) node.setAttribute('aria-pressed', String(pressed)); return node; }
async function command(action, data = {}) {
  try { const next = await api.command(action, data); if (next) render(next); return next; }
  catch { $('notice').hidden = false; $('notice').textContent = 'تعذر تنفيذ الإجراء. جرّب مرة أخرى.'; }
}
async function go(url, newTab = false) { closePanel(); if (newTab) await command('new'); await command('navigate', { value: url }); }
function closePanel() { const wasReader = panelName === 'reader'; panelName = ''; $('panel').close(); void command('overlay', { value: false }); if (wasReader) void command('reader-clear'); }
function openPanel(name) {
  if (name === 'find') {
    closePanel(); $('find-bar').hidden = false; $('find-input').focus(); $('find-input').select(); return;
  }
  if (!titles[name]) return;
  if (name === 'privacy') networkPortDraft = String(state?.locationPrivacy?.port || 9050);
  panelName = name; lastReaderText = lastReaderTitle = undefined; lastMenuKey = ''; $('panel').classList.toggle('reader-panel', name === 'reader'); $('panel-title').textContent = titles[name]; $('panel-content').replaceChildren();
  filterInput = null;
  if (['tabs', 'bookmarks', 'history'].includes(name)) {
    filterInput = element('input', 'filter'); filterInput.type = 'search'; filterInput.placeholder = `ابحث في ${titles[name]}`;
    filterInput.setAttribute('aria-label', filterInput.placeholder); filterInput.addEventListener('input', renderPanel);
    $('panel-content').append(filterInput);
  }
  panelBody = element('div'); $('panel-content').append(panelBody); renderPanel();
  void command('overlay', { value: true }); if (!$('panel').open) $('panel').showModal(); filterInput?.focus();
  if (name === 'performance') void command('diagnostics');
  if (name === 'about') void command('updates-check', { automatic: true });
}
function hint(text) { return element('p', 'hint', text); }
function matches(item) { return !filterInput?.value || normalize(`${item.title || ''} ${item.url || ''}`).includes(normalize(filterInput.value)); }
function renderPanel() {
  if (!state || !panelName || !panelBody) return;
  // Loading/blocked-request updates must not detach a menu button between
  // pointer-down (or an accessibility Invoke request) and its click handler.
  if (panelName === 'menu') {
    const key = JSON.stringify([state.preferences.theme, state.activeId, state.tabs.find(tab => tab.id === state.activeId)?.zoom]);
    if (lastMenuKey === key && panelBody.childElementCount > 0) return;
    lastMenuKey = key;
  }
  if (panelName === 'reader' && state.reader?.text === lastReaderText && state.reader?.title === lastReaderTitle && panelBody.childElementCount > 0) return;
  if (panelName === 'privacy' && document.activeElement?.id === 'network-proxy-port') return;
  const fragment = document.createDocumentFragment();
  const append = node => fragment.append(node);
  if (panelName === 'menu') {
    const actions = element('div', 'actions');
    const items = [
      ['تبويب جديد', () => { closePanel(); void command('new'); }],
      ['تبويب خاص', () => { closePanel(); void command('new', { private: true }); }],
      ['المفضلة', () => openPanel('bookmarks')], ['السجل', () => openPanel('history')],
      ['التنزيلات', () => openPanel('downloads')], ['البحث في الصفحة', () => openPanel('find')],
      ['حماية الخصوصية', () => openPanel('privacy')],
      [state.preferences.theme === 'dark' ? 'المظهر النهاري' : 'المظهر الليلي', () => void command('theme')],
      ['إراحة التبويبات غير النشطة', () => { closePanel(); void command('suspend'); }],
      ['أدوات المطور', () => { closePanel(); void command('devtools'); }],
      ['أداء الصفحة', () => openPanel('performance')],
      ['وضع القراءة', () => { closePanel(); void command('reader'); }],
      ['حفظ الصفحة PDF', () => { closePanel(); void command('save-pdf'); }],
      ['حفظ صورة الصفحة', () => { closePanel(); void command('save-image'); }],
      ['حفظ نسخة دون اتصال', () => { closePanel(); void command('save-offline'); }],
      ['ملء الشاشة', () => { closePanel(); void command('fullscreen'); }],
      ['نسخ رابط دون معاملات التتبع', () => void command('copy-link')],
      ['حول Sanad', () => openPanel('about')], ['أنظمة سَنَد المستقبلية', () => void go('https://ip-murad.com/', true)]
    ];
    for (const [label, action] of items) actions.append(button(label, action));
    append(actions); append(hint('إراحة التبويبات تعيد تحميلها عند فتحها. احفظ ما تكتبه في الصفحات قبل استخدامها.'));
    const zoom = element('div', 'find-actions'); zoom.append(button('−', () => void command('zoom', { value: (state.tabs.find(tab => tab.id === state.activeId)?.zoom || 1) - .1 })), element('span', '', `حجم الصفحة ${Math.round((state.tabs.find(tab => tab.id === state.activeId)?.zoom || 1) * 100)}%`), button('+', () => void command('zoom', { value: (state.tabs.find(tab => tab.id === state.activeId)?.zoom || 1) + .1 }))); append(zoom);
  } else if (panelName === 'tabs') {
    const actions = element('div', 'actions'); actions.append(button('تبويب جديد', () => { closePanel(); void command('new'); }), button('استعادة آخر تبويب', () => void command('restore'))); actions.lastChild.disabled = !state.closedCount; append(actions);
    for (const tab of state.tabs.filter(matches)) {
      const row = element('div', 'row'); const link = button('', () => { closePanel(); void command('activate', { id: tab.id }); }, 'row-link');
      link.append(element('span', 'row-title', `${tab.private ? 'خاص · ' : ''}${tab.sleeping ? 'مريح · ' : ''}${tab.title}`), element('small', '', tab.url));
      if (tab.id === state.activeId) link.setAttribute('aria-current', 'page');
      const tools = element('div', 'row-tools'); tools.append(tool('⌖', `${tab.pinned ? 'إلغاء تثبيت' : 'تثبيت'} ${tab.title}`, () => void command('pin', { id: tab.id }), tab.pinned), tool(tab.muted ? '♪' : '♫', `${tab.muted ? 'تشغيل' : 'كتم'} صوت ${tab.title}`, () => void command('mute', { id: tab.id }), tab.muted), tool('×', `إغلاق ${tab.title}`, () => void command('close', { id: tab.id })));
      row.append(link, tools); append(row);
    }
    if (!state.tabs.some(matches)) append(hint('لا توجد تبويبات مطابقة.'));
  } else if (panelName === 'bookmarks' || panelName === 'history') {
    const bookmarks = panelName === 'bookmarks'; const entries = bookmarks ? state.bookmarks : state.history;
    const actions = element('div', 'actions');
    if (bookmarks) actions.append(button('استيراد ملف JSON', () => void command('bookmark-import')), button('تصدير المفضلة', () => void command('bookmark-export')));
    else { const clear = button('مسح السجل', () => void command('history-clear')); clear.disabled = !entries.length; actions.append(clear); }
    append(actions);
    for (const item of entries.filter(matches)) {
      const row = element('div', 'row'); const link = button('', () => void go(item.url), 'row-link');
      link.append(element('span', 'row-title', item.title), element('small', '', item.url));
      row.append(link); if (bookmarks) row.append(tool('×', `حذف ${item.title}`, () => void command('bookmark-remove', { url: item.url }))); append(row);
    }
    if (!entries.some(matches)) append(hint(bookmarks ? 'احفظ صفحاتك من النجمة بجوار العنوان.' : 'سيظهر هنا سجل زياراتك الفعلية. التبويبات الخاصة لا تُسجّل.'));
    if (bookmarks) append(hint('المفضلة محفوظة على هذا الجهاز. استيرادها يضيف الروابط ويزيل التكرار.'));
  } else if (panelName === 'downloads') {
    const labels = { progressing: 'جارٍ التنزيل', paused: 'متوقف مؤقتًا', completed: 'اكتمل', cancelled: 'أُلغي', interrupted: 'انقطع' };
    for (const item of [...state.downloads].reverse()) {
      const row = element('div', 'download'); row.append(element('strong', 'download-title', `${item.private ? 'خاص · ' : ''}${item.name}`), element('small', '', `${labels[item.status] || item.status} · ${(item.received / 1048576).toFixed(1)} MB${item.total > 0 ? ` / ${(item.total / 1048576).toFixed(1)} MB` : ''}`));
      const progress = element('progress'); progress.max = item.total || 1; if (item.total > 0) progress.value = item.received; progress.setAttribute('aria-label', `تقدم تنزيل ${item.name}`); row.append(progress);
      const actions = element('div', 'download-actions');
      if (item.status === 'progressing') actions.append(button('إيقاف مؤقت', () => void command('download-pause', { id: item.id })));
      if (['paused', 'interrupted'].includes(item.status)) actions.append(button('استئناف', () => void command('download-resume', { id: item.id })));
      if (['progressing', 'paused', 'interrupted'].includes(item.status)) actions.append(button('إلغاء', () => void command('download-cancel', { id: item.id })));
      if (item.status === 'completed') actions.append(button('إظهار في المجلد', () => void command('download-reveal', { id: item.id })));
      row.append(actions); append(row);
    }
    if (!state.downloads.length) append(hint('لا توجد تنزيلات في هذه الجلسة.'));
    append(hint('تبقى الملفات التي تنزّلها في جهازك بعد إغلاق التبويب الخاص.'));
  } else if (panelName === 'privacy') {
    const routing = state.locationPrivacy;
    append(element('h2', '', 'حماية الموقع والاتصال'));
    append(hint('مشاركة إحداثيات موقعك محظورة في جميع التبويبات. تُقيّد اتصالات WebRTC لتقليل تسرّب عنوان الشبكة.'));
    const routeStatus = hint(routing?.enabled ? `وسيط محلي مضبوط: 127.0.0.1:${routing.port}. لم يُتحقق من عنوان الخروج أو هوية الوسيط.` : 'لا يوفر سَنَد إخفاء عنوان IP في الوضع العادي؛ قد تستنتج المواقع منه موقعًا تقريبيًا.');
    routeStatus.setAttribute('role', 'status'); append(routeStatus);
    append(hint('وضع الوسيط يحتاج إلى خدمة SOCKS5 موثوقة تعمل على جهازك، ولا يتضمن VPN أو Tor مدمجًا. SOCKS5 وحده لا يضمن التشفير أو إخفاء IP؛ تعتمد الحماية على الخدمة التي تشغّلها.'));
    const portLabel = element('label', '', 'منفذ وسيط SOCKS5 المحلي'); portLabel.htmlFor = 'network-proxy-port'; append(portLabel);
    const port = element('input', 'filter'); port.id = 'network-proxy-port'; port.type = 'text'; port.inputMode = 'numeric'; port.maxLength = 5; port.value = networkPortDraft || String(routing?.port || 9050); port.setAttribute('aria-label', 'منفذ وسيط SOCKS5 المحلي');
    port.addEventListener('input', () => { networkPortDraft = port.value; }); append(port);
    append(button(routing?.enabled ? 'تطبيق منفذ الوسيط وإعادة التشغيل' : 'استخدام الوسيط وإعادة التشغيل', () => {
      const value = networkPortDraft || '';
      if (!/^\d{4,5}$/.test(value) || Number(value) < 1024 || Number(value) > 65535) { $('notice').hidden = false; $('notice').textContent = 'اكتب منفذًا بين 1024 و65535.'; return; }
      void command('network-privacy', { enabled: true, port: Number(value) });
    }));
    if (routing?.enabled) append(button('إيقاف وضع الوسيط وإعادة التشغيل', () => void command('network-privacy', { enabled: false, port: routing.port })));
    append(hint('في وضع الوسيط لا تستخدم طلبات الويب مسارًا مباشرًا بديلاً، وتبدأ جلسة دون ملفات دخول سابقة أو حفظ سجل الزيارات. لا يضمن هذا إخفاء الهوية؛ تسجيل الدخول يكشف حسابك للموقع، والحماية لا تشمل التطبيقات الأخرى أو الملفات بعد فتحها.'));
    const label = element('label', 'toggle'); const checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.checked = state.preferences.protection; checkbox.addEventListener('change', () => void command('protection', { value: checkbox.checked })); label.append(checkbox, element('span', '', 'حجب متتبعات وإعلانات من القوائم')); append(label);
    append(hint(state.protectionSource === 'standard' ? 'القوائم المحدثة محفوظة محليًا وتعمل دون إعادة تنزيلها مع كل زيارة.' : state.protectionSource === 'bundled' ? 'قوائم حظر كاملة مرفقة مع التطبيق وتعمل من أول تشغيل، حتى دون تحديث.' : 'تعذر تحميل القوائم الكاملة. قواعد الحماية الأساسية مستمرة؛ جرّب تحديث القوائم.'));
    append(hint('تشمل الحماية إخفاء المساحات الإعلانية ومحاولة تخطي إعلانات مشغّل يوتيوب عند تمييزها. لا يمكن ضمان حجب كل إعلان دائمًا؛ قد يغيّر الموقع طريقة عرضه.'));
    const update = button(state.updatingProtection ? 'جارٍ تحديث القوائم…' : 'تحديث قوائم الحماية', () => void command('protection-update')); update.disabled = state.updatingProtection; append(update);
    append(hint(`حُجبت ${state.tabs.find(tab => tab.id === state.activeId)?.blocked || 0} طلبات في هذا التبويب منذ فتحه.`));
    append(hint('إذا توقف موقع عن العمل، يمكنك تعطيل الحجب ثم إعادة تحميله. التبويب الخاص يستخدم جلسة منفصلة تُمسح عند إغلاق آخر تبويب خاص؛ وحده لا يُخفي اتصالك عن الموقع أو مزود الشبكة.'));
  } else if (panelName === 'reader') {
    const reader = state.reader;
    lastReaderText = reader?.text; lastReaderTitle = reader?.title;
    if (reader) {
      const article = element('article', 'reader-article'); article.dir = reader.dir;
      article.append(element('h2', '', reader.title));
      // Plain text only: Readability HTML never enters the privileged document.
      const text = element('div', 'reader-text', reader.text); article.append(text); append(article);
      append(hint('استخراج محلي للمقال باستخدام Mozilla Readability. أغلق اللوحة للعودة إلى الصفحة الأصلية.'));
    } else append(hint('جارٍ تجهيز المقال…'));
  } else if (panelName === 'performance') {
    const metrics = state.tabs.find(tab => tab.id === state.activeId)?.diagnostics;
    const rows = element('div', 'details');
    const time = value => typeof value === 'number' ? `${Math.round(value)} ms` : 'غير متاح';
    if (metrics) {
      for (const [label, value] of [['استجابة الطلب', time(metrics.response)], ['جاهزية المستند', time(metrics.dom)], ['اكتمال التحميل', time(metrics.load)], ['ظهور أول محتوى', time(metrics.paint)], ['موارد مسجّلة', metrics.resources ?? 'غير متاح'], ['ذاكرة عملية العرض', metrics.memory === null ? 'غير متاح' : `${(metrics.memory / 1024).toFixed(1)} MB`], ['تركيب الرسوم', metrics.gpu]]) rows.append(element('span', '', label), element('strong', '', String(value)));
      append(rows); append(hint(`آخر قياس: ${new Date(metrics.measuredAt).toLocaleTimeString('ar-SA')}`));
    } else append(hint('جارٍ قراءة قياسات الصفحة…'));
    append(button('تحديث القياسات', () => void command('diagnostics')));
    append(hint('قيم فعلية من واجهة توقيت الصفحة ونظام التشغيل. الذاكرة تخص عملية العرض وقد تشترك فيها صفحات. الموارد هي ما تسجّله الصفحة، وليست إجمالي حركة الشبكة. لا تُرسل القياسات خارج جهازك.'));
    append(button('فتح أدوات المطور للتفاصيل', () => { closePanel(); void command('devtools'); }));
  } else if (panelName === 'about') {
    const logo = element('img', 'about-logo'); logo.src = 'wordmark.svg'; logo.alt = 'Sanad'; append(logo);
    append(element('p', 'about-version', `الإصدار ${state.versions.app} · ${state.versions.distribution === 'microsoft-store' ? 'Microsoft Store' : 'نسخة تجريبية'}`));
    const details = element('div', 'details');
    for (const [label, value] of [['النظام', `${state.versions.platform === 'win32' ? 'Windows' : state.versions.platform} · ${state.versions.arch}`], ['Chromium', state.versions.chromium], ['Electron', state.versions.electron]]) details.append(element('span', '', label), element('strong', '', value)); append(details);
    const protectionText = { encrypted: 'السجل والمفضلة والإعدادات مشفّرة على هذا الجهاز، والمفتاح محمي بخزنة النظام.', unavailable: 'خزنة تشفير آمنة غير متاحة في بيئة النظام الحالية. البيانات المحلية غير مشفّرة.', locked: 'تعذّر فتح البيانات المحمية. الملف الأصلي محفوظ، والتغييرات الحالية لن تُحفظ فوقه.', error: 'تعذّر حفظ آخر تغيير. بقيت النسخة المحفوظة السابقة دون استبدال.' };
    const storage = element('p', 'hint', protectionText[state.storageProtection?.status] || protectionText.unavailable); storage.setAttribute('aria-label', 'حالة تشفير البيانات المحلية'); append(storage);
    const update = state.updates || { status: 'idle' };
    const statusText = { 'store-managed': 'تُدار التحديثات بواسطة Microsoft Store', idle: 'تحقق من توفر إصدار جديد', checking: 'جارٍ التحقق من الإصدارات…', current: 'أنت تستخدم أحدث إصدار منشور', available: `إصدار جديد متاح: ${update.latestVersion}`, ahead: 'نسختك أحدث من الإصدار المنشور', error: 'تعذر التحقق. تحقق من الاتصال وأعد المحاولة.' };
    const card = element('section', 'update-card'); card.setAttribute('aria-label', 'تحديثات المتصفح');
    const status = element('p', 'update-status', statusText[update.status] || statusText.idle); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); card.append(status);
    if (update.checkedAt) card.append(hint(`آخر فحص ناجح: ${new Date(update.checkedAt).toLocaleString('ar-SA')}`));
    const checks = element('div', 'actions');
    const check = button(update.installation === 'microsoft-store' ? 'فتح تحديثات Microsoft Store' : 'التحقق من التحديثات', () => void command(update.installation === 'microsoft-store' ? 'updates-open' : 'updates-check')); check.disabled = update.status === 'checking'; checks.append(check);
    if (update.releaseUrl) checks.append(button(update.status === 'available' ? 'فتح الإصدار الجديد' : 'تفاصيل الإصدار', () => { closePanel(); void command('updates-open'); }));
    card.append(checks);
    if (update.status === 'available' && update.notes?.length) { const notes = element('ul', 'release-notes'); for (const note of update.notes) notes.append(element('li', '', note)); card.append(notes); }
    card.append(hint(update.installation === 'microsoft-store' ? 'يتولى Microsoft Store تثبيت تحديثات هذه النسخة وفق إعدادات المتجر.' : 'تُنزّل الإصدارات التجريبية وتُثبّت يدويًا. لا ينزّل المتصفح ملف التثبيت أو يشغّله تلقائيًا.')); append(card);
    const aboutActions = element('div', 'actions'); aboutActions.append(button('نسخ تفاصيل الإصدار', () => void command('about-copy')), button('عرض التراخيص', () => openPanel('licenses')), button('سياسة الخصوصية', () => { closePanel(); void go('https://ip-murad.com/browser/privacy/', true); })); append(aboutActions);
    append(hint('متصفح مكتبي بمحرك Chromium عبر Electron، ويستخدم Blink لعرض الصفحات وV8 لجافا سكريبت. صفحة بحث سَنَد وأنظمته المستقبلية متصلة بالمشروع الأصلي. حساب سَنَد يبقى مسجّلًا في الجلسة العادية بعد تسجيل الدخول مرة على هذا الجهاز.'));
    const sources = element('div', 'actions');
    for (const [label, url] of [['مصدر Sanad', 'https://github.com/muradaljohani/Browser/tree/main/desktop'], ['دليل Chromium', 'https://www.chromium.org/developers/'], ['Electron والأمان', 'https://www.electronjs.org/docs/latest/tutorial/security'], ['Ghostery · MPL 2.0', 'https://github.com/ghostery/adblocker'], ['Ungoogled Chromium', 'https://github.com/ungoogled-software/ungoogled-chromium'], ['Brave Core', 'https://github.com/brave/brave-core']]) sources.append(button(label, () => void go(url, true)));
    append(sources); append(hint('استُخدم Brave وUngoogled Chromium كمراجع معمارية. لا تتضمن هذه النسخة خدمات Google Sync أو مدير كلمات مرور أو دعم جميع إضافات Chrome. تراخيص Chromium موجودة مع التطبيق في LICENSES.chromium.html.'));
  } else if (panelName === 'licenses') {
    const actions = element('div', 'actions'); actions.append(button('تراخيص Chromium المرفقة', () => { closePanel(); void command('chromium-licenses'); }), button('العودة إلى حول Sanad', () => openPanel('about'))); append(actions);
    const notices = element('pre', 'license-text', state.licenceNotices || 'تعذر قراءة التراخيص.'); notices.dir = 'ltr'; append(notices);
  }
  const focused = panelBody.contains(document.activeElement) ? document.activeElement : null;
  const focusLabel = focused?.getAttribute('aria-label') || focused?.textContent;
  panelBody.replaceChildren(fragment);
  if (focusLabel) [...panelBody.querySelectorAll('button')].find(node => (node.getAttribute('aria-label') || node.textContent) === focusLabel)?.focus();
}
function render(next) {
  state = next; const tab = state.tabs.find(item => item.id === state.activeId); if (!tab) return;
  document.documentElement.dataset.theme = state.preferences.theme;
  if (lastActiveId !== state.activeId || document.activeElement !== $('address')) $('address').value = tab.url === 'https://ip-murad.com/browser?surface=desktop' ? '' : tab.url;
  if (lastActiveId !== state.activeId) { $('find-bar').hidden = true; $('find-input').value = ''; $('find-count').textContent = ''; if ($('panel').open) { panelName = ''; $('panel').close(); } }
  lastActiveId = state.activeId;
  $('back').disabled = !tab.back; $('forward').disabled = !tab.forward; setIcon($('reload'), tab.loading ? 'close' : 'reload'); $('reload').setAttribute('aria-label', tab.loading ? 'إيقاف التحميل' : 'إعادة تحميل');
  const marked = state.bookmarks.some(item => item.url === tab.url); setIcon($('bookmark'), 'star', marked); $('bookmark').setAttribute('aria-pressed', String(marked));
  $('protection').setAttribute('aria-pressed', String(state.preferences.protection)); $('blocked-count').textContent = tab.blocked > 0 ? String(tab.blocked) : '';
  $('network-status').hidden = !state.locationPrivacy?.enabled;
  $('network-status').textContent = state.locationPrivacy?.enabled ? 'وسيط محلي مضبوط · لم يُتحقّق من عنوان الخروج' : '';
  const localDocument = tab.url.startsWith('sanad-licenses://');
  if (tab.private) $('connection').textContent = 'خاص'; else if (localDocument) $('connection').textContent = 'محلي'; else setIcon($('connection'), 'lock'); $('connection').setAttribute('aria-label', tab.private ? 'تبويب خاص' : localDocument ? 'مستند محلي' : 'اتصال مشفر');
  $('notice').textContent = state.notice; $('notice').hidden = !state.notice; $('page-error').textContent = tab.error; $('page-error').hidden = !tab.error;
  const tabsKey = JSON.stringify([state.activeId, state.tabs.map(item => [item.id, item.title, item.private, item.pinned, item.muted, item.sleeping])]);
  if (tabsKey !== lastTabsKey) {
  const fragment = document.createDocumentFragment();
  for (const item of state.tabs) {
    const node = element('div', `tab${item.id === state.activeId ? ' active' : ''}${item.pinned ? ' pinned' : ''}`);
    const select = button('', () => void command('activate', { id: item.id })); select.setAttribute('role', 'tab'); select.setAttribute('aria-selected', String(item.id === state.activeId)); select.title = item.title;
    if (item.private || item.sleeping || item.pinned || item.muted) select.append(element('small', 'tab-status', `${item.private ? '◈' : ''}${item.sleeping ? '◌' : ''}${item.pinned ? '⌖' : ''}${item.muted ? '♪' : ''}`));
    select.append(element('span', '', item.title)); node.append(select, tool('×', `إغلاق ${item.title}`, () => void command('close', { id: item.id }))); fragment.append(node);
  }
  $('tabs').replaceChildren(fragment); lastTabsKey = tabsKey;
  }
  $('new-tab').disabled = state.tabs.length >= 32;
  if (state.found) $('find-count').textContent = `${state.found.current}/${state.found.total}`;
  renderPanel();
}
$('address-form').addEventListener('submit', event => { event.preventDefault(); void command('navigate', { value: $('address').value }); });
for (const [id, action] of [['back', 'back'], ['forward', 'forward'], ['home', 'home'], ['bookmark', 'bookmark'], ['account', 'account']]) $(id).addEventListener('click', () => void command(action));
$('reload').addEventListener('click', () => void command(state?.tabs.find(tab => tab.id === state.activeId)?.loading ? 'stop' : 'reload'));
$('new-tab').addEventListener('click', () => void command('new')); $('tab-search').addEventListener('click', () => openPanel('tabs'));
$('protection').addEventListener('click', () => openPanel('privacy')); $('downloads-button').addEventListener('click', () => openPanel('downloads')); $('menu-button').addEventListener('click', () => openPanel('menu'));
$('close-panel').addEventListener('click', closePanel); $('panel').addEventListener('cancel', closePanel); $('panel').addEventListener('click', event => { if (event.target === $('panel')) closePanel(); });
$('find-input').addEventListener('input', () => void command('find', { value: $('find-input').value }));
for (const [id, forward] of [['find-prev', false], ['find-next', true]]) $(id).addEventListener('click', () => void command('find', { value: $('find-input').value, forward, next: true }));
function closeFind() { $('find-bar').hidden = true; $('find-count').textContent = ''; void command('find-stop'); }
$('find-close').addEventListener('click', closeFind);
for (const [id, name] of [['back', 'back'], ['forward', 'forward'], ['home', 'home'], ['downloads-button', 'download'], ['account', 'user'], ['menu-button', 'menu'], ['new-tab', 'plus'], ['tab-search', 'search']]) setIcon($(id), name);
setIcon($('protection'), 'shield', false, $('blocked-count'));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('find-bar').hidden) { event.preventDefault(); closeFind(); } });
let lastHeight = 0, resizeFrame = 0;
new ResizeObserver(entries => { const height = Math.ceil(entries[0].borderBoxSize?.[0]?.blockSize || $('chrome').getBoundingClientRect().height); if (height === lastHeight) return; lastHeight = height; cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => void command('toolbar-height', { value: height })); }).observe($('chrome'));
api.onState(render); api.onFocusAddress(() => { closePanel(); $('address').focus(); $('address').select(); }); api.onOpenPanel(openPanel);
void command('state');


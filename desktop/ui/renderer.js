'use strict';
const api = window.sanadBrowser;
const $ = id => document.getElementById(id);
let state, panelName = '', panelBody, filterInput, lastActiveId, lastReaderText, lastReaderTitle, lastPrivacyKey = '', networkPortDraft, menuController, settingsController, accountController, lastSettingsKey = '', panelRequest = 0;
const titles = { menu: 'سَنَد الحرمين', sync:'حسابك والمزامنة والاستيراد', settings: 'إعدادات المتصفح', tabs: 'التبويبات', bookmarks: 'المفضلة', history: 'السجل على هذا الجهاز', downloads: 'التنزيلات', privacy: 'حماية الخصوصية', 'search-policy': 'إجراء البحث الصارم', reader: 'وضع القراءة', performance: 'أداء الصفحة', about: 'حول Sanad', licenses: 'التراخيص والمصادر المفتوحة' };
const normalize = value => String(value).normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g, '').toLowerCase();
const iconPaths = {
  back: ['M5 12h14', 'm13 6 6 6-6 6'], forward: ['M5 12h14', 'm11 6-6 6 6 6'],
  reload: ['M20 7v5h-5', 'M20 12a8 8 0 1 0-2.3 5.7'], home: ['m3 10 9-7 9 7', 'M5 9v12h5v-7h4v7h5V9'],
  shield: ['M12 3 4 6v6c0 4 3.5 7.5 8 9 4.5-1.5 8-5 8-9V6Z', 'm8 12 3 3 5-6'],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 17v4h16v-4'],
  user: ['M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21v-3a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v3'],
  menu: ['M12 4v.01', 'M12 12v.01', 'M12 20v.01'], plus: ['M12 5v14', 'M5 12h14'],
  tab: ['M4 5h16v15H4Z', 'M4 9h16', 'M12 12v5', 'M9.5 14.5h5'], tabs: ['M7 3h14v15H7Z', 'M3 7v14h14'],
  private: ['M4 11h16', 'm7 11 2-7h6l2 7', 'M5 16a3 3 0 1 0 6 0 3 3 0 0 0-6 0', 'M13 16a3 3 0 1 0 6 0 3 3 0 0 0-6 0', 'M11 16h2'],
  restore: ['M4 4v6h6', 'M4 10a8 8 0 1 1 1 8'], history: ['M3 11a9 9 0 1 1 2 7', 'M3 4v7h7', 'M12 7v5l3 2'], chevron: ['m14 7-5 5 5 5'],
  fullscreen: ['M8 3H3v5', 'M16 3h5v5', 'M21 16v5h-5', 'M8 21H3v-5'],
  print: ['M6 8V3h12v5', 'M6 17H3V9h18v8h-3', 'M6 14h12v7H6Z'], reader: ['M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3Z', 'M12 6v16'],
  save: ['M4 3h13l4 4v14H3V3Z', 'M7 3v7h10V3', 'M7 21v-7h10v7'], file: ['M5 3h9l5 5v13H5Z', 'M14 3v6h5', 'M8 13h8', 'M8 17h6'],
  image: ['M3 3h18v18H3Z', 'm3 17 6-6 4 4 3-3 5 5', 'M16 7h.01'], copy: ['M8 8h13v13H8Z', 'M16 4V2H2v14h2'],
  tools: ['M14 6a6 6 0 0 0-8 8L2 18l4 4 4-4a6 6 0 0 0 8-8l-4 4-4-4Z'], performance: ['M3 20V10', 'M9 20V4', 'M15 20v-7', 'M21 20V8'],
  sleep: ['M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11'], code: ['m8 6-6 6 6 6', 'm16 6 6 6-6 6', 'm14 3-4 18'], theme: ['M12 3a9 9 0 1 0 0 18Z'], info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'M12 11v6', 'M12 7h.01'],
  settings: ['M4 7h16', 'M4 17h16', 'M8 4v6', 'M16 14v6'],
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
const tabStrip = window.SanadTabStrip({ root: $('tabs'), previous: $('tabs-prev'), next: $('tabs-next'), count: $('tab-count'), announcement: $('tab-announcement'), command });
const omnibox = window.SanadOmnibox({ input: $('address'), form: $('address-form'), list: $('address-suggestions'), setIcon, query: value => api.command('omnibox-suggest', { value }), navigate: value => void command('navigate', { value }), preconnect: url => void api.command('preconnect', { url }).catch(() => {}), showOverlay: () => {
  if (panelName) return;
  const request = ++panelRequest;
  void command('overlay', { value: true }).then(next => { if (request === panelRequest && !panelName && next?.pagePreview && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(next.pagePreview) && next.pagePreview.length < 2100000) { $('page-preview').src = next.pagePreview; $('page-preview').hidden = false; } });
}, hideOverlay: () => { if (!panelName) { panelRequest++; clearPreview(); void command('overlay', { value: false }); } } });
async function go(url, newTab = false) { closePanel(); if (newTab) await command('new'); await command('navigate', { value: url }); }
function clearPreview() { $('page-preview').hidden = true; $('page-preview').removeAttribute('src'); }
function disposeSettings() { accountController?.dispose?.();accountController=null; settingsController?.unmount(); settingsController = null; lastSettingsKey = ''; }
function closePanel() { const wasReader = panelName === 'reader'; omnibox.close(); disposeSettings(); panelName = ''; panelRequest++; clearPreview(); $('panel').close(); $('menu-button').setAttribute('aria-expanded', 'false'); void command('overlay', { value: false }); if (wasReader) void command('reader-clear'); }
function openPanel(name) {
  if (name === 'find') {
    closePanel(); $('find-bar').hidden = false; $('find-input').focus(); $('find-input').select(); return;
  }
  if (!titles[name]) return;
  omnibox.close();
  disposeSettings();
  if (name === 'privacy') { networkPortDraft = String(state?.locationPrivacy?.port || 9050); lastPrivacyKey = ''; }
  panelName = name; const request = ++panelRequest; lastReaderText = lastReaderTitle = undefined; $('panel').classList.toggle('profile-panel',name==='sync'); $('panel').classList.toggle('reader-panel', name === 'reader'); $('panel').classList.toggle('settings-panel', name === 'settings'); $('panel').classList.toggle('browser-menu', name === 'menu'); $('menu-button').setAttribute('aria-expanded', String(name === 'menu')); $('panel-title').textContent = titles[name]; $('panel-content').replaceChildren();
  filterInput = null;
  if (['tabs', 'bookmarks', 'history'].includes(name)) {
    filterInput = element('input', 'filter'); filterInput.type = 'search'; filterInput.placeholder = `ابحث في ${titles[name]}`;
    filterInput.setAttribute('aria-label', filterInput.placeholder); filterInput.addEventListener('input', renderPanel);
    $('panel-content').append(filterInput);
  }
  panelBody = element('div'); $('panel-content').append(panelBody);
  if (name === 'sync') accountController = window.SanadAccountPanel({root:panelBody,command,element,button,vaultAPI:api.vault});
  if (name === 'menu') menuController = window.SanadBrowserMenu({ root: panelBody, command, openPanel, closePanel, element, button, setIcon });
  renderPanel();
  void command('overlay', { value: true }).then(next => {
    if (request !== panelRequest || panelName !== name || !next?.pagePreview) return;
    if (/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(next.pagePreview) && next.pagePreview.length < 2100000) { $('page-preview').src = next.pagePreview; $('page-preview').hidden = false; }
  });
  if (!$('panel').open) $('panel').showModal();
  $('panel').scrollTop = 0;
  if (name === 'menu') panelBody.querySelector('button:not(:disabled)')?.focus(); else filterInput?.focus();
  if (name === 'performance') void command('diagnostics');
  if (name === 'about') void command('updates-check', { automatic: true });
}
function hint(text) { return element('p', 'hint', text); }
function matches(item) { return !filterInput?.value || normalize(`${item.title || ''} ${item.url || ''}`).includes(normalize(filterInput.value)); }
function renderPanel() {
  if (!state || !panelName || !panelBody) return;
  if (panelName === 'menu') {
    menuController?.update(state); return;
  }
  if (panelName === 'sync') {accountController?.update(state);return;}
  if (panelName === 'settings') {
    const value = { ...state.preferences.search, theme: state.preferences.theme };
    const key = JSON.stringify([value, state.history.length]);
    if (lastSettingsKey === key && settingsController) return;
    lastSettingsKey = key;
    const props = { value, historyCount: state.history.length, onChange: next => void command('search-preferences', { value: next }), onClearHistory: () => void command('history-clear'), onClearCache: () => void command('search-cache-clear'), onFullscreen: () => { closePanel(); void command('fullscreen'); }, onOpenAppPrivacy: () => openPanel('privacy'), onOpenSync: () => openPanel('sync') };
    if (settingsController) settingsController.update(props); else settingsController = window.SanadSettings.mount(panelBody, props);
    return;
  }
  if (panelName === 'reader' && state.reader?.text === lastReaderText && state.reader?.title === lastReaderTitle && panelBody.childElementCount > 0) return;
  if (panelName === 'privacy' && document.activeElement?.id === 'network-proxy-port') return;
  if (panelName === 'privacy') {
    const key = JSON.stringify([state.preferences.protection, state.locationPrivacy, state.protectionSource, state.protectionRevision, state.updatingProtection]);
    if (lastPrivacyKey === key && panelBody.childElementCount > 0) {
      const counter = $('privacy-blocked-count');
      if (counter) counter.textContent = `حُجبت ${state.tabs.find(tab => tab.id === state.activeId)?.blocked || 0} طلبات في هذا التبويب منذ فتحه.`;
      return;
    }
    lastPrivacyKey = key;
  }
  const fragment = document.createDocumentFragment();
  const append = node => fragment.append(node);
  if (panelName === 'search-policy') {
    const status = element('div', 'strict-policy-heading'); const icon = element('span'); setIcon(icon, 'lock'); status.append(icon, element('strong', '', 'البحث الصارم مفعّل ومقفل')); append(status);
    append(hint('الإجراء المطبّق في بحث سَنَد الحرمين:'));
    const steps = element('ol', 'strict-policy-steps');
    for (const text of ['يُطبّق مستوى التصفية الصارم تلقائيًا على كل بحث، بما فيه الصور والفيديو والتبويبات الخاصة.', 'تُصفّى النتائج الصريحة وفق سياسة البحث ومزوّد النتائج، وتُرفض الاستجابة التي تعلن مستوى تصفية أضعف.', 'يبقى البحث الصارم مفعّلًا عند تغيير الإعدادات أو استعادتها، ولا يوجد خيار لإيقافه.']) steps.append(element('li', '', text)); append(steps);
    append(hint('ينطبق هذا الإجراء على نتائج بحث سَنَد الحرمين. قد تفوت المرشّحات بعض النتائج، ولا تتحكم هذه السياسة بمحتوى المواقع الخارجية التي تفتحها مباشرة.'));
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
    const counter = hint(`حُجبت ${state.tabs.find(tab => tab.id === state.activeId)?.blocked || 0} طلبات في هذا التبويب منذ فتحه.`); counter.id = 'privacy-blocked-count'; append(counter);
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
  if (lastActiveId !== state.activeId) omnibox.close();
  if (lastActiveId !== state.activeId || document.activeElement !== $('address')) { let home = false; try { const url = new URL(tab.url); home = url.origin === 'https://sanadbrowser.com' && /^\/web\/?$/.test(url.pathname) && !url.searchParams.has('q') && !url.searchParams.has('url'); } catch {} $('address').value = home ? '' : tab.url; }
  if (lastActiveId !== state.activeId) { $('find-bar').hidden = true; $('find-input').value = ''; $('find-count').textContent = ''; if ($('panel').open) { disposeSettings(); panelName = ''; panelRequest++; clearPreview(); $('panel').close(); $('menu-button').setAttribute('aria-expanded', 'false'); } }
  lastActiveId = state.activeId;
  $('back').disabled = !tab.back; $('forward').disabled = !tab.forward; setIcon($('reload'), tab.loading ? 'close' : 'reload'); $('reload').setAttribute('aria-label', tab.loading ? 'إيقاف التحميل' : 'إعادة تحميل');
  const marked = state.bookmarks.some(item => item.url === tab.url); setIcon($('bookmark'), 'star', marked); $('bookmark').setAttribute('aria-pressed', String(marked));
  $('protection').setAttribute('aria-pressed', String(state.preferences.protection)); $('blocked-count').textContent = tab.blocked > 0 ? String(tab.blocked) : '';
  $('network-status').hidden = !state.locationPrivacy?.enabled;
  $('network-status').textContent = state.locationPrivacy?.enabled ? 'وسيط محلي مضبوط · لم يُتحقّق من عنوان الخروج' : '';
  const localDocument = tab.url.startsWith('sanad-licenses://');
  if (tab.private) $('connection').textContent = 'خاص'; else if (localDocument) $('connection').textContent = 'محلي'; else setIcon($('connection'), 'lock'); $('connection').setAttribute('aria-label', tab.private ? 'تبويب خاص' : localDocument ? 'مستند محلي' : 'اتصال مشفر');
  $('account').setAttribute('aria-label',state.sync?.signedIn?'حساب Google والمزامنة':'تسجيل الدخول والمزامنة عبر Google');
  $('account').title=state.sync?.identity?.email||'حسابك والمزامنة';
  $('notice').textContent = state.notice; $('notice').hidden = !state.notice; $('page-error').textContent = tab.error; $('page-error').hidden = !tab.error;
  tabStrip.update(state);
  omnibox.update(state);
  $('new-tab').disabled = state.tabs.length >= 32;
  if (state.found) $('find-count').textContent = `${state.found.current}/${state.found.total}`;
  renderPanel();
}
for (const [id, action] of [['back', 'back'], ['forward', 'forward'], ['home', 'home'], ['bookmark', 'bookmark'], ['account', 'account']]) $(id).addEventListener('click', () => void command(action));
$('reload').addEventListener('click', () => void command(state?.tabs.find(tab => tab.id === state.activeId)?.loading ? 'stop' : 'reload'));
$('new-tab').addEventListener('click', () => void command('new')); $('tab-search').addEventListener('click', () => openPanel('tabs'));
$('protection').addEventListener('click', () => openPanel('privacy')); $('downloads-button').addEventListener('click', () => openPanel('downloads')); $('menu-button').addEventListener('click', () => openPanel('menu'));
$('close-panel').addEventListener('click', closePanel); $('panel').addEventListener('cancel', closePanel); $('panel').addEventListener('click', event => { if (event.target === $('panel')) closePanel(); });
$('find-input').addEventListener('input', () => void command('find', { value: $('find-input').value }));
for (const [id, forward] of [['find-prev', false], ['find-next', true]]) $(id).addEventListener('click', () => void command('find', { value: $('find-input').value, forward, next: true }));
function closeFind() { $('find-bar').hidden = true; $('find-count').textContent = ''; void command('find-stop'); }
$('find-close').addEventListener('click', closeFind);
for (const [id, name] of [['back', 'back'], ['forward', 'forward'], ['home', 'home'], ['downloads-button', 'download'], ['account', 'user'], ['menu-button', 'menu'], ['new-tab', 'plus'], ['tabs-prev', 'back'], ['tabs-next', 'forward']]) setIcon($(id), name);
setIcon($('protection'), 'shield', false, $('blocked-count'));
setIcon($('tab-search'), 'search', false, $('tab-count'));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('find-bar').hidden) { event.preventDefault(); closeFind(); } });
let lastHeight = 0, resizeFrame = 0;
new ResizeObserver(entries => { const height = Math.ceil(entries[0].borderBoxSize?.[0]?.blockSize || $('chrome').getBoundingClientRect().height); if (height === lastHeight) return; lastHeight = height; document.documentElement.style.setProperty('--toolbar-height', `${height}px`); cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => void command('toolbar-height', { value: height })); }).observe($('chrome'));
api.onState(render); api.onFocusAddress(() => { closePanel(); $('address').focus(); $('address').select(); }); api.onOpenPanel(openPanel);
void command('state');


// The trusted shell resumes queued sync after OS network recovery.
window.addEventListener('online', () => void command('sync-now'));

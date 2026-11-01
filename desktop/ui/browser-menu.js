'use strict';
// The shell menu uses only real, whitelisted browser actions. Build once per open.
window.SanadBrowserMenu = function createBrowserMenu({ root, command, openPanel, closePanel, element, button, setIcon }) {
  let current;
  const group = () => { const node = element('div', 'browser-menu-group'); root.append(node); return node; };
  const run = action => () => { closePanel(); void command(action); };
  function row(parent, label, icon, action, shortcut = '', more = false) {
    const node = button('', action, 'browser-menu-item'); node.setAttribute('aria-label', label);
    const symbol = element('span', 'browser-menu-icon'); setIcon(symbol, icon);
    node.append(symbol, element('span', 'browser-menu-label', label));
    if (shortcut) { const key = element('kbd', '', shortcut); key.dir = 'ltr'; node.append(key); }
    if (more) { const arrow = element('span', 'browser-menu-chevron'); setIcon(arrow, 'chevron'); node.append(arrow); }
    parent.append(node); return node;
  }
  function disclosure(parent, label, icon) {
    const details = element('details', 'browser-menu-details');
    const summary = element('summary', 'browser-menu-item');
    const symbol = element('span', 'browser-menu-icon'); setIcon(symbol, icon);
    const arrow = element('span', 'browser-menu-chevron'); setIcon(arrow, 'chevron');
    summary.append(symbol, element('span', 'browser-menu-label', label), arrow);
    const body = element('div', 'browser-menu-subitems'); details.append(summary, body); parent.append(details); return body;
  }
  const creation = group();
  const add = row(creation, 'علامة تبويب جديدة', 'tab', run('new'), 'Ctrl+T');
  const privateTab = row(creation, 'علامة تبويب خاصة', 'private', () => { closePanel(); void command('new', { private: true }); }, 'Ctrl+Shift+N');
  const restore = row(creation, 'استعادة آخر تبويب مغلق', 'restore', run('restore'), 'Ctrl+Shift+T');
  const account = row(group(), 'حساب سَنَد الحرمين', 'user', run('account'), '', true); account.classList.add('browser-menu-account');
  const navigation = group();
  row(navigation, 'البحث في التبويبات', 'tabs', () => openPanel('tabs'), 'Ctrl+Shift+A', true);
  row(navigation, 'السجل', 'history', () => openPanel('history'), 'Ctrl+H', true);
  row(navigation, 'التنزيلات', 'download', () => openPanel('downloads'), 'Ctrl+J', true);
  row(navigation, 'المفضلة', 'star', () => openPanel('bookmarks'), 'Ctrl+Shift+O', true);
  const policy = row(group(), 'البحث الصارم مفعّل ومقفل', 'lock', () => openPanel('search-policy'), '', true);
  policy.classList.add('browser-menu-policy');
  policy.querySelector('.browser-menu-label').append(element('small', '', 'تصفية مشددة مطبّقة دائمًا · عرض الإجراء'));
  const zoom = group(); zoom.classList.add('browser-menu-zoom');
  const zoomTitle = element('span', 'browser-menu-zoom-title', 'تكبير / تصغير');
  const zoomControls = element('div', 'browser-menu-zoom-controls'); zoomControls.dir = 'ltr';
  const minus = button('−', () => void command('zoom', { value: (current.tabs.find(tab => tab.id === current.activeId)?.zoom || 1) - .1 })); minus.setAttribute('aria-label', 'تصغير الصفحة');
  const value = button('100%', () => void command('zoom', { value: 1 }), 'browser-menu-zoom-value'); value.setAttribute('aria-label', 'إعادة حجم الصفحة إلى 100%'); value.title = 'إعادة حجم الصفحة إلى 100%';
  const plus = button('+', () => void command('zoom', { value: (current.tabs.find(tab => tab.id === current.activeId)?.zoom || 1) + .1 })); plus.setAttribute('aria-label', 'تكبير الصفحة');
  const fullscreen = button('', run('fullscreen')); fullscreen.setAttribute('aria-label', 'ملء الشاشة'); fullscreen.title = 'ملء الشاشة (F11)'; setIcon(fullscreen, 'fullscreen');
  zoomControls.append(minus, value, plus, fullscreen); zoom.append(zoomTitle, zoomControls);
  const tools = group();
  row(tools, 'طباعة…', 'print', run('print'), 'Ctrl+P');
  row(tools, 'البحث في الصفحة', 'search', () => openPanel('find'), 'Ctrl+F');
  row(tools, 'وضع القراءة', 'reader', run('reader'));
  const save = disclosure(tools, 'الحفظ والمشاركة', 'save');
  row(save, 'حفظ الصفحة PDF', 'file', run('save-pdf'));
  row(save, 'حفظ صورة الصفحة', 'image', run('save-image'));
  row(save, 'حفظ نسخة دون اتصال', 'save', run('save-offline'), 'Ctrl+S');
  row(save, 'نسخ رابط دون معاملات التتبع', 'copy', run('copy-link'));
  const more = disclosure(tools, 'المزيد من الأدوات', 'tools');
  row(more, 'أداء الصفحة', 'performance', () => openPanel('performance'));
  row(more, 'إراحة التبويبات غير النشطة', 'sleep', run('suspend')).title = 'احفظ ما تكتبه أولًا؛ تُحمّل التبويبات المريحة من جديد عند فتحها.';
  row(more, 'أدوات المطور', 'code', run('devtools'), 'Ctrl+Shift+I');
  const settings = group();
  row(settings, 'الإعدادات', 'settings', run('settings'), '', true);
  row(settings, 'حماية الخصوصية', 'shield', () => openPanel('privacy'), '', true);
  const theme = row(settings, 'المظهر النهاري', 'theme', () => void command('theme'));
  row(settings, 'حول Sanad', 'info', () => openPanel('about'), '', true);
  row(settings, 'أنظمة سَنَد المستقبلية', 'home', () => { closePanel(); void command('new'); void command('navigate', { value: 'https://ip-murad.com/' }); });
  root.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;
    const items = [...root.querySelectorAll('button:not(:disabled),summary')].filter(node => node.getClientRects().length);
    const index = items.indexOf(document.activeElement); if (index < 0) return;
    event.preventDefault();
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[target]?.focus();
  });
  return { update(state) {
    current = state;
    const zoom = state.tabs.find(tab => tab.id === state.activeId)?.zoom || 1;
    value.textContent = `${Math.round(zoom * 100)}%`; minus.disabled = zoom <= .5; plus.disabled = zoom >= 2;
    restore.disabled = !state.closedCount; add.disabled = privateTab.disabled = state.tabs.length >= 32;
    const label = state.preferences.theme === 'dark' ? 'المظهر النهاري' : 'المظهر الليلي';
    theme.querySelector('.browser-menu-label').textContent = label; theme.setAttribute('aria-label', label);
  } };
};

'use strict';
const { safeURL, cleanURL, HOME } = require('./policy.cjs');
/** Build only bounded, predefined page actions from Chromium's context information. */
function pageActions(params, callbacks, testMode = false) {
  const items = [];
  const link = safeURL(params.linkURL, testMode);
  if (link) items.push(
    { label: 'فتح الرابط في تبويب جديد', click: () => callbacks.open(link, false) },
    { label: 'فتح الرابط في الخلفية', click: () => callbacks.open(link, false, true) },
    { label: 'فتح الرابط في تبويب خاص', click: () => callbacks.open(link, true) },
    { label: 'نسخ رابط دون معاملات التتبع', click: () => callbacks.copy(cleanURL(link) || link) },
    { type: 'separator' }
  );
  if (params.isEditable) {
    for (const [role, label, flag] of [['undo', 'تراجع', 'canUndo'], ['redo', 'إعادة', 'canRedo'], ['cut', 'قص', 'canCut'], ['copy', 'نسخ', 'canCopy'], ['paste', 'لصق', 'canPaste'], ['selectAll', 'تحديد الكل', 'canSelectAll']]) items.push({ role, label, enabled: params.editFlags?.[flag] === true });
    items.push({ type: 'separator' });
  } else if (params.editFlags?.canCopy) items.push({ role: 'copy', label: 'نسخ النص المحدد' });
  const selected = typeof params.selectionText === 'string' && params.formControlType !== 'input-password' ? params.selectionText.trim().slice(0, 300) : '';
  if (selected) {
    const search = new URL(HOME); search.searchParams.set('q', selected);
    items.push({ label: `البحث عن «${selected.slice(0, 55).replace(/&/g, '&&')}»`, click: () => callbacks.open(search.href, false) });
  }
  for (const [label, action] of [['وضع القراءة', 'reader'], ['حفظ الصفحة PDF', 'save-pdf'], ['حفظ صورة الصفحة', 'save-image'], ['حفظ نسخة للقراءة دون اتصال', 'save-offline']]) items.push({ label, click: () => callbacks.run(action) });
  return items;
}
module.exports = { pageActions };

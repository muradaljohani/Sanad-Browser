'use strict';
window.SanadOmnibox = function createOmnibox({ input, form, list, query, navigate, showOverlay, hideOverlay, preconnect, setIcon }) {
  let state, items = [], selected = -1, timer, generation = 0, composing = false, opened = false, contextKey = '';
  const nodes = new Map();
  function direct(value) { return /^https?:\/\//i.test(value) || (!/\s/.test(value) && /^(?:[^\s/:?#@.]+\.)+[^\s/:?#@.]+(?::\d+)?(?:[/?#].*)?$/.test(value)) || /^localhost:\d+/.test(value); }
  function close() { generation++; clearTimeout(timer); list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); selected = -1; if (opened) { opened = false; hideOverlay(); } }
  function position() { const rect = form.getBoundingClientRect(); Object.assign(list.style, { top: `${rect.bottom + 4}px`, left: `${rect.left}px`, width: `${rect.width}px` }); }
  function choose(value) { input.value = value; close(); navigate(value); }
  function local(value) {
    const isPrivate = state?.tabs.find(tab => tab.id === state.activeId)?.private;
    const match = entry => (entry.title + ' ' + entry.url).toLocaleLowerCase().includes(value.toLocaleLowerCase());
    const entries = [...(state?.bookmarks || []), ...(!isPrivate && state?.preferences.search?.saveHistory !== false ? state?.history || [] : [])].filter(match);
    return [{ value, title: direct(value) ? value : `البحث في سَنَد الحرمين عن «${value}»`, kind: direct(value) ? 'url' : 'search' }, ...entries.map(entry => ({ value: entry.url, title: entry.title || entry.url, kind: 'url' }))];
  }
  function render(value, remote = []) {
    if (document.activeElement !== input || composing || !value) { close(); return; }
    const seen = new Set(); items = [...local(value), ...remote.map(text => ({ value: text, title: text, kind: 'search' }))].filter(item => { if (seen.has(item.value)) return false; seen.add(item.value); return true; }).slice(0, 8);
    const keep = new Set(items.map(item => item.value)); for (const [key, node] of nodes) if (!keep.has(key)) { node.remove(); nodes.delete(key); }
    items.forEach((item, index) => {
      let node = nodes.get(item.value);
      if (!node) {
        node = document.createElement('button'); node.type = 'button'; node.className = 'omnibox-option'; node.tabIndex = -1; node.setAttribute('role', 'option');
        const icon = document.createElement('span'); icon.className = 'omnibox-option-icon'; setIcon(icon, item.kind === 'url' ? 'home' : 'search');
        const text = document.createElement('span'); text.className = 'omnibox-option-text'; const title = document.createElement('strong'); title.textContent = item.title; title.dir = 'auto'; text.append(title);
        if (item.kind === 'url' && item.title !== item.value) { const url = document.createElement('small'); url.textContent = item.value; url.dir = 'ltr'; text.append(url); }
        node.append(icon, text); node.addEventListener('pointerdown', event => event.preventDefault()); node.addEventListener('click', () => choose(item.value));
        node.addEventListener('pointerenter', () => { if (item.kind === 'url') preconnect(item.value); });
        nodes.set(item.value, node);
      }
      node.id = `address-option-${index}`; node.setAttribute('aria-selected', String(index === selected));
      const before = list.children[index]; if (before !== node) list.insertBefore(node, before || null);
    });
    list.hidden = false; input.setAttribute('aria-expanded', 'true'); position();
    if (!opened) { opened = true; showOverlay(); }
  }
  function refresh() {
    const value = input.value.trim().slice(0, 300), request = ++generation; clearTimeout(timer); selected = -1; input.removeAttribute('aria-activedescendant');
    if (!value || composing) { close(); return; }
    render(value);
    const privateTab = state?.tabs.find(tab => tab.id === state.activeId)?.private;
    if (privateTab || state?.locationPrivacy?.enabled || state?.preferences.search?.remoteSuggestions === false || value.length < 2 || /[:/.@]/.test(value)) return;
    timer = setTimeout(() => { void query(value).then(result => { if (request === generation && input.value.trim().slice(0, 300) === value) render(value, Array.isArray(result?.suggestions) ? result.suggestions : []); }).catch(() => {}); }, 150);
  }
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-controls', list.id); input.setAttribute('aria-expanded', 'false');
  input.addEventListener('input', refresh);
  input.addEventListener('blur', close);
  input.addEventListener('compositionstart', () => { composing = true; close(); });
  input.addEventListener('compositionend', () => { composing = false; refresh(); });
  input.addEventListener('keydown', event => {
    if (composing || event.isComposing) { if (event.key === 'Enter') event.preventDefault(); return; }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (opened && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); selected = event.key === 'ArrowUp' && selected < 0 ? items.length - 1 : (selected + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; for (let i = 0; i < list.children.length; i++) list.children[i].setAttribute('aria-selected', String(i === selected)); input.setAttribute('aria-activedescendant', `address-option-${selected}`); list.children[selected]?.scrollIntoView({ block: 'nearest' }); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(opened && selected >= 0 ? items[selected].value : input.value); }
  });
  form.addEventListener('submit', event => { event.preventDefault(); if (!composing) choose(input.value); });
  window.addEventListener('resize', () => { if (opened) position(); });
  return { close, update(next) { state = next; const active = next.tabs.find(tab => tab.id === next.activeId); const key = JSON.stringify([next.activeId, active?.private, next.preferences.search, next.bookmarks, next.history]); if (key !== contextKey) { contextKey = key; if (opened) refresh(); } } };
};

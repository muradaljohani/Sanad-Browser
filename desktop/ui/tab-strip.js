'use strict';
// Original shell-only implementation. Page content never receives this controller or its bridge.
window.SanadTabStrip = function createTabStrip({ root, previous, next, count, announcement, command }) {
  const nodes = new Map();
  let current = { tabs: [], activeId: null }, previousActive, order = '', draggedId = null, frozen = false;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rtl = () => getComputedStyle(root).direction === 'rtl';
  function animate(node, frames, duration = 160) {
    if (reduced() || !node.animate) return null;
    const animation = node.animate(frames, { duration, easing: 'cubic-bezier(.2,.8,.2,1)' });
    animation.finished.then(overflow, () => {});
    return animation;
  }
  function overflow() {
    const maximum = Math.max(0, root.scrollWidth - root.clientWidth);
    previous.hidden = next.hidden = maximum < 3;
    previous.disabled = Math.abs(root.scrollLeft) < 2;
    next.disabled = Math.abs(root.scrollLeft) >= maximum - 2;
  }
  function scroll(direction) { root.scrollBy({ left: direction * (rtl() ? -1 : 1) * Math.max(180, root.clientWidth * .65), behavior: reduced() ? 'auto' : 'smooth' }); }
  function releaseWidths() {
    if (!frozen) return;
    frozen = false;
    for (const item of nodes.values()) item.node.style.flex = '';
    overflow();
  }
  function close(id, mouse = false) {
    if (mouse && !frozen) {
      for (const item of nodes.values()) item.node.style.flex = `0 0 ${item.node.getBoundingClientRect().width}px`;
      frozen = true;
    }
    void command('close', { id });
  }
  function activate(id, keyboard = false) {
    void command('activate', { id, focus: keyboard ? 'tab-strip' : 'page' }).then(() => {
      if (keyboard) nodes.get(id)?.select.focus({ preventScroll: true });
    });
  }
  function clearDrop() { for (const item of nodes.values()) item.node.classList.remove('drop-before', 'drop-after', 'dragging'); }
  function dropPosition(event) {
    const tab = event.target.closest('[data-tab-id]');
    if (!tab || tab.parentElement !== root) return { beforeId: null, tab: null };
    const id = tab.dataset.tabId;
    const rect = tab.getBoundingClientRect();
    const before = rtl() ? event.clientX >= rect.left + rect.width / 2 : event.clientX < rect.left + rect.width / 2;
    const ids = current.tabs.map(item => item.id).filter(item => item !== draggedId);
    const index = ids.indexOf(id);
    return { beforeId: id === draggedId ? draggedId : before ? id : ids[index + 1] || null, tab, before };
  }
  function make(tab) {
    const node = document.createElement('div'); node.className = 'tab'; node.dataset.tabId = tab.id; node.draggable = true;
    const select = document.createElement('button'); select.type = 'button'; select.className = 'tab-select'; select.setAttribute('role', 'tab');
    const symbol = document.createElement('span'); symbol.className = 'tab-site-symbol'; symbol.setAttribute('aria-hidden', 'true');
    const title = document.createElement('span'); title.className = 'tab-title'; title.dir = 'auto';
    const flags = document.createElement('span'); flags.className = 'tab-flags'; flags.setAttribute('aria-hidden', 'true');
    select.append(symbol, title, flags);
    const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'tab-close'; dismiss.textContent = '×'; dismiss.tabIndex = -1;
    node.append(select, dismiss);
    select.addEventListener('click', () => activate(tab.id));
    dismiss.addEventListener('click', event => { event.stopPropagation(); close(tab.id, event.detail > 0); });
    node.addEventListener('mousedown', event => { if (event.button === 1) event.preventDefault(); });
    node.addEventListener('auxclick', event => { if (event.button === 1) { event.preventDefault(); close(tab.id, true); } });
    node.addEventListener('contextmenu', event => { event.preventDefault(); void command('tab-context-menu', { id: tab.id, x: event.clientX, y: event.clientY }); });
    select.addEventListener('keydown', event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const ids = current.tabs.map(item => item.id), index = ids.indexOf(tab.id);
      let target;
      if (event.key === 'Home') target = ids[0];
      else if (event.key === 'End') target = ids.at(-1);
      else if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        const step = (event.key === 'ArrowRight' ? 1 : -1) * (rtl() ? -1 : 1);
        target = ids[(index + step + ids.length) % ids.length];
      } else if (event.key === 'Delete') { event.preventDefault(); close(tab.id); return; }
      if (target) { event.preventDefault(); activate(target, true); }
    });
    node.addEventListener('dragstart', event => {
      if (event.target.closest('.tab-close')) { event.preventDefault(); return; }
      releaseWidths(); draggedId = tab.id; node.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-sanad-tab', tab.id);
    });
    node.addEventListener('dragend', () => { draggedId = null; clearDrop(); });
    return { node, select, symbol, title, flags, dismiss };
  }
  function update(state) {
    const initial = nodes.size === 0;
    const layoutKey = state.tabs.map(tab => `${tab.id}:${tab.pinned ? 1 : 0}`).join(',');
    const layoutChanged = order !== layoutKey;
    const oldRects = layoutChanged ? new Map([...nodes].map(([id, item]) => [id, item.node.getBoundingClientRect()])) : new Map();
    const focused = document.activeElement;
    const removedFocus = [...nodes].some(([id, item]) => !state.tabs.some(tab => tab.id === id) && item.node.contains(focused));
    const added = state.tabs.filter(tab => !nodes.has(tab.id));
    const removed = [...nodes].filter(([id]) => !state.tabs.some(tab => tab.id === id));
    current = state;
    for (const [id, item] of removed) {
      const rect = oldRects.get(id), bounds = root.getBoundingClientRect();
      nodes.delete(id); item.node.classList.add('closing'); item.node.setAttribute('aria-hidden', 'true'); item.node.inert = true;
      Object.assign(item.node.style, { position: 'absolute', left: `${rect.left - bounds.left + root.scrollLeft}px`, top: `${rect.top - bounds.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0' });
      const animation = animate(item.node, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.88) translateY(5px)' }], 130);
      if (animation) animation.finished.catch(() => {}).finally(() => { item.node.remove(); overflow(); }); else item.node.remove();
    }
    for (const tab of state.tabs) {
      if (!nodes.has(tab.id)) nodes.set(tab.id, make(tab));
      const item = nodes.get(tab.id), active = tab.id === state.activeId;
      const key = JSON.stringify([tab.title, tab.url, active, tab.pinned, tab.private, tab.loading, tab.closing, tab.muted, tab.sleeping]);
      if (item.key === key) continue;
      item.key = key;
      item.node.classList.toggle('active', active); item.node.classList.toggle('pinned', tab.pinned); item.node.classList.toggle('private-tab', tab.private); item.node.classList.toggle('loading', tab.loading);
      item.select.setAttribute('aria-selected', String(active)); item.select.setAttribute('aria-busy', String(tab.loading)); item.select.tabIndex = active ? 0 : -1;
      const title = String(tab.title || 'تبويب جديد');
      item.title.textContent = title; item.select.setAttribute('aria-label', title + (tab.private ? '، خاص' : '') + (tab.pinned ? '، مثبّت' : ''));
      item.select.title = title + (tab.url ? '\n' + tab.url : '');
      item.dismiss.setAttribute('aria-label', `إغلاق ${title}`); item.dismiss.title = 'إغلاق التبويب (Ctrl+W)'; item.dismiss.disabled = Boolean(tab.closing);
      item.flags.textContent = [tab.private ? 'خاص' : '', tab.muted ? '♪' : '', tab.sleeping ? '◌' : '', tab.pinned ? '⌖' : ''].filter(Boolean).join(' ');
      let site = '◉'; try { site = new URL(tab.url).hostname.replace(/^www\./, '').slice(0, 1).toLocaleUpperCase() || site; } catch {}
      item.symbol.textContent = tab.private ? '◈' : site;
    }
    // Move only out-of-order nodes. Loading and title updates retain focus and listeners.
    for (let i = 0; i < state.tabs.length; i++) {
      const item = nodes.get(state.tabs[i].id);
      const alive = [...root.children].filter(node => !node.classList.contains('closing'));
      if (alive[i] !== item.node) {
        if (root.moveBefore && item.node.parentElement === root) root.moveBefore(item.node, alive[i] || null);
        else root.insertBefore(item.node, alive[i] || null);
      }
    }
    if (layoutChanged && !initial) {
      for (const [id, item] of nodes) {
        const old = oldRects.get(id);
        if (old) {
          const dx = old.left - item.node.getBoundingClientRect().left;
          if (Math.abs(dx) > 1) animate(item.node, [{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }]);
        } else animate(item.node, [{ opacity: 0, transform: 'translateY(6px) scale(.96)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }]);
      }
    }
    if (removedFocus) nodes.get(state.activeId)?.select.focus({ preventScroll: true });
    else if (focused && root.contains(focused) && document.activeElement !== focused) focused.focus({ preventScroll: true });
    if (state.activeId !== previousActive || added.length) nodes.get(state.activeId)?.node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    if (!initial && added.length) announcement.textContent = `فُتح تبويب جديد. عدد التبويبات ${state.tabs.length}.`;
    else if (removed.length) announcement.textContent = `أُغلق ${removed.length === 1 ? 'التبويب' : 'عدد من التبويبات'}. عدد التبويبات ${state.tabs.length}.`;
    count.textContent = String(state.tabs.length); previousActive = state.activeId; order = layoutKey; overflow();
  }
  root.addEventListener('pointerleave', releaseWidths);
  root.addEventListener('scroll', overflow, { passive: true });
  root.addEventListener('wheel', event => { if (!event.ctrlKey && root.scrollWidth > root.clientWidth + 2 && Math.abs(event.deltaY) > Math.abs(event.deltaX)) { event.preventDefault(); root.scrollBy({ left: event.deltaY * (rtl() ? -1 : 1), behavior: 'auto' }); } }, { passive: false });
  root.addEventListener('dblclick', event => { if (event.target === root) void command('new'); });
  root.addEventListener('dragover', event => {
    if (!draggedId || !nodes.has(draggedId)) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'move'; clearDrop(); nodes.get(draggedId)?.node.classList.add('dragging');
    const position = dropPosition(event);
    if (position.tab && position.beforeId !== draggedId) position.tab.classList.add(position.before ? 'drop-before' : 'drop-after');
    const rect = root.getBoundingClientRect();
    if (event.clientX < rect.left + 36) root.scrollBy({ left: -24 });
    else if (event.clientX > rect.right - 36) root.scrollBy({ left: 24 });
  });
  root.addEventListener('drop', event => {
    if (!draggedId || !nodes.has(draggedId)) return;
    event.preventDefault(); const id = draggedId, position = dropPosition(event); draggedId = null; clearDrop();
    if (position.beforeId !== id) void command('tab-move', { id, beforeId: position.beforeId });
  });
  previous.addEventListener('click', () => scroll(-1)); next.addEventListener('click', () => scroll(1));
  new ResizeObserver(overflow).observe(root);
  return { update };
};

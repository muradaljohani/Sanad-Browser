'use strict';
// Original shell-only implementation. Page content never receives this controller or its bridge.
window.SanadTabStrip = function createTabStrip({ root, previous, next, count, announcement, command }) {
  const nodes = new Map();
  let current = { tabs: [], activeId: null }, previousActive, order = '', frozen = false, pointerDrag = null, dragFrame = 0, suppressClick = false;
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
    if (!frozen || pointerDrag?.active) return;
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
  function arrange(ids, dragging) {
    const before = new Map(ids.filter(id => id !== dragging).map(id => [id, nodes.get(id).node.getBoundingClientRect()]));
    for (let i = 0; i < ids.length; i++) {
      const node = nodes.get(ids[i]).node, alive = [...root.children].filter(item => !item.classList.contains('closing'));
      if (alive[i] !== node) { if (root.moveBefore && node.parentElement === root) root.moveBefore(node, alive[i] || null); else root.insertBefore(node, alive[i] || null); }
    }
    for (const [id, rect] of before) {
      const node = nodes.get(id).node; for (const animation of node.getAnimations()) animation.cancel();
      const dx = rect.left - node.getBoundingClientRect().left;
      if (Math.abs(dx) > 1) animate(node, [{ transform: `translate3d(${dx}px,0,0)` }, { transform: 'translate3d(0,0,0)' }]);
    }
  }
  function paintDrag() {
    dragFrame = 0; const drag = pointerDrag; if (!drag?.active || !nodes.has(drag.id)) return;
    const bounds = root.getBoundingClientRect(), node = nodes.get(drag.id).node;
    const edge = drag.x < bounds.left + 30 ? -10 : drag.x > bounds.right - 30 ? 10 : 0;
    if (edge) root.scrollBy({ left: edge, behavior: 'auto' });
    const rest = drag.ids.filter(id => id !== drag.id), pinned = current.tabs.find(tab => tab.id === drag.id)?.pinned;
    const group = rest.filter(id => current.tabs.find(tab => tab.id === id)?.pinned === pinned);
    let beforeId = pinned ? rest.find(id => !current.tabs.find(tab => tab.id === id)?.pinned) || null : null;
    for (const id of group) {
      const other = nodes.get(id).node, center = bounds.left + other.offsetLeft - root.scrollLeft + other.offsetWidth / 2;
      if (rtl() ? drag.x >= center : drag.x < center) { beforeId = id; break; }
    }
    const position = beforeId === null ? rest.length : rest.indexOf(beforeId); rest.splice(position, 0, drag.id);
    if (rest.join(',') !== drag.ids.join(',')) { drag.ids = rest; arrange(rest, drag.id); }
    node.style.transform = '';
    const dx = drag.x - drag.offset - node.getBoundingClientRect().left;
    node.style.transform = `translate3d(${dx}px,0,0)`;
    if (edge) dragFrame = requestAnimationFrame(paintDrag);
  }
  function finishDrag(commit = false, redraw = true) {
    const drag = pointerDrag; if (!drag) return;
    pointerDrag = null; cancelAnimationFrame(dragFrame); dragFrame = 0;
    const item = nodes.get(drag.id); if (item) { item.node.style.transform = ''; item.node.classList.remove('dragging'); }
    root.classList.remove('pointer-dragging');
    if (root.hasPointerCapture(drag.pointer)) root.releasePointerCapture(drag.pointer);
    releaseWidths();
    if (drag.active) {
      suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
      if (commit) { const index = drag.ids.indexOf(drag.id); void command('tab-move', { id: drag.id, beforeId: drag.ids[index + 1] || null }); }
      else if (redraw) { order = ''; update(current); }
    }
  }
  function make(tab) {
    const node = document.createElement('div'); node.className = 'tab'; node.dataset.tabId = tab.id; node.draggable = false;
    const select = document.createElement('button'); select.type = 'button'; select.className = 'tab-select'; select.setAttribute('role', 'tab');
    const symbol = document.createElement('span'); symbol.className = 'tab-site-symbol'; symbol.setAttribute('aria-hidden', 'true');
    const initial = document.createElement('span'); initial.className = 'tab-site-initial';
    const icon = document.createElement('img'); icon.alt = ''; icon.draggable = false; icon.hidden = true;
    icon.addEventListener('load', () => { icon.hidden = false; initial.hidden = true; });
    icon.addEventListener('error', () => { icon.hidden = true; initial.hidden = false; }); symbol.append(initial, icon);
    const title = document.createElement('span'); title.className = 'tab-title'; title.dir = 'auto';
    const flags = document.createElement('span'); flags.className = 'tab-flags'; flags.setAttribute('aria-hidden', 'true');
    select.append(symbol, title, flags);
    const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'tab-close'; dismiss.textContent = '×'; dismiss.tabIndex = -1;
    node.append(select, dismiss);
    select.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); return; } activate(tab.id); });
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
    node.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('.tab-close')) return;
      const rect = node.getBoundingClientRect(); pointerDrag = { id: tab.id, pointer: event.pointerId, start: event.clientX, x: event.clientX, offset: event.clientX - rect.left, ids: current.tabs.map(tab => tab.id), active: false };
    });
    return { node, select, symbol, initial, icon, title, flags, dismiss };
  }
  function update(state) {
    const initial = nodes.size === 0;
    const layoutKey = state.tabs.map(tab => `${tab.id}:${tab.pinned ? 1 : 0}`).join(',');
    const layoutChanged = order !== layoutKey;
    if (pointerDrag && layoutChanged) finishDrag(false, false);
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
      const key = JSON.stringify([tab.title, tab.url, tab.favicon, active, tab.pinned, tab.private, tab.loading, tab.closing, tab.muted, tab.sleeping]);
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
      item.initial.textContent = tab.private ? '◈' : site;
      if (!tab.favicon) { item.icon.hidden = true; item.initial.hidden = false; item.icon.removeAttribute('src'); }
      else if (item.icon.getAttribute('src') !== tab.favicon) { item.icon.hidden = true; item.initial.hidden = false; item.icon.src = tab.favicon; }
    }
    // Move only out-of-order nodes. Loading and title updates retain focus and listeners.
    const visualIds = pointerDrag?.active ? pointerDrag.ids : state.tabs.map(tab => tab.id);
    for (let i = 0; i < visualIds.length; i++) {
      const item = nodes.get(visualIds[i]);
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
          if (Math.abs(dx) > 1) animate(item.node, [{ transform: `translate3d(${dx}px,0,0)` }, { transform: 'translate3d(0,0,0)' }]);
        } else animate(item.node, [{ opacity: 0, transform: 'translate3d(0,6px,0) scale(.96)' }, { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }]);
      }
    }
    if (removedFocus) nodes.get(state.activeId)?.select.focus({ preventScroll: true });
    else if (focused && root.contains(focused) && document.activeElement !== focused) focused.focus({ preventScroll: true });
    if (!pointerDrag?.active && (state.activeId !== previousActive || added.length)) nodes.get(state.activeId)?.node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    if (!initial && added.length) announcement.textContent = `فُتح تبويب جديد. عدد التبويبات ${state.tabs.length}.`;
    else if (removed.length) announcement.textContent = `أُغلق ${removed.length === 1 ? 'التبويب' : 'عدد من التبويبات'}. عدد التبويبات ${state.tabs.length}.`;
    count.textContent = String(state.tabs.length); previousActive = state.activeId; order = layoutKey; overflow();
  }
  root.addEventListener('pointerleave', releaseWidths);
  root.addEventListener('scroll', overflow, { passive: true });
  root.addEventListener('wheel', event => { if (!event.ctrlKey && root.scrollWidth > root.clientWidth + 2 && Math.abs(event.deltaY) > Math.abs(event.deltaX)) { event.preventDefault(); root.scrollBy({ left: event.deltaY * (rtl() ? -1 : 1), behavior: 'auto' }); } }, { passive: false });
  root.addEventListener('dblclick', event => { if (event.target === root) void command('new'); });
  document.addEventListener('pointermove', event => {
    const drag = pointerDrag; if (!drag || drag.pointer !== event.pointerId) return;
    drag.x = event.clientX;
    if (!drag.active && Math.abs(drag.x - drag.start) >= 5) {
      releaseWidths(); drag.active = true; root.setPointerCapture(event.pointerId); root.classList.add('pointer-dragging');
      for (const item of nodes.values()) { item.node.style.flex = `0 0 ${item.node.getBoundingClientRect().width}px`; for (const animation of item.node.getAnimations()) animation.cancel(); }
      frozen = true; nodes.get(drag.id).node.classList.add('dragging'); void command('activate', { id: drag.id, focus: 'tab-strip' });
    }
    if (drag.active) { event.preventDefault(); if (!dragFrame) dragFrame = requestAnimationFrame(paintDrag); }
  }, { passive: false });
  document.addEventListener('pointerup', event => { if (pointerDrag?.pointer === event.pointerId) { if (pointerDrag.active) paintDrag(); finishDrag(true); } });
  document.addEventListener('pointercancel', () => finishDrag(false));
  window.addEventListener('blur', () => finishDrag(false));
  previous.addEventListener('click', () => scroll(-1)); next.addEventListener('click', () => scroll(1));
  new ResizeObserver(overflow).observe(root);
  return { update };
};

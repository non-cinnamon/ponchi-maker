import { copy, element, blankDocument, sampleDocument, bounds, clamp, moveItems, resized, parseDocument, childrenOf, descendants, selectionRoots, selectionLeaves, paintOrder, refreshGroups, rootForCanvas, groupSelection, ungroupSelection, pruneEmptyGroups, dropNode, reorderSelection, resizeNode, moveSelection, duplicateSelection, alignSelection, groupLayout } from './model.js?v=2.0.1';
import { importQtUi, exportQtUi } from './qt-ui.js?v=2.0.1';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const STORAGE = 'ponchi-maker.document.v1' + (new URLSearchParams(location.search).get('sandbox') === '1' ? '.sandbox' : '');
const font = '"Segoe UI", "Noto Sans JP", Meiryo, sans-serif';
const svg = $('artboard'), shapes = $('shapes'), overlay = $('selection-overlay');
let doc = sampleDocument(), selection = new Set(), undoStack = [], redoStack = [], gesture = null;
let scale = 1, gridVisible = true, toastTimer, editingId = null, dragId = null, storageOK = true, shapeSignature = '', lastTap = null;
const collapsedGroups = new Set();
let pendingImport = null;
const measure = document.createElement('canvas').getContext('2d');
try { const saved = localStorage.getItem(STORAGE); if (saved) doc = parseDocument(JSON.parse(saved)); }
catch { storageOK = false; }
const node = (tag, attrs = {}, text) => {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (text !== undefined) el.textContent = text;
  return el;
};
const selected = () => selectionRoots(doc, selection);
const label = e => e.name || e.text.replace(/\n/g, ' ').trim() || (e.type === 'group' ? 'グループ' : e.type === 'rect' ? '四角' : '文字');
const round = n => Math.round(n * 100) / 100;
function trackDrag(phase) { if (location.search.includes('sandbox=1')) $('outliner').dataset.dragTrace = (($('outliner').dataset.dragTrace || '') + '|' + phase).slice(-600); }
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4200); }
function persist() {
  try { localStorage.setItem(STORAGE, JSON.stringify(doc)); storageOK = true; $('save-state').textContent = 'このブラウザに自動保存済み'; }
  catch { storageOK = false; $('save-state').textContent = '自動保存できません · JSON保存をご利用ください'; }
}
function commit(before) {
  refreshGroups(doc); selection = new Set([...selection].filter(id => doc.elements.some(e => e.id === id)));
  if (JSON.stringify(before) !== JSON.stringify(doc)) { undoStack.push(before); if (undoStack.length > 100) undoStack.shift(); redoStack = []; persist(); }
  render();
}
function change(fn) { const before = copy(doc); try { fn(); commit(before); } catch (error) { doc = before; render(); toast(error.message); } }
function history(redo = false) {
  if (gesture) return;
  const from = redo ? redoStack : undoStack, to = redo ? undoStack : redoStack;
  if (!from.length) return;
  to.push(copy(doc)); doc = from.pop(); selection = new Set([...selection].filter(id => doc.elements.some(e => e.id === id))); persist(); render();
}
function wrapText(e) {
  measure.font = `${e.fontSize}px ${font}`;
  const width = Math.max(1, e.width - (e.type === 'rect' ? 20 : 4));
  const lines = [];
  for (const paragraph of e.text.split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    let line = '';
    for (const char of paragraph) {
      if (line && measure.measureText(line + char).width > width) { lines.push(line); line = char; }
      else line += char;
    }
    lines.push(line);
  }
  return lines;
}
function drawElement(e, interactive = true) {
  const g = node('g', { transform: `translate(${e.x} ${e.y})` });
  if (interactive) { g.classList.add('shape'); g.dataset.id = e.id; g.setAttribute('aria-label', `${e.type === 'rect' ? '四角' : '文字'}：${label(e)}`); }
  if (e.type === 'rect') g.append(node('rect', { width: e.width, height: e.height, rx: Math.min(e.radius, e.width / 2, e.height / 2), fill: e.fill, stroke: e.stroke, 'stroke-width': e.strokeWidth }));
  else if (interactive) g.append(node('rect', { width: e.width, height: e.height, fill: 'transparent' }));
  if (e.text) {
    const lines = wrapText(e), lineHeight = e.fontSize * 1.45;
    const text = node('text', { x: e.width / 2, y: e.height / 2 - ((lines.length - 1) * lineHeight) / 2,
      'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': font, 'font-size': e.fontSize, fill: e.color, 'pointer-events': 'none', 'xml:space': 'preserve' });
    lines.forEach((line, i) => text.append(node('tspan', { x: e.width / 2, dy: i ? lineHeight : 0 }, line || '\u00a0')));
    g.append(text);
  }
  return g;
}
function renderCanvas() {
  const signature = JSON.stringify(doc.elements);
  if (signature !== shapeSignature) { shapes.replaceChildren(...paintOrder(doc).map(e => drawElement(e))); shapeSignature = signature; }
  overlay.replaceChildren();
  const items = selected(), box = bounds(items);
  for (const e of items) overlay.append(node('rect', { x: e.x, y: e.y, width: e.width, height: e.height, fill: 'none', stroke: '#7267e4', 'stroke-width': 1 / scale, 'stroke-dasharray': e.type === 'group' ? `${5 / scale} ${3 / scale}` : 'none', 'pointer-events': 'none' }));
  if (!box) return;
  const border = node('rect', { x: box.x, y: box.y, width: box.width, height: box.height, fill: 'none', stroke: '#7267e4', 'stroke-width': 5 / scale, 'stroke-opacity': 0.22, 'pointer-events': 'stroke', class: 'selection-border' });
  border.dataset.move = 'true'; overlay.append(border);
  if (items.length !== 1) return;
  const positions = { nw: [0, 0], n: [.5, 0], ne: [1, 0], e: [1, .5], se: [1, 1], s: [.5, 1], sw: [0, 1], w: [0, .5] };
  for (const [handle, [hx, hy]] of Object.entries(positions)) {
    const size = 8 / scale;
    const r = node('rect', { x: box.x + hx * box.width - size / 2, y: box.y + hy * box.height - size / 2,
      width: size, height: size, rx: 1 / scale, fill: 'white', stroke: '#7267e4', 'stroke-width': 1.3 / scale });
    r.dataset.handle = handle;
    r.style.cursor = `${({ nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw', n: 'ns', s: 'ns', e: 'ew', w: 'ew' })[handle]}-resize`;
    overlay.append(r);
  }
}
function renderOutliner() {
  const container = $('outliner'), scrollTop = container.scrollTop;
  container.replaceChildren();
  if (!doc.elements.length) { const empty = document.createElement('p'); empty.className = 'outline-empty'; empty.textContent = '四角や文字を追加しましょう'; container.append(empty); }
  function rows(parentId = null, depth = 0) {
   for (const e of [...childrenOf(doc, parentId)].reverse()) {
    const row = document.createElement('div'); row.className = `outline-row${selection.has(e.id) ? ' selected' : ''}${e.type === 'group' ? ' group-row' : ''}`;
    row.dataset.id = e.id; row.draggable = true; row.tabIndex = 0; row.style.paddingLeft = `${5 + depth * 14}px`;
    row.setAttribute('role', 'treeitem'); row.setAttribute('aria-label', `要素：${label(e)}`); row.setAttribute('aria-level', depth + 1); row.setAttribute('aria-selected', selection.has(e.id)); row.setAttribute('aria-current', selection.has(e.id) ? 'true' : 'false');
    if (e.type === 'group') {
      row.setAttribute('aria-expanded', !collapsedGroups.has(e.id));
      const toggle = document.createElement('button'); toggle.className = 'group-toggle'; toggle.textContent = collapsedGroups.has(e.id) ? '▸' : '▾'; toggle.setAttribute('aria-label', `${label(e)}を${collapsedGroups.has(e.id) ? '展開' : '折りたたむ'}`);
      toggle.addEventListener('click', event => { event.stopPropagation(); if (collapsedGroups.has(e.id)) collapsedGroups.delete(e.id); else collapsedGroups.add(e.id); renderOutliner(); }); row.append(toggle);
    } else { const spacer = document.createElement('span'); spacer.className = 'group-toggle-spacer'; row.append(spacer); }
    for (const [className, text] of [['outline-icon', e.type === 'group' ? '▱' : e.type === 'rect' ? '▭' : 'T'], ['outline-label', label(e)], ['outline-grip', '⠿']]) { const span = document.createElement('span'); span.className = className; span.textContent = text; row.append(span); }
    if (e.type === 'group') { const badge = document.createElement('span'); badge.className = 'layout-badge'; const direction = groupLayout(doc, e); badge.textContent = direction === 'free' ? '自由' : direction; badge.title = 'Qt出力時の配置方向'; row.insertBefore(badge, row.lastChild); }
    row.addEventListener('click', event => { selectItem(e.id, event.shiftKey || event.ctrlKey || event.metaKey); render(); });
    row.addEventListener('dblclick', () => openTextEditor(e.id));
    row.addEventListener('keydown', event => { if (event.target !== row) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectItem(e.id, event.shiftKey); render(); } if (e.type === 'group' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.stopPropagation(); event.preventDefault(); if (event.key === 'ArrowLeft') collapsedGroups.add(e.id); else collapsedGroups.delete(e.id); renderOutliner(); } });
    row.addEventListener('dragstart', event => { dragId = e.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', e.id); trackDrag('start:' + label(e)); });
    const dropPosition = event => { const r = row.getBoundingClientRect(), fraction = (event.clientY - r.top) / r.height; return e.type === 'group' && fraction > .25 && fraction < .75 ? 'inside' : fraction < .5 ? 'before' : 'after'; };
    row.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; const where = dropPosition(event); trackDrag('over:' + label(e) + ':' + where); row.classList.toggle('drop-before', where === 'before'); row.classList.toggle('drop-after', where === 'after'); row.classList.toggle('drop-inside', where === 'inside'); });
    row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after', 'drop-inside'));
    row.addEventListener('drop', event => {
      event.preventDefault(); const where = dropPosition(event); trackDrag('drop:' + label(e) + ':' + (dragId || 'none'));
      if (dragId && dragId !== e.id && doc.elements.some(item => item.id === dragId)) change(() => {
        if (dropNode(doc, dragId, e.id, where)) { selection = new Set([dragId]); if (where === 'inside') collapsedGroups.delete(e.id); }
      }); else renderOutliner();
      dragId = null;
    });
    row.addEventListener('dragend', () => { trackDrag('end'); dragId = null; renderOutliner(); }); container.append(row);
    if (e.type === 'group' && !collapsedGroups.has(e.id)) rows(e.id, depth + 1);
   }
  }
  rows();
  container.scrollTop = scrollTop;
}
function renderProperties() {
  const items = selected(), one = items.length === 1 ? items[0] : null;
  $('empty-properties').hidden = items.length !== 0; $('element-properties').hidden = !one; $('multi-properties').hidden = items.length < 2;
  $('type-badge').textContent = one ? (one.type === 'group' ? 'グループ' : one.type === 'rect' ? '四角' : '文字') : items.length > 1 ? `${items.length} 要素` : '作業領域';
  $('canvas-width').value = doc.canvas.width; $('canvas-height').value = doc.canvas.height;
  if (one) {
    for (const key of ['name', 'x', 'y', 'width', 'height', 'text', 'fontSize', 'color', 'fill', 'stroke', 'strokeWidth', 'radius']) {
      const input = $(`prop-${key}`); if (document.activeElement !== input) input.value = typeof one[key] === 'number' ? round(one[key]) : one[key];
    }
    $('rect-properties').hidden = one.type !== 'rect';
    $('text-properties').hidden = one.type === 'group'; $('group-properties').hidden = one.type !== 'group';
    if (one.type === 'group') { $('group-layout').value = one.layout || 'auto'; const direction = groupLayout(doc, one); $('group-layout-result').textContent = `Qt出力：${direction === 'free' ? '自由配置（座標を保持）' : direction === 'H' ? 'H · 横方向' : 'V · 縦方向'} · ${childrenOf(doc, one.id).length} 子要素`; }
    $('overflow-note').hidden = one.type === 'group' || !one.text || wrapText(one).length * one.fontSize * 1.45 <= one.height - (one.type === 'rect' ? 12 : 0);
  }
  document.querySelectorAll('[data-align]').forEach(button => button.disabled = items.length < (button.dataset.align.startsWith('distribute') ? 3 : 2));
  document.querySelectorAll('[data-order]').forEach(button => button.disabled = !items.length);
  $('delete').disabled = $('duplicate').disabled = !items.length;
  $('group-current').disabled = items.length < 2;
  $('ungroup-current').disabled = !items.some(e => e.type === 'group');
  $('undo').disabled = !undoStack.length; $('redo').disabled = !redoStack.length;
  $('selection-status').textContent = one ? `${label(one)} · ${round(one.width)} × ${round(one.height)}` : items.length ? `${items.length} 要素を選択中` : '余白をドラッグして範囲選択';
  $('element-count').textContent = `${doc.elements.filter(e => e.type !== 'group').length} 要素 · ${doc.elements.filter(e => e.type === 'group').length} グループ`;
  $('outline-count').textContent = doc.elements.length;
}
function resizeView() {
  if ($('zoom').value === 'fit') scale = Math.max(.1, Math.min(1.5, ($('viewport').clientWidth - 86) / doc.canvas.width, ($('viewport').clientHeight - 110) / doc.canvas.height));
  else scale = Number($('zoom').value);
  svg.setAttribute('viewBox', `0 0 ${doc.canvas.width} ${doc.canvas.height}`);
  svg.setAttribute('width', doc.canvas.width * scale); svg.setAttribute('height', doc.canvas.height * scale);
  $('paper-wrap').style.width = `${doc.canvas.width * scale}px`;
  for (const id of ['paper-background', 'grid']) { $(id).setAttribute('width', doc.canvas.width); $(id).setAttribute('height', doc.canvas.height); }
  $('grid').style.display = gridVisible ? '' : 'none'; $('paper-size').textContent = `${doc.canvas.width} × ${doc.canvas.height}`;
  renderCanvas();
}
function render() { if (document.activeElement !== $('document-name')) $('document-name').value = doc.name; resizeView(); renderOutliner(); renderProperties(); }
function selectItem(id, multi) { if (multi) { if (selection.has(id)) selection.delete(id); else selection.add(id); } else selection = new Set([id]); }
function addElement(type) {
  if (doc.elements.length >= 1000) return toast('要素は1000個まで追加できます。');
  change(() => {
    const offset = (doc.elements.length % 8) * 20;
    const e = element(type, { x: Math.min(80 + offset, doc.canvas.width - 220), y: Math.min(80 + offset, doc.canvas.height - 120) });
    doc.elements.push(e); selection = new Set([e.id]);
  });
  toast(type === 'rect' ? '四角を追加しました。ダブルクリックで文字を編集。' : '文字を追加しました。ダブルクリックで編集。');
}
function duplicate() {
  const items = selected(); if (!items.length) return;
  change(() => { selection = new Set(duplicateSelection(doc, selection)); });
}
function removeSelected() { if (selection.size) change(() => { const removed = new Set(selected().flatMap(e => [e.id, ...(e.type === 'group' ? descendants(doc, e.id).map(child => child.id) : [])])); doc.elements = doc.elements.filter(e => !removed.has(e.id)); pruneEmptyGroups(doc); selection.clear(); }); }
function makeGroup() { change(() => { const group = groupSelection(doc, selection); selection = new Set([group.id]); collapsedGroups.delete(group.id); }); }
function breakGroup() { change(() => { selection = new Set(ungroupSelection(doc, selection)); }); }
function openTextEditor(id) { const e = doc.elements.find(e => e.id === id); if (!e || $('text-dialog').open) return; if (e.type === 'group') { collapsedGroups.delete(id); renderOutliner(); return; } editingId = id; $('edit-text').value = e.text; $('text-dialog').showModal(); $('edit-text').focus(); }
$('text-dialog').addEventListener('close', () => { if ($('text-dialog').returnValue === 'apply') change(() => { const e = doc.elements.find(e => e.id === editingId); if (e) { e.text = $('edit-text').value; fitTextElement(e); } }); editingId = null; });
function fitTextElement(e) {
  if (e.type !== 'text') return;
  measure.font = `${e.fontSize}px ${font}`;
  e.width = clamp(Math.ceil(Math.max(20, ...e.text.split('\n').map(line => measure.measureText(line).width)) + 8), 24, doc.canvas.width - e.x);
  e.height = clamp(Math.ceil(wrapText(e).length * e.fontSize * 1.45 + 4), 24, doc.canvas.height - e.y);
}
function point(event) { const r = svg.getBoundingClientRect(); return { x: (event.clientX - r.left) / scale, y: (event.clientY - r.top) / scale }; }
svg.addEventListener('pointerdown', event => {
  if (event.button !== 0 || gesture) return;
  svg.focus(); const p = point(event), handle = event.target.dataset.handle;
  if (handle && selected().length === 1) gesture = { kind: 'resize', start: p, before: copy(doc), original: copy(selected()[0]), handle, targetId: selected()[0].id };
  else if (event.target.dataset.move) gesture = { kind: 'move', start: p, before: copy(doc), originals: copy(selectionLeaves(doc, selection)) };
  else {
    const shape = event.target.closest('[data-id]');
    if (shape) {
      const id = event.altKey ? shape.dataset.id : rootForCanvas(doc, shape.dataset.id), multi = event.shiftKey || event.ctrlKey || event.metaKey;
      if (multi) selectItem(id, true); else if (!selection.has(id)) selection = new Set([id]);
      gesture = { kind: 'move', start: p, before: copy(doc), originals: copy(selectionLeaves(doc, selection)), tapId: multi ? null : id };
    } else {
      if (!event.shiftKey) selection.clear(); gesture = { kind: 'marquee', start: p, base: new Set(selection), before: copy(doc) };
    }
  }
  svg.setPointerCapture(event.pointerId); renderCanvas(); renderOutliner(); renderProperties(); event.preventDefault();
});
svg.addEventListener('pointermove', event => {
  if (!gesture) return; const p = point(event), dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
  if (gesture.kind === 'move') {
    const moved = copy(gesture.originals); moveItems(moved, dx, dy, doc.canvas);
    for (const e of moved) { const target = doc.elements.find(item => item.id === e.id); target.x = round(e.x); target.y = round(e.y); }
    refreshGroups(doc);
  } else if (gesture.kind === 'resize') { doc = copy(gesture.before); resizeNode(doc, gesture.targetId, resized(gesture.original, gesture.handle, dx, dy, doc.canvas)); }
  else {
    const x = clamp(Math.min(p.x, gesture.start.x), 0, doc.canvas.width), y = clamp(Math.min(p.y, gesture.start.y), 0, doc.canvas.height);
    const right = clamp(Math.max(p.x, gesture.start.x), 0, doc.canvas.width), bottom = clamp(Math.max(p.y, gesture.start.y), 0, doc.canvas.height);
    for (const [key, value] of Object.entries({ x, y, width: right - x, height: bottom - y, display: '' })) $('marquee').setAttribute(key, value);
    selection = new Set([...gesture.base, ...doc.elements.filter(e => e.x >= x && e.y >= y && e.x + e.width <= right && e.y + e.height <= bottom).map(e => e.id)]);
  }
  renderCanvas(); renderProperties();
});
function endGesture(event, cancel = false) {
  if (!gesture) return; const old = gesture; gesture = null;
  if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  $('marquee').setAttribute('display', 'none');
  if (cancel) { doc = old.before; render(); lastTap = null; }
  else {
    commit(old.before);
    const p = point(event);
    if (old.tapId && Math.hypot(p.x - old.start.x, p.y - old.start.y) * scale < 4) {
      if (lastTap && lastTap.id === old.tapId && event.timeStamp - lastTap.time < 400) { lastTap = null; openTextEditor(old.tapId); }
      else lastTap = { id: old.tapId, time: event.timeStamp };
    } else lastTap = null;
  }
}
svg.addEventListener('pointerup', event => endGesture(event));
svg.addEventListener('pointercancel', event => endGesture(event, true));
svg.addEventListener('lostpointercapture', event => { if (gesture) endGesture(event, true); });
svg.addEventListener('dblclick', event => {
  const shape = event.target.closest('[data-id]');
  if (shape) return openTextEditor(event.altKey ? shape.dataset.id : rootForCanvas(doc, shape.dataset.id));
  const p = point(event);
  const hit = [...paintOrder(doc)].reverse().find(e => p.x >= e.x && p.x <= e.x + e.width && p.y >= e.y && p.y <= e.y + e.height);
  if (hit) openTextEditor(event.altKey ? hit.id : rootForCanvas(doc, hit.id));
});

for (const key of ['name', 'x', 'y', 'width', 'height', 'text', 'fontSize', 'color', 'fill', 'stroke', 'strokeWidth', 'radius']) {
  $(`prop-${key}`).addEventListener('change', event => {
    if (selected().length !== 1) return; const input = event.target;
    if (input.type === 'number' && (!input.value.trim() || !Number.isFinite(Number(input.value)))) { render(); return; }
    change(() => {
      const e = selected()[0]; let value = input.value;
      if (input.type === 'number') value = Number(value);
      if (key === 'x') value = clamp(value, 0, doc.canvas.width - e.width);
      if (key === 'y') value = clamp(value, 0, doc.canvas.height - e.height);
      if (key === 'width') value = clamp(value, 24, doc.canvas.width - e.x);
      if (key === 'height') value = clamp(value, 24, doc.canvas.height - e.y);
      if (key === 'fontSize') value = clamp(value, 8, 120);
      if (key === 'strokeWidth') value = clamp(value, 0, 12);
      if (key === 'radius') value = clamp(value, 0, 80);
      if (['x', 'y', 'width', 'height'].includes(key)) resizeNode(doc, e.id, { x: e.x, y: e.y, width: e.width, height: e.height, [key]: value });
      else e[key] = value;
      if (key === 'text' || key === 'fontSize') fitTextElement(e);
      input.value = e[key];
    });
  });
}
for (const [dimension, min] of [['width', 320], ['height', 240]]) $('canvas-' + dimension).addEventListener('change', event => {
  const value = Number(event.target.value); if (!event.target.value.trim() || !Number.isFinite(value)) return render();
  const box = bounds(doc.elements), extent = box ? box[dimension === 'width' ? 'x' : 'y'] + box[dimension] : min;
  change(() => { doc.canvas[dimension] = clamp(value, Math.max(min, Math.ceil(extent)), 4096); });
  if (value < extent) toast('配置済みの要素が収まるサイズまでに調整しました。');
});
$('document-name').addEventListener('change', event => change(() => { doc.name = event.target.value.trim() || '無題のポンチ絵'; event.target.value = doc.name; }));
$('add-rect').addEventListener('click', () => addElement('rect'));
$('add-text').addEventListener('click', () => addElement('text'));
$('select-tool').addEventListener('click', () => svg.focus());
$('undo').addEventListener('click', () => history()); $('redo').addEventListener('click', () => history(true));
$('duplicate').addEventListener('click', duplicate); $('delete').addEventListener('click', removeSelected);
$('group-current').addEventListener('click', makeGroup); $('ungroup-current').addEventListener('click', breakGroup);
$('group-layout').addEventListener('change', event => change(() => { if (selected()[0]?.type === 'group') selected()[0].layout = event.target.value; }));
$('root-drop-zone').addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; $('root-drop-zone').classList.add('drop-inside'); });
$('root-drop-zone').addEventListener('dragleave', () => $('root-drop-zone').classList.remove('drop-inside'));
$('root-drop-zone').addEventListener('drop', event => { event.preventDefault(); $('root-drop-zone').classList.remove('drop-inside'); if (dragId) change(() => { dropNode(doc, dragId, null); selection = new Set([dragId]); }); dragId = null; });
document.querySelectorAll('[data-align]').forEach(button => button.addEventListener('click', () => change(() => {
  if (!alignSelection(doc, selection, button.dataset.align) && button.dataset.align.startsWith('distribute')) toast('均等配置する空間が足りません。両端の要素を離してください。');
})));
document.querySelectorAll('[data-order]').forEach(button => button.addEventListener('click', () => change(() => reorderSelection(doc, selection, button.dataset.order))));
$('zoom').addEventListener('change', resizeView);
$('grid-toggle').addEventListener('click', () => { gridVisible = !gridVisible; $('grid-toggle').setAttribute('aria-pressed', gridVisible); resizeView(); });
new ResizeObserver(() => resizeView()).observe($('viewport'));
$('help-button').addEventListener('click', () => $('help-dialog').showModal()); $('close-help').addEventListener('click', () => $('help-dialog').close());
$('new-document').addEventListener('click', () => { if (!doc.elements.length || confirm('新しい作業領域を作ります。現在の内容を残す場合は、先にJSON保存してください。')) change(() => { doc = blankDocument(); selection.clear(); }); });
function filename(extension) { return `${(doc.name || 'ponchi-maker').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80)}.${extension}`; }
function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
function saveJSON() { download(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), filename('json')); toast('JSONを保存しました。読み込むと再編集できます。'); }
$('export-json').addEventListener('click', saveJSON);
$('import-json').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('JSONファイルは2MB以下にしてください。');
    const imported = parseDocument(JSON.parse(await file.text()));
    reviewImport(imported, [], 'JSON');
  } catch (error) { toast(error instanceof SyntaxError ? 'JSONファイルを読み取れませんでした。内容を確認してください。' : error.message); }
  finally { event.target.value = ''; }
});
function showNotice(title, messages) {
  $('notice-title').textContent = title; $('notice-list').replaceChildren(...messages.map(message => { const li = document.createElement('li'); li.textContent = message; return li; })); $('notice-dialog').showModal();
}
function reviewImport(imported, warnings, format) {
  pendingImport = imported; $('import-summary').textContent = `${format}：${imported.name} · ${imported.elements.filter(e => e.type !== 'group').length}要素、${imported.elements.filter(e => e.type === 'group').length}グループ。現在の作業領域を置き換えます（元に戻せます）。`;
  $('import-warnings').replaceChildren(...warnings.map(message => { const li = document.createElement('li'); li.textContent = message; return li; })); $('import-dialog').showModal();
}
$('import-dialog').addEventListener('close', () => { if ($('import-dialog').returnValue === 'apply' && pendingImport) { change(() => { doc = pendingImport; selection.clear(); collapsedGroups.clear(); }); $('zoom').value = 'fit'; resizeView(); toast('レイアウトを読み込みました。'); } pendingImport = null; });
$('close-notice').addEventListener('click', () => $('notice-dialog').close());
$('import-qt').addEventListener('click', () => $('qt-file-input').click());
$('qt-file-input').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 2 * 1024 * 1024) throw new Error('.uiファイルは2MB以下にしてください。'); const imported = importQtUi(await file.text()); reviewImport(imported.doc, imported.warnings, 'Qt .ui'); }
  catch (error) { toast(error.message); } finally { event.target.value = ''; }
});
$('export-qt').addEventListener('click', () => {
  try { const { xml, warnings } = exportQtUi(doc); download(new Blob([xml], { type: 'application/xml;charset=utf-8' }), filename('ui')); const groups = doc.elements.filter(e => e.type === 'group'); showNotice('Qt .uiを書き出しました', [`${groups.filter(e => groupLayout(doc, e) === 'H').length} H / ${groups.filter(e => groupLayout(doc, e) === 'V').length} V / ${groups.filter(e => groupLayout(doc, e) === 'free').length} 自由配置グループ`, '四角・文字は基本的にQLabel、グループはQWidgetとQtレイアウトに変換します。Qt側のサイズ調整により見た目が変わる場合があります。', ...warnings]); }
  catch (error) { toast(error.message); }
});
$('export-png').addEventListener('click', async () => {
  const button = $('export-png'); button.disabled = true;
  try {
    await document.fonts.ready;
    const output = node('svg', { xmlns: NS, width: doc.canvas.width, height: doc.canvas.height, viewBox: `0 0 ${doc.canvas.width} ${doc.canvas.height}` });
    output.append(node('rect', { width: doc.canvas.width, height: doc.canvas.height, fill: 'white' }), ...paintOrder(doc).map(e => drawElement(e, false)));
    const image = new Image(); const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(output)], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('画像を生成できませんでした。')); image.src = url; });
      const canvas = document.createElement('canvas'); canvas.width = doc.canvas.width; canvas.height = doc.canvas.height;
      canvas.getContext('2d').drawImage(image, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); if (!blob) throw new Error('画像を書き出せませんでした。');
      download(blob, filename('png')); toast('PNGを書き出しました。ChatGPTへの添付に使えます。');
    } finally { URL.revokeObjectURL(url); }
  } catch (error) { toast(error.message); } finally { button.disabled = false; }
});
document.addEventListener('keydown', event => {
  if (event.isComposing || event.target.closest('input,textarea,select,[contenteditable=true]') || document.querySelector('dialog[open]') || gesture) return;
  const modifier = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
  if (modifier && key === 'z') { event.preventDefault(); history(event.shiftKey); }
  else if (modifier && key === 'y') { event.preventDefault(); history(true); }
  else if (modifier && key === 'd') { event.preventDefault(); duplicate(); }
  else if (modifier && key === 'g') { event.preventDefault(); if (event.shiftKey) breakGroup(); else makeGroup(); }
  else if (modifier && key === 'a') { event.preventDefault(); selection = new Set(childrenOf(doc).map(e => e.id)); render(); }
  else if (modifier && key === 's') { event.preventDefault(); saveJSON(); }
  else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected(); }
  else if (event.key === 'Escape') { selection.clear(); render(); }
  else if (event.key.startsWith('Arrow') && selection.size) { event.preventDefault(); const amount = event.shiftKey ? 10 : 1; change(() => moveSelection(doc, selection, event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0, event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0)); }
  else if (!modifier && !event.altKey) { if (key === 'r') addElement('rect'); if (key === 't') addElement('text'); if (key === 'v') svg.focus(); }
});
render();
if (!storageOK) toast('自動保存データを復元できませんでした。必要なJSONファイルを開いてください。');
persist();

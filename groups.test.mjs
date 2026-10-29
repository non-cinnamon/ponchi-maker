import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDocument, element, groupSelection, ungroupSelection, parseDocument, copy, childrenOf, selectionRoots, selectionLeaves, paintOrder, moveSelection, duplicateSelection, resizeNode, alignSelection, groupLayout, detectLayout, dropNode, reorderSelection, pruneEmptyGroups } from './model.js';

function fixture() { const doc = blankDocument(); doc.elements = [element('rect', { id: 'a', x: 50, y: 50, width: 100, height: 60 }), element('text', { id: 'b', x: 180, y: 50, width: 80, height: 60 }), element('rect', { id: 'c', x: 400, y: 200, width: 80, height: 80 })]; return doc; }
test('v1 JSON migrates without discarding contents', () => { const doc = fixture(); doc.version = 1; const imported = parseDocument(doc); assert.equal(imported.version, 2); assert.deepEqual(imported.elements, doc.elements); });
test('groups preserve positions and member order, support nesting and serialize', () => {
  const doc = fixture(), before = copy(doc.elements);
  const g = groupSelection(doc, ['a', 'b']); assert.equal(groupLayout(doc, g), 'H');
  assert.deepEqual(childrenOf(doc, g.id).map(e => e.id), ['a', 'b']);
  assert.deepEqual(paintOrder(doc).map(e => e.id), ['a', 'b', 'c']);
  assert.equal(doc.elements[0].x, before[0].x);
  const outer = groupSelection(doc, [g.id, 'c']);
  assert.equal(selectionLeaves(doc, [outer.id, 'a']).length, 3);
  assert.deepEqual(selectionRoots(doc, [outer.id, 'a']).map(e => e.id), [outer.id]);
  assert.deepEqual(parseDocument(JSON.parse(JSON.stringify(doc))), doc);
});
test('moving and resizing nested groups move every descendant exactly once and keep fonts', () => {
  const doc = fixture(), g = groupSelection(doc, ['a', 'b']), outer = groupSelection(doc, [g.id, 'c']);
  moveSelection(doc, [outer.id, 'a'], 10, 20);
  assert.equal(doc.elements.find(e => e.id === 'a').x, 60); assert.equal(doc.elements.find(e => e.id === 'a').y, 70);
  const before = copy(selectionLeaves(doc, [outer.id]));
  resizeNode(doc, outer.id, { x: outer.x, y: outer.y, width: outer.width * 2, height: outer.height * 2 });
  for (const e of before) { const next = doc.elements.find(item => item.id === e.id); assert.equal(next.width, e.width * 2); assert.equal(next.fontSize, e.fontSize); }
  assert.doesNotThrow(() => parseDocument(doc));
});
test('group resize rejects shrinking a child below minimum', () => { const doc = fixture(), g = groupSelection(doc, ['a', 'b']), before = copy(doc); resizeNode(doc, g.id, { x: 50, y: 50, width: 24, height: 24 }); assert.deepEqual(doc, before); });
test('ungroup preserves geometry, nested parents and sibling stacking', () => {
  const doc = fixture(), g = groupSelection(doc, ['a', 'b']), outer = groupSelection(doc, [g.id, 'c']);
  const before = copy(paintOrder(doc)); ungroupSelection(doc, [g.id]);
  assert.equal(doc.elements.find(e => e.id === 'a').parentId, outer.id);
  assert.deepEqual(paintOrder(doc).map(e => [e.id, e.x, e.y]), before.map(e => [e.id, e.x, e.y]));
  ungroupSelection(doc, [outer.id]); assert.equal(childrenOf(doc).length, 3); assert.doesNotThrow(() => parseDocument(doc));
});
test('dragging layers can enter/leave a group and rejects cycles', () => {
  const doc = fixture(), g = groupSelection(doc, ['a', 'b']);
  dropNode(doc, 'c', g.id); assert.equal(doc.elements.find(e => e.id === 'c').parentId, g.id);
  assert.throws(() => dropNode(doc, g.id, 'a', 'before'));
  dropNode(doc, 'c', null); assert.equal(doc.elements.find(e => e.id === 'c').parentId, undefined);
  dropNode(doc, 'a', null); dropNode(doc, 'b', null); assert.equal(doc.elements.some(e => e.id === g.id), false);
  assert.doesNotThrow(() => parseDocument(doc));
});
test('reordering members stays within siblings; group ordering stays atomic', () => {
  const doc = fixture(), g = groupSelection(doc, ['a', 'b']);
  reorderSelection(doc, ['a'], 'front'); assert.deepEqual(childrenOf(doc, g.id).map(e => e.id), ['b', 'a']);
  reorderSelection(doc, [g.id], 'front'); assert.deepEqual(paintOrder(doc).map(e => e.id), ['c', 'b', 'a']);
});
test('aligning a group translates children together', () => { const doc = fixture(), g = groupSelection(doc, ['a', 'b']); alignSelection(doc, [g.id, 'c'], 'top'); assert.equal(doc.elements.find(e => e.id === 'c').y, 50); assert.equal(doc.elements.find(e => e.id === 'a').x, 50); });
test('H/V detection handles unequal dimensions, reversed order, overlap and grids', () => {
  assert.equal(detectLayout([{ x: 200, y: 10, width: 80, height: 50 }, { x: 0, y: 20, width: 100, height: 40 }]), 'H');
  assert.equal(detectLayout([{ x: 10, y: 200, width: 80, height: 50 }, { x: 20, y: 0, width: 100, height: 40 }]), 'V');
  assert.equal(detectLayout([{ x: 0, y: 0, width: 100, height: 100 }, { x: 20, y: 20, width: 100, height: 100 }]), 'free');
  assert.equal(detectLayout([{ x: 0, y: 0, width: 40, height: 40 }, { x: 100, y: 100, width: 40, height: 40 }]), 'free');
});
test('JSON rejects cycles, orphan parents and empty groups', () => {
  const doc = fixture(), g = groupSelection(doc, ['a', 'b']);
  for (const mutate of [d => d.elements.find(e => e.id === g.id).parentId = g.id, d => d.elements[0].parentId = 'missing', d => d.elements[0].parentId = 'c', d => { d.elements = d.elements.filter(e => e.parentId !== g.id); }]) { const invalid = copy(doc); mutate(invalid); assert.throws(() => parseDocument(invalid)); }
});
test('deleting the last children prunes nested empty groups', () => { const doc = fixture(), g = groupSelection(doc, ['a', 'b']), outer = groupSelection(doc, [g.id, 'c']); doc.elements = doc.elements.filter(e => e.type === 'group'); pruneEmptyGroups(doc); assert.deepEqual(doc.elements, []); assert.ok(outer); });
test('duplicating nested groups preserves sibling stacking and remaps every parent', () => {
  const doc = fixture(); for (const e of doc.elements) e.name = e.id;
  const g = groupSelection(doc, ['a', 'b']), outer = groupSelection(doc, [g.id, 'c']);
  const originalOrder = paintOrder(doc).map(e => e.name), originalIds = new Set(doc.elements.map(e => e.id));
  const [clone] = duplicateSelection(doc, [outer.id, 'a']);
  assert.deepEqual(paintOrder(doc).slice(-3).map(e => e.name), originalOrder);
  assert.ok(!originalIds.has(clone));
  for (const e of selectionLeaves(doc, [clone])) { assert.ok(!originalIds.has(e.id)); assert.ok(!originalIds.has(e.parentId)); }
  assert.doesNotThrow(() => parseDocument(doc));
});

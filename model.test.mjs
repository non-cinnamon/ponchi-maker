import test from 'node:test';
import assert from 'node:assert/strict';
import { element, sampleDocument, blankDocument, copy, bounds, moveItems, resized, alignItems, reorder, parseDocument } from './model.js';

test('JSON round trip preserves the complete sample and layer order', () => {
  const original = sampleDocument();
  assert.deepEqual(parseDocument(JSON.parse(JSON.stringify(original))), original);
  assert.deepEqual(parseDocument(blankDocument()), blankDocument());
});
test('unsupported, malformed and oversized layouts are rejected without modifying source', () => {
  const original = sampleDocument();
  const variants = [
    d => d.version = 99, d => d.format = 'other', d => d.canvas.width = NaN,
    d => d.elements[0].text = 'a'.repeat(2001), d => d.elements[0].x = -1,
    d => d.elements[0].fill = 'url(https://example.com)', d => d.elements[0].width = 9000,
    d => d.elements[0].fontSize = Infinity, d => d.elements[0].id = d.elements[1].id,
    d => d.elements = Array(1001).fill(d.elements[0]), d => d.elements[0].type = 'script'
  ];
  for (const mutate of variants) { const invalid = copy(original); mutate(invalid); assert.throws(() => parseDocument(invalid)); }
  assert.equal(original.elements[0].x, 130);
});
test('alignment uses the combined bounds for differently sized objects', () => {
  for (const action of ['left', 'right', 'top', 'bottom', 'centerX', 'centerY']) {
    const items = [element('rect', { x: 30, y: 50, width: 40, height: 60 }), element('text', { x: 100, y: 120, width: 90, height: 30 })];
    const box = bounds(items); assert.equal(alignItems(items, action), true);
    for (const e of items) {
      if (action === 'left') assert.equal(e.x, box.x);
      if (action === 'right') assert.equal(e.x + e.width, box.x + box.width);
      if (action === 'top') assert.equal(e.y, box.y);
      if (action === 'bottom') assert.equal(e.y + e.height, box.y + box.height);
      if (action === 'centerX') assert.equal(e.x + e.width / 2, box.x + box.width / 2);
      if (action === 'centerY') assert.equal(e.y + e.height / 2, box.y + box.height / 2);
    }
  }
});
test('distribution keeps endpoints and equalizes gaps with unequal dimensions', () => {
  for (const axis of ['X', 'Y']) {
    const pos = axis === 'X' ? 'x' : 'y', size = axis === 'X' ? 'width' : 'height';
    const items = [element('rect', { [pos]: 20, [size]: 40 }), element('rect', { [pos]: 100, [size]: 80 }), element('rect', { [pos]: 400, [size]: 60 })];
    assert.equal(alignItems(items, 'distribute' + axis), true);
    assert.equal(items[0][pos], 20); assert.equal(items[2][pos], 400);
    assert.equal(items[1][pos] - items[0][pos] - items[0][size], items[2][pos] - items[1][pos] - items[1][size]);
  }
});
test('distribution refuses insufficient space instead of moving objects outside canvas', () => {
  const items = [element('rect', { x: 0, width: 24 }), element('rect', { x: 100, width: 900 }), element('rect', { x: 200, width: 24 })];
  const before = copy(items); assert.equal(alignItems(items, 'distributeX'), false); assert.deepEqual(items, before);
});
test('moving a selection preserves relative offsets and stays within canvas', () => {
  const items = [element('rect', { x: 10, y: 20, width: 40, height: 40 }), element('rect', { x: 90, y: 80, width: 40, height: 40 })];
  moveItems(items, -1000, 1000, { width: 320, height: 240 });
  assert.equal(items[0].x, 0); assert.equal(items[1].y + items[1].height, 240);
  assert.equal(items[1].x - items[0].x, 80); assert.equal(items[1].y - items[0].y, 60);
});
test('all resize handles preserve opposite edges, minimum size and fixed font size', () => {
  const original = element('rect', { x: 100, y: 100, width: 200, height: 150, fontSize: 18 });
  for (const handle of ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']) {
    const e = resized(original, handle, 30, 20, { width: 800, height: 600 });
    if (handle.includes('w')) assert.equal(e.x + e.width, 300);
    if (handle.includes('n')) assert.equal(e.y + e.height, 250);
    if (!handle.includes('w')) assert.equal(e.x, 100);
    if (!handle.includes('n')) assert.equal(e.y, 100);
    const tiny = resized(original, handle, 10000, 10000, { width: 800, height: 600 });
    assert.ok(tiny.width >= 24 && tiny.height >= 24); assert.ok(tiny.x + tiny.width <= 800 && tiny.y + tiny.height <= 600);
    assert.equal(original.fontSize, 18);
  }
});
test('layer commands move selected sets while preserving their internal order', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id }));
  const ids = values => values.map(e => e.id).join('');
  assert.equal(ids(reorder(items, ['b', 'c'], 'front')), 'adebc');
  assert.equal(ids(reorder(items, ['b', 'c'], 'back')), 'bcade');
  assert.equal(ids(reorder(items, ['b', 'c'], 'forward')), 'adbce');
  assert.equal(ids(reorder(items, ['b', 'c'], 'backward')), 'bcade');
  assert.equal(ids(reorder(items, ['e'], 'forward')), 'abcde');
  assert.equal(ids(items), 'abcde');
});

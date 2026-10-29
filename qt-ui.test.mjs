import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { element, blankDocument, groupSelection, groupLayout, selectionLeaves, parseDocument, sampleDocument } from './model.js';
import { exportQtUi, importQtUi } from './qt-ui.js';
class StrictParser { constructor() { return new DOMParser({ onError: (level, message) => { if (level !== 'warning') throw new Error(message); } }); } }
const parse = xml => new StrictParser().parseFromString(xml, 'application/xml');
const imported = xml => importQtUi(xml, StrictParser);
function grouped() {
  const doc = blankDocument();
  doc.elements = [element('rect', { id: 'a', name: 'ボタン<&"', x: 50, y: 50, width: 100, height: 60, text: '日本語<&"\n2行目' }), element('text', { id: 'b', name: 'label', x: 180, y: 50, width: 100, height: 60, text: '横' }), element('rect', { id: 'c', x: 50, y: 200, width: 230, height: 50, text: '下' })];
  const h = groupSelection(doc, ['a', 'b']); h.name = '横グループ'; const v = groupSelection(doc, [h.id, 'c']); v.name = '縦グループ'; return doc;
}
test('Qt export generates real nested H/V layouts and escaped Unicode text', () => {
  const { xml } = exportQtUi(grouped()), tree = parse(xml);
  assert.equal(tree.documentElement.tagName, 'ui'); assert.equal(tree.documentElement.getAttribute('version'), '4.0');
  const layouts = [...Array.from(tree.getElementsByTagName('layout'))].map(e => e.getAttribute('class'));
  assert.deepEqual(layouts, ['QVBoxLayout', 'QHBoxLayout']);
  assert.ok(xml.includes('&lt;&amp;&quot;')); assert.ok(xml.includes('日本語'));
  const names = Array.from(tree.getElementsByTagName('widget')).map(e => e.getAttribute('name'));
  assert.equal(new Set(names).size, names.length);
});
test('export/import retains nested groups, direction, labels and geometry', () => {
  const doc = grouped(), result = imported(exportQtUi(doc).xml).doc;
  assert.equal(result.elements.filter(e => e.type === 'group').length, 2);
  for (const original of doc.elements.filter(e => e.type !== 'group')) {
    const actual = result.elements.find(e => e.type !== 'group' && e.text === original.text);
    assert.ok(actual); for (const key of ['x', 'y', 'width', 'height', 'fontSize', 'name', 'type']) assert.equal(actual[key], original[key], key);
  }
  assert.deepEqual(result.elements.filter(e => e.type === 'group').map(e => groupLayout(result, e)).sort(), ['H', 'V']);
  assert.doesNotThrow(() => parseDocument(result));
});
test('free groups retain overlapping layers and are not forced into layouts', () => {
  const doc = blankDocument(); doc.elements = [element('rect', { id: 'a' }), element('rect', { id: 'b' })]; groupSelection(doc, ['a', 'b']);
  const { xml, warnings } = exportQtUi(doc); assert.equal(parse(xml).getElementsByTagName('layout').length, 0); assert.equal(warnings.length, 1);
  const result = imported(xml).doc; assert.equal(result.elements.filter(e => e.type === 'group').length, 1); assert.equal(selectionLeaves(result, result.elements.filter(e => e.type === 'group').map(e => e.id)).length, 2);
});
test('ordinary Qt Designer box layouts without geometry get usable positions', () => {
  const result = imported(`<?xml version="1.0"?><ui version="4.0"><class>Dialog</class><widget class="QDialog" name="Dialog"><property name="geometry"><rect><x>0</x><y>0</y><width>600</width><height>400</height></rect></property><layout class="QVBoxLayout" name="verticalLayout"><item><widget class="QLabel" name="label"><property name="text"><string>見出し</string></property></widget></item><item><layout class="QHBoxLayout" name="horizontalLayout"><item><widget class="QPushButton" name="ok"><property name="text"><string>OK</string></property></widget></item><item><widget class="QLineEdit" name="input"><property name="text"><string>入力欄</string></property></widget></item></layout></item></layout></widget><resources/><connections/></ui>`).doc;
  assert.equal(result.elements.filter(e => e.type !== 'group').length, 3); assert.equal(result.elements.filter(e => e.type === 'group').length, 2);
  assert.ok(result.elements.some(e => e.qtClass === 'QPushButton')); assert.ok(result.elements.every(e => e.x >= 0 && e.y >= 0));
  const roundTrip = imported(exportQtUi(result).xml).doc; assert.ok(roundTrip.elements.some(e => e.qtClass === 'QLineEdit'));
});
test('absolute nested Qt widgets use parent-relative coordinates and zorder', () => {
  const xml = `<ui version="4.0"><class>Form</class><widget class="QWidget" name="Form"><widget class="QWidget" name="panel"><property name="geometry"><rect><x>100</x><y>80</y><width>300</width><height>200</height></rect></property><widget class="QPushButton" name="button"><property name="geometry"><rect><x>20</x><y>30</y><width>100</width><height>40</height></rect></property><property name="text"><string>Button</string></property></widget></widget></widget></ui>`;
  const doc = imported(xml).doc, button = doc.elements.find(e => e.qtClass === 'QPushButton'); assert.equal(button.x, 120); assert.equal(button.y, 110); assert.ok(button.parentId);
});
test('Qt grid/form layouts import with an explicit approximation notice', () => {
  const { doc, warnings } = imported(`<ui version="4.0"><class>Form</class><widget class="QWidget" name="Form"><layout class="QGridLayout" name="grid"><item row="0" column="0"><widget class="QLabel" name="a"/></item><item row="1" column="1"><widget class="QLineEdit" name="b"/></item></layout></widget></ui>`);
  assert.equal(doc.elements.filter(e => e.type !== 'group').length, 2); assert.ok(warnings.some(w => w.includes('セル位置')));
});
test('unsafe, malformed, oversized or deeply nested XML is rejected', () => {
  for (const xml of ['<not-ui/>', '<ui><widget></ui>', '<!DOCTYPE ui [<!ENTITY foo SYSTEM "file:///secret">]><ui/>', '<ui/>', 'x'.repeat(2 * 1024 * 1024 + 1), `<ui><widget class="QWidget" name="Form">${'<widget class="QWidget" name="nested">'.repeat(34)}${'</widget>'.repeat(34)}</widget></ui>`]) assert.throws(() => imported(xml));
});
test('sample without groups still produces a valid importable UI', () => { const doc = sampleDocument(), result = imported(exportQtUi(doc).xml).doc; assert.equal(result.elements.length, doc.elements.length); assert.equal(result.name, doc.name); });

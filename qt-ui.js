import { element, blankDocument, parseDocument, childrenOf, groupLayout, refreshGroups, clamp, QT_CLASSES } from './model.js?v=2.0.0';

const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const int = value => Math.round(value);
const property = (name, xml, dynamic = false) => `<property name="${name}"${dynamic ? ' stdset="0"' : ''}>${xml}</property>`;
const str = (name, value, dynamic = false) => property(name, `<string>${esc(value)}</string>`, dynamic);
const num = (name, value) => property(name, `<number>${int(value)}</number>`);
const rectXML = (x, y, width, height) => property('geometry', `<rect><x>${int(x)}</x><y>${int(y)}</y><width>${Math.max(1, int(width))}</width><height>${Math.max(1, int(height))}</height></rect>`);

export function exportQtUi(input) {
  const doc = parseDocument(input), warnings = [], used = new Set(['PonchiForm']);
  const names = new Map(doc.elements.map((e, i) => {
    let base = (e.name || `${e.type}_${i + 1}`).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^([0-9])/, '_$1');
    if (!/[a-zA-Z]/.test(base)) base = `${e.type}_${i + 1}`;
    let name = base, n = 2; while (used.has(name)) name = `${base}_${n++}`; used.add(name); return [e.id, name];
  }));
  function spacer(size, horizontal, name) {
    return `<item><spacer name="${name}">${property('orientation', `<enum>Qt::${horizontal ? 'Horizontal' : 'Vertical'}</enum>`)}${property('sizeType', '<enum>QSizePolicy::Fixed</enum>')}${property('sizeHint', `<size><width>${horizontal ? size : 0}</width><height>${horizontal ? 0 : size}</height></size>`)}</spacer></item>`;
  }
  function widget(e, origin = { x: 0, y: 0 }) {
    const name = names.get(e.id), group = e.type === 'group';
    const qtClass = group ? 'QWidget' : (e.qtClass || 'QLabel');
    const data = [rectXML(e.x - origin.x, e.y - origin.y, e.width, e.height), str('ponchiName', e.name, true), str('ponchiType', e.type, true)];
    if (group) {
      const direction = groupLayout(doc, e), children = childrenOf(doc, e.id);
      data.push(str('ponchiLayout', e.layout || 'auto', true));
      if (direction === 'H' || direction === 'V') {
        const horizontal = direction === 'H', pos = horizontal ? 'x' : 'y', size = horizontal ? 'width' : 'height';
        const sorted = [...children].sort((a, b) => a[pos] - b[pos]);
        const items = [];
        sorted.forEach((child, i) => {
          if (i) { const gap = Math.max(0, int(child[pos] - sorted[i - 1][pos] - sorted[i - 1][size])); if (gap) items.push(spacer(gap, horizontal, `${name}_gap_${i}`)); }
          items.push(`<item>${widget(child, e)}</item>`);
        });
        data.push(`<layout class="Q${horizontal ? 'H' : 'V'}BoxLayout" name="${name}_layout">${['leftMargin', 'topMargin', 'rightMargin', 'bottomMargin', 'spacing'].map(key => num(key, 0)).join('')}${items.join('')}</layout>`);
      } else {
        if (e.layout === 'auto' && children.length > 1) warnings.push(`${e.name || name}：重なり・複数列のため自由配置で出力`);
        data.push(...children.map(child => widget(child, e)), ...children.map(child => `<zorder>${names.get(child.id)}</zorder>`));
      }
    } else {
      if (['QWidget', 'QGroupBox', 'QFrame'].includes(qtClass)) { if (qtClass === 'QGroupBox') data.push(str('title', e.text)); }
      else if (['QTextEdit', 'QPlainTextEdit'].includes(qtClass)) data.push(str('plainText', e.text));
      else if (!['QProgressBar', 'QSlider', 'QSpinBox', 'QDoubleSpinBox', 'QListWidget', 'QTreeWidget', 'QTableWidget'].includes(qtClass)) {
        if (qtClass === 'QComboBox') data.push(`<item>${str('text', e.text)}</item>`);
        else data.push(str('text', e.text));
      }
      data.push(property('font', `<font><pointsize>${Math.max(1, int(e.fontSize * 72 / 96))}</pointsize></font>`));
      if (['QLabel', 'QLineEdit'].includes(qtClass)) data.push(property('alignment', '<set>Qt::AlignCenter</set>'));
      if (qtClass === 'QLabel') data.push(property('wordWrap', '<bool>true</bool>'));
      data.push(str('styleSheet', `${qtClass}#${name} { color: ${e.color}; background-color: ${e.type === 'text' ? 'transparent' : e.fill}; border: ${e.type === 'text' ? '0' : e.strokeWidth}px solid ${e.stroke}; border-radius: ${e.radius}px; font-size: ${e.fontSize}px; }`));
    }
    return `<widget class="${qtClass}" name="${name}">${data.join('')}</widget>`;
  }
  const root = childrenOf(doc);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ui version="4.0"><class>PonchiForm</class><widget class="QWidget" name="PonchiForm">${rectXML(0, 0, doc.canvas.width, doc.canvas.height)}${str('windowTitle', doc.name)}${root.map(e => widget(e)).join('')}${root.map(e => `<zorder>${names.get(e.id)}</zorder>`).join('')}</widget><resources/><connections/></ui>\n`;
  return { xml, warnings };
}

const elements = node => Array.from(node?.childNodes || []).filter(child => child.nodeType === 1);
const tags = (node, tag) => elements(node).filter(child => child.tagName === tag);
const first = (node, tag) => tags(node, tag)[0];
const prop = (node, name) => tags(node, 'property').find(child => child.getAttribute('name') === name);
const propText = (node, name, fallback = '') => prop(node, name)?.textContent ?? fallback;
const propNumber = (node, name, fallback = 0) => { const value = propText(node, name); return value.trim() && Number.isFinite(Number(value)) ? Number(value) : fallback; };
const childNumber = (node, tag, fallback = 0) => { const value = first(node, tag)?.textContent; return value != null && value.trim() && Number.isFinite(Number(value)) ? Number(value) : fallback; };
function geometry(node) {
  const r = first(prop(node, 'geometry'), 'rect');
  if (!r) return null;
  const width = childNumber(r, 'width'), height = childNumber(r, 'height');
  return { x: childNumber(r, 'x'), y: childNumber(r, 'y'), width: Math.max(24, width), height: Math.max(24, height) };
}
function preferredSize(node) {
  if (node.tagName === 'spacer') { const size = first(prop(node, 'sizeHint'), 'size'); return { width: childNumber(size, 'width', 20), height: childNumber(size, 'height', 20) }; }
  const geom = geometry(node); if (geom) return geom;
  const minimum = first(prop(node, 'minimumSize'), 'size');
  const label = node.getAttribute('class') === 'QLabel';
  return { width: Math.max(24, childNumber(minimum, 'width', 120)), height: Math.max(24, childNumber(minimum, 'height', label ? 32 : 40)) };
}

export function importQtUi(xml, Parser = globalThis.DOMParser) {
  if (typeof xml !== 'string' || xml.length > 2 * 1024 * 1024) throw new Error('.uiファイルは2MB以下にしてください。');
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml)) throw new Error('DOCTYPE・外部エンティティを含む.uiには対応していません。');
  if (!Parser) throw new Error('このブラウザではXMLを読み込めません。');
  let parsed;
  try { parsed = new Parser().parseFromString(xml, 'application/xml'); }
  catch { throw new Error('.uiのXMLを読み取れません。'); }
  if (!parsed?.documentElement || parsed.getElementsByTagName('parsererror').length || parsed.documentElement.tagName !== 'ui') throw new Error('有効なQt Designerの.uiファイルを選んでください。');
  const root = first(parsed.documentElement, 'widget');
  if (!root) throw new Error('.uiにルートウィジェットがありません。');
  if (parsed.getElementsByTagName('widget').length > 1001) throw new Error('グループを含め1000要素までです。');
  const doc = blankDocument(), warnings = new Set();
  const canvas = geometry(root) || { width: 800, height: 600 };
  doc.canvas = { width: clamp(canvas.width, 320, 4096), height: clamp(canvas.height, 240, 4096) };
  doc.name = propText(root, 'windowTitle', root.getAttribute('name') || 'Qtから読み込み').slice(0, 80);
  if (canvas.width > 4096 || canvas.height > 4096) warnings.add('作業領域の上限4096pxに合わせて調整しました。');
  let adjusted = false;
  function safeBox(box) {
    const x = clamp(box.x, 0, doc.canvas.width - 24), y = clamp(box.y, 0, doc.canvas.height - 24);
    const width = clamp(box.width, 24, doc.canvas.width - x), height = clamp(box.height, 24, doc.canvas.height - y);
    if (x !== box.x || y !== box.y || width !== box.width || height !== box.height) adjusted = true;
    return { x, y, width, height };
  }
  function addGroup(name, box, parentId, direction = 'auto') {
    const group = element('group', { ...safeBox(box), name: name.slice(0, 100), text: '', layout: direction, ...(parentId ? { parentId } : {}) });
    doc.elements.push(group); return group;
  }
  function walkLayout(layout, box, parentId, depth) {
    if (depth > 32) throw new Error('グループは32階層までです。');
    const cls = layout.getAttribute('class'), items = tags(layout, 'item');
    if (!['QVBoxLayout', 'QHBoxLayout', 'QGridLayout', 'QFormLayout'].includes(cls)) warnings.add(`${cls || '不明なレイアウト'}は簡略配置で読み込みました。`);
    const horizontal = cls === 'QHBoxLayout', grid = ['QGridLayout', 'QFormLayout'].includes(cls);
    const margin = propNumber(layout, 'margin', 9), spacing = Math.max(0, propNumber(layout, 'spacing', 6));
    const left = Math.max(0, propNumber(layout, 'leftMargin', margin)), top = Math.max(0, propNumber(layout, 'topMargin', margin));
    const right = Math.max(0, propNumber(layout, 'rightMargin', margin)), bottom = Math.max(0, propNumber(layout, 'bottomMargin', margin));
    const inner = { x: box.x + left, y: box.y + top, width: Math.max(24, box.width - left - right), height: Math.max(24, box.height - top - bottom) };
    const content = items.map(item => elements(item).find(child => ['widget', 'layout', 'spacer'].includes(child.tagName))).filter(Boolean);
    if (grid) warnings.add('グリッド・フォーム配置はセル位置から簡略再現しています。');
    const rows = Math.max(1, ...items.map(item => Number(item.getAttribute('row') || 0) + Math.max(1, Number(item.getAttribute('rowspan') || 1))));
    const cols = Math.max(1, ...items.map(item => Number(item.getAttribute('column') || 0) + Math.max(1, Number(item.getAttribute('colspan') || 1))));
    const size = horizontal ? 'width' : 'height', crossSize = horizontal ? 'height' : 'width';
    const preferred = content.map(preferredSize), total = preferred.reduce((sum, p) => sum + p[size], 0);
    const usable = Math.max(24 * content.length, inner[size] - Math.max(0, content.length - 1) * spacing);
    let cursor = horizontal ? inner.x : inner.y;
    for (let i = 0; i < items.length; i++) {
      const item = items[i], child = elements(item).find(e => ['widget', 'layout', 'spacer'].includes(e.tagName)); if (!child) continue;
      const index = content.indexOf(child), length = Math.max(child.tagName === 'spacer' ? 0 : 24, usable * preferred[index][size] / Math.max(1, total));
      let slot;
      if (grid) {
        const row = Number(item.getAttribute('row') || 0), column = Number(item.getAttribute('column') || 0);
        const rs = Math.max(1, Number(item.getAttribute('rowspan') || 1)), cs = Math.max(1, Number(item.getAttribute('colspan') || 1));
        if (![row, column, rs, cs, rows, cols].every(Number.isFinite) || row < 0 || column < 0 || rows > 1000 || cols > 1000) throw new Error('レイアウトの行・列指定が不正です。');
        slot = { x: inner.x + column * inner.width / cols, y: inner.y + row * inner.height / rows, width: Math.max(24, inner.width * cs / cols - spacing), height: Math.max(24, inner.height * rs / rows - spacing) };
      } else slot = { x: horizontal ? cursor : inner.x, y: horizontal ? inner.y : cursor, width: horizontal ? length : inner[crossSize], height: horizontal ? inner[crossSize] : length };
      cursor += length + spacing;
      if (child.tagName === 'spacer') continue;
      if (child.tagName === 'layout') {
        const direction = child.getAttribute('class') === 'QHBoxLayout' ? 'H' : child.getAttribute('class') === 'QVBoxLayout' ? 'V' : 'free';
        const group = addGroup(child.getAttribute('name') || 'レイアウト', slot, parentId, direction);
        walkLayout(child, slot, group.id, depth + 1);
        if (!childrenOf(doc, group.id).length) doc.elements = doc.elements.filter(e => e.id !== group.id);
      } else walkWidget(child, slot, parentId, depth + 1, box, true);
    }
  }
  function orderedWidgets(widget) {
    const children = tags(widget, 'widget'), zorder = tags(widget, 'zorder').map(e => e.textContent.trim());
    if (!zorder.length) return children;
    return [...children.filter(e => !zorder.includes(e.getAttribute('name'))), ...zorder.map(name => children.find(e => e.getAttribute('name') === name)).filter(Boolean)];
  }
  function walkWidget(widget, fallback, parentId, depth, origin = { x: 0, y: 0 }, inLayout = false, isRoot = false) {
    if (depth > 32) throw new Error('グループは32階層までです。');
    const local = geometry(widget), box = isRoot ? fallback : local ? { ...local, x: origin.x + local.x, y: origin.y + local.y } : fallback;
    const layouts = tags(widget, 'layout'), children = orderedWidgets(widget), cls = widget.getAttribute('class') || 'QWidget';
    if (isRoot) {
      layouts.forEach(layout => {
        const direction = layout.getAttribute('class') === 'QHBoxLayout' ? 'H' : layout.getAttribute('class') === 'QVBoxLayout' ? 'V' : 'free';
        const group = addGroup(layout.getAttribute('name') || 'ルートレイアウト', box, null, direction);
        walkLayout(layout, box, group.id, depth + 1);
        if (!childrenOf(doc, group.id).length) doc.elements = doc.elements.filter(e => e.id !== group.id);
      });
      children.forEach(child => walkWidget(child, box, null, depth + 1, box)); return;
    }
    if (layouts.length || children.length) {
      const layoutClass = layouts[0]?.getAttribute('class');
      const defaultDirection = layoutClass === 'QHBoxLayout' ? 'H' : layoutClass === 'QVBoxLayout' ? 'V' : 'free';
      const setting = propText(widget, 'ponchiLayout', defaultDirection);
      const group = addGroup(propText(widget, 'ponchiName', widget.getAttribute('name') || cls), box, parentId, ['auto', 'H', 'V', 'free'].includes(setting) ? setting : 'auto');
      layouts.forEach(layout => walkLayout(layout, box, group.id, depth + 1));
      children.forEach(child => walkWidget(child, box, group.id, depth + 1, box));
      if (!childrenOf(doc, group.id).length) doc.elements = doc.elements.filter(e => e.id !== group.id);
      if (['QTabWidget', 'QStackedWidget', 'QToolBox', 'QScrollArea'].includes(cls)) warnings.add(`${cls}のページ・スクロール動作は簡略化しています。`);
      return;
    }
    if (!QT_CLASSES.includes(cls)) warnings.add(`${cls}はラベルに置き換えて読み込みました。`);
    const css = propText(widget, 'styleSheet');
    const cssValue = name => css.match(new RegExp(`(?:^|[;{])\\s*${name}\\s*:\\s*([^;}]+)`, 'i'))?.[1]?.trim();
    const cssColor = (name, fallbackColor) => /^#[0-9a-f]{6}$/i.test(cssValue(name) || '') ? cssValue(name) : fallbackColor;
    const fontNode = first(prop(widget, 'font'), 'font');
    const fontSize = parseFloat(cssValue('font-size')) || childNumber(fontNode, 'pixelsize', childNumber(fontNode, 'pointsize', 13.5) * 96 / 72);
    const explicitType = propText(widget, 'ponchiType');
    const type = ['rect', 'text'].includes(explicitType) ? explicitType : cls === 'QLabel' && !cssValue('border') && propNumber(widget, 'frameShape') === 0 ? 'text' : 'rect';
    const border = cssValue('border')?.match(/([\d.]+)px\s+solid\s+(#[0-9a-f]{6})/i);
    let text = propText(widget, 'text', propText(widget, 'plainText', propText(widget, 'title', propText(widget, 'placeholderText', ''))));
    if (!text && cls === 'QComboBox') text = propText(tags(widget, 'item')[0], 'text');
    if (!text && ['QSpinBox', 'QDoubleSpinBox', 'QProgressBar'].includes(cls)) text = String(propNumber(widget, 'value'));
    if (!text && prop(widget, 'html')) { const html = propText(widget, 'html'); text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); warnings.add('リッチテキストはプレーンテキストに変換しました。'); }
    if (text.length > 2000) { text = text.slice(0, 2000); warnings.add('2000文字を超える文字列は切り詰めました。'); }
    const e = element(type, { ...safeBox(box), name: propText(widget, 'ponchiName', widget.getAttribute('name') || cls).slice(0, 100), text,
      fontSize: clamp(fontSize, 8, 120), color: cssColor('color', '#42465d'), fill: cssColor('background-color', '#ffffff'),
      stroke: border?.[2] || '#9ba2b9', strokeWidth: border ? clamp(Number(border[1]), 0, 12) : 1.5,
      radius: clamp(parseFloat(cssValue('border-radius')) || 0, 0, 80), ...(parentId ? { parentId } : {}) });
    if ((cls !== 'QLabel' || !prop(widget, 'ponchiType')) && QT_CLASSES.includes(cls)) e.qtClass = cls;
    doc.elements.push(e);
  }
  walkWidget(root, { x: 0, y: 0, ...doc.canvas }, null, 0, { x: 0, y: 0 }, false, true);
  if (doc.elements.length > 1000) throw new Error('グループを含め1000要素までです。');
  if (adjusted) warnings.add('作業領域外・24px未満の要素を調整しました。');
  const connections = first(parsed.documentElement, 'connections'), resources = first(parsed.documentElement, 'resources');
  if (elements(connections).length || elements(resources).length || parsed.getElementsByTagName('action').length) warnings.add('シグナル接続・リソース・アクションは読み込み対象外です。');
  warnings.add('Qtの動作・全プロパティを保持する編集ではなく、画面レイアウトの変換です。');
  refreshGroups(doc);
  return { doc: parseDocument(doc), warnings: [...warnings] };
}

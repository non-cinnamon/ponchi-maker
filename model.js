export const FORMAT = 'ponchi-maker';
export const VERSION = 2;
export const MIN_SIZE = 24;
export const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));
export const copy = value => JSON.parse(JSON.stringify(value));
export const uid = () => crypto.randomUUID();

export function element(type, overrides = {}) {
  return { id: uid(), type, name: '', x: 80, y: 80, width: type === 'text' ? 180 : 220,
    height: type === 'text' ? 40 : 120, text: type === 'text' ? 'テキスト' : '四角',
    fontSize: 18, color: '#42465d', fill: '#ffffff', stroke: '#9ba2b9', strokeWidth: 1.5,
    radius: 6, ...overrides };
}
export function blankDocument() {
  return { format: FORMAT, version: VERSION, name: '無題のポンチ絵', canvas: { width: 1200, height: 800 }, elements: [] };
}
export function sampleDocument() {
  const doc = blankDocument();
  doc.name = 'はじめてのポンチ絵';
  doc.elements = [
    element('rect', { name: 'ウィンドウ', x: 130, y: 130, width: 940, height: 540, text: '', fill: '#ffffff', stroke: '#b1b7ca', radius: 12 }),
    element('rect', { name: 'ヘッダー', x: 150, y: 150, width: 900, height: 65, text: 'アプリケーションのタイトル', fill: '#f1f0fb', stroke: '#dedbf2', fontSize: 20 }),
    element('rect', { name: 'サイドバー', x: 150, y: 235, width: 210, height: 415, text: 'サイドバー\n\nメニュー A\nメニュー B\nメニュー C', fill: '#f7f8fc', stroke: '#e0e3ed', fontSize: 17 }),
    element('text', { name: '見出し', x: 410, y: 261, width: 600, height: 38, text: 'ここに、つくりたい画面を。', fontSize: 26, color: '#4c496d' }),
    element('text', { name: '説明', x: 410, y: 314, width: 600, height: 36, text: '四角と文字を動かして、アイデアを伝えよう。', fontSize: 17, color: '#9399ad' }),
    element('rect', { name: 'メインエリア', x: 410, y: 380, width: 600, height: 155, text: 'メインエリア', fill: '#fafafd', stroke: '#c7ccdb', fontSize: 20 }),
    element('rect', { name: 'キャンセルボタン', x: 650, y: 570, width: 165, height: 48, text: 'キャンセル', stroke: '#d9dce7', fontSize: 16 }),
    element('rect', { name: '保存ボタン', x: 835, y: 570, width: 175, height: 48, text: '保存する', fill: '#e9e7fb', stroke: '#c4beed', color: '#675bb3', fontSize: 16 })
  ];
  return doc;
}
export function bounds(items) {
  if (!items.length) return null;
  const x = Math.min(...items.map(e => e.x)), y = Math.min(...items.map(e => e.y));
  return { x, y, width: Math.max(...items.map(e => e.x + e.width)) - x,
    height: Math.max(...items.map(e => e.y + e.height)) - y };
}
export function moveItems(items, dx, dy, canvas) {
  const box = bounds(items);
  if (!box) return;
  dx = clamp(dx, -box.x, canvas.width - box.x - box.width);
  dy = clamp(dy, -box.y, canvas.height - box.y - box.height);
  for (const e of items) { e.x += dx; e.y += dy; }
}
export function resized(original, handle, dx, dy, canvas) {
  let { x, y, width, height } = original;
  const right = x + width, bottom = y + height;
  if (handle.includes('w')) { x = clamp(x + dx, 0, right - MIN_SIZE); width = right - x; }
  if (handle.includes('e')) width = clamp(width + dx, MIN_SIZE, canvas.width - x);
  if (handle.includes('n')) { y = clamp(y + dy, 0, bottom - MIN_SIZE); height = bottom - y; }
  if (handle.includes('s')) height = clamp(height + dy, MIN_SIZE, canvas.height - y);
  return { x, y, width, height };
}
export function alignItems(items, action) {
  if (items.length < 2) return false;
  const box = bounds(items);
  if (action.startsWith('distribute')) {
    if (items.length < 3) return false;
    const horizontal = action === 'distributeX', pos = horizontal ? 'x' : 'y', size = horizontal ? 'width' : 'height';
    const sorted = [...items].sort((a, b) => a[pos] - b[pos]);
    const first = sorted[0], last = sorted.at(-1);
    const gap = (last[pos] + last[size] - first[pos] - sorted.reduce((sum, e) => sum + e[size], 0)) / (items.length - 1);
    if (gap < 0) return false;
    let cursor = first[pos] + first[size] + gap;
    for (let i = 1; i < sorted.length - 1; i++) { sorted[i][pos] = cursor; cursor += sorted[i][size] + gap; }
    return true;
  }
  for (const e of items) {
    if (action === 'left') e.x = box.x;
    if (action === 'right') e.x = box.x + box.width - e.width;
    if (action === 'centerX') e.x = box.x + (box.width - e.width) / 2;
    if (action === 'top') e.y = box.y;
    if (action === 'bottom') e.y = box.y + box.height - e.height;
    if (action === 'centerY') e.y = box.y + (box.height - e.height) / 2;
  }
  return true;
}
export function reorder(items, ids, action) {
  const chosen = new Set(ids);
  if (action === 'front') return [...items.filter(e => !chosen.has(e.id)), ...items.filter(e => chosen.has(e.id))];
  if (action === 'back') return [...items.filter(e => chosen.has(e.id)), ...items.filter(e => !chosen.has(e.id))];
  const result = [...items];
  if (action === 'forward') {
    for (let i = result.length - 2; i >= 0; i--) if (chosen.has(result[i].id) && !chosen.has(result[i + 1].id)) [result[i], result[i + 1]] = [result[i + 1], result[i]];
  } else {
    for (let i = 1; i < result.length; i++) if (chosen.has(result[i].id) && !chosen.has(result[i - 1].id)) [result[i], result[i - 1]] = [result[i - 1], result[i]];
  }
  return result;
}
export function parseDocument(raw) {
  const fail = message => { throw new Error(message); };
  if (!raw || raw.format !== FORMAT) fail('ponchi-maker形式のJSONを選んでください。');
  if (![1, VERSION].includes(raw.version)) fail('このJSONのバージョンには対応していません。');
  const number = (value, min, max, label) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label}が不正です。`);
    return value;
  };
  const string = (value, max, label) => {
    if (typeof value !== 'string' || value.length > max) fail(`${label}が不正です。`);
    return value;
  };
  const color = value => { if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) fail('色の指定が不正です。'); return value; };
  const width = number(raw.canvas?.width, 320, 4096, '作業領域の幅');
  const height = number(raw.canvas?.height, 240, 4096, '作業領域の高さ');
  if (!Array.isArray(raw.elements) || raw.elements.length > 1000) fail('要素数は1000個までです。');
  const ids = new Set();
  const elements = raw.elements.map(e => {
    if (!e || !['rect', 'text', 'group'].includes(e.type)) fail('要素の種類が不正です。');
    const id = string(e.id, 100, '要素ID');
    if (!id || ids.has(id)) fail('要素IDが空、または重複しています。');
    ids.add(id);
    const x = number(e.x, 0, width - MIN_SIZE, 'X座標'), y = number(e.y, 0, height - MIN_SIZE, 'Y座標');
    const result = { id, type: e.type, name: string(e.name, 100, '管理用の名前'), x, y,
      width: number(e.width, MIN_SIZE, width - x + 0.001, '要素の幅'), height: number(e.height, MIN_SIZE, height - y + 0.001, '要素の高さ'),
      text: string(e.text, 2000, '文字'), fontSize: number(e.fontSize, 8, 120, '文字サイズ'),
      color: color(e.color), fill: color(e.fill), stroke: color(e.stroke),
      strokeWidth: number(e.strokeWidth, 0, 12, '枠線の太さ'), radius: number(e.radius, 0, 80, '角の丸み') };
    if (e.parentId != null) result.parentId = string(e.parentId, 100, '親グループID');
    if (e.type === 'group') {
      if (!['auto', 'H', 'V', 'free'].includes(e.layout ?? 'auto')) fail('グループの配置指定が不正です。');
      result.layout = e.layout ?? 'auto';
    }
    if (e.qtClass != null) {
      if (!QT_CLASSES.includes(e.qtClass)) fail('未対応のQtウィジェットです。');
      result.qtClass = e.qtClass;
    }
    return result;
  });
  const result = { format: FORMAT, version: VERSION, name: string(raw.name, 80, 'ドキュメント名'), canvas: { width, height }, elements };
  const map = new Map(elements.map(e => [e.id, e]));
  for (const e of elements) {
    let current = e; const visited = new Set([e.id]); let depth = 0;
    while (current.parentId != null) {
      const parent = map.get(current.parentId);
      if (!parent || parent.type !== 'group') fail('親グループが見つかりません。');
      if (visited.has(parent.id)) fail('グループが循環しています。');
      if (++depth > 32) fail('グループは32階層までです。');
      visited.add(parent.id); current = parent;
    }
    if (e.type === 'group' && !elements.some(child => child.parentId === e.id)) fail('空のグループは読み込めません。');
  }
  refreshGroups(result);
  return result;
}

export const QT_CLASSES = ['QWidget', 'QLabel', 'QPushButton', 'QToolButton', 'QLineEdit', 'QTextEdit', 'QPlainTextEdit', 'QCheckBox', 'QRadioButton', 'QComboBox', 'QSpinBox', 'QDoubleSpinBox', 'QGroupBox', 'QFrame', 'QProgressBar', 'QSlider', 'QListWidget', 'QTreeWidget', 'QTableWidget'];
export const childrenOf = (doc, parentId = null) => doc.elements.filter(e => (e.parentId ?? null) === parentId);
export function descendants(doc, id) {
  const found = [], stack = [...childrenOf(doc, id)];
  while (stack.length) { const e = stack.pop(); found.push(e); if (e.type === 'group') stack.push(...childrenOf(doc, e.id)); }
  return found;
}
export function selectionRoots(doc, ids) {
  const chosen = new Set(ids), map = new Map(doc.elements.map(e => [e.id, e]));
  return doc.elements.filter(e => {
    if (!chosen.has(e.id)) return false;
    let parent = map.get(e.parentId);
    while (parent) { if (chosen.has(parent.id)) return false; parent = map.get(parent.parentId); }
    return true;
  });
}
export function selectionLeaves(doc, ids) {
  const chosen = new Set();
  for (const e of selectionRoots(doc, ids)) {
    if (e.type === 'group') for (const child of descendants(doc, e.id)) { if (child.type !== 'group') chosen.add(child.id); }
    else chosen.add(e.id);
  }
  return doc.elements.filter(e => chosen.has(e.id));
}
export function paintOrder(doc, parentId = null) {
  return childrenOf(doc, parentId).flatMap(e => e.type === 'group' ? paintOrder(doc, e.id) : [e]);
}
export function refreshGroups(doc) {
  function visit(parentId = null) {
    for (const e of childrenOf(doc, parentId)) if (e.type === 'group') {
      visit(e.id); const box = bounds(childrenOf(doc, e.id));
      if (box) Object.assign(e, { x: box.x, y: box.y, width: Math.max(MIN_SIZE, box.width), height: Math.max(MIN_SIZE, box.height) });
    }
  }
  visit(); return doc;
}
export function rootForCanvas(doc, id) {
  let e = doc.elements.find(e => e.id === id);
  while (e?.parentId) e = doc.elements.find(item => item.id === e.parentId);
  return e?.id ?? id;
}
export function groupSelection(doc, ids) {
  const items = selectionRoots(doc, ids);
  if (items.length < 2) throw new Error('2つ以上の要素を選択してください。');
  const parentId = items[0].parentId ?? null;
  if (items.some(e => (e.parentId ?? null) !== parentId)) throw new Error('同じ階層の要素を選択してください。行のドラッグで移動できます。');
  if (doc.elements.length >= 1000) throw new Error('グループを含め1000要素までです。');
  const map = new Map(doc.elements.map(e => [e.id, e]));
  const depthOf = e => { let depth = 0; while (e?.parentId) { depth++; e = map.get(e.parentId); } return depth; };
  if (items.some(e => [e, ...(e.type === 'group' ? descendants(doc, e.id) : [])].some(child => depthOf(child) >= 32))) throw new Error('グループは32階層までです。');
  const group = element('group', { ...bounds(items), name: 'グループ', text: '', layout: 'auto', ...(parentId ? { parentId } : {}) });
  const index = Math.max(...items.map(e => doc.elements.indexOf(e)));
  doc.elements.splice(index + 1, 0, group);
  for (const e of items) e.parentId = group.id;
  return group;
}
export function ungroupSelection(doc, ids) {
  const groups = selectionRoots(doc, ids).filter(e => e.type === 'group'), released = [];
  for (const group of groups) {
    const children = childrenOf(doc, group.id);
    for (const e of children) { if (group.parentId) e.parentId = group.parentId; else delete e.parentId; released.push(e.id); }
    const remaining = doc.elements.filter(e => e.id !== group.id && !children.includes(e));
    const index = doc.elements.slice(0, doc.elements.indexOf(group)).filter(e => remaining.includes(e)).length;
    remaining.splice(index, 0, ...children); doc.elements = remaining;
  }
  refreshGroups(doc); return released;
}
export function pruneEmptyGroups(doc) {
  let empty;
  do { empty = doc.elements.filter(e => e.type === 'group' && !childrenOf(doc, e.id).length); doc.elements = doc.elements.filter(e => !empty.includes(e)); } while (empty.length);
  return refreshGroups(doc);
}
export function dropNode(doc, id, targetId, placement = 'inside') {
  const source = doc.elements.find(e => e.id === id), target = doc.elements.find(e => e.id === targetId);
  if (!source || id === targetId) return false;
  const parentId = placement === 'inside' ? targetId : (target?.parentId ?? null);
  if (parentId && doc.elements.find(e => e.id === parentId)?.type !== 'group') return false;
  if (source.type === 'group' && (parentId === id || descendants(doc, id).some(e => e.id === parentId))) throw new Error('グループを自分自身の中には移動できません。');
  const map = new Map(doc.elements.map(e => [e.id, e]));
  const depthOf = e => { let depth = 0; while (e?.parentId) { depth++; e = map.get(e.parentId); } return depth; };
  const newDepth = parentId ? depthOf(map.get(parentId)) + 1 : 0;
  const subtreeDepth = source.type === 'group' ? Math.max(0, ...descendants(doc, id).map(e => depthOf(e) - depthOf(source))) : 0;
  if (newDepth + subtreeDepth > 32) throw new Error('グループは32階層までです。');
  doc.elements = doc.elements.filter(e => e !== source);
  if (parentId) source.parentId = parentId; else delete source.parentId;
  const index = target ? doc.elements.indexOf(target) : doc.elements.length;
  doc.elements.splice(placement === 'before' ? index + 1 : index, 0, source);
  pruneEmptyGroups(doc); return true;
}
export function reorderSelection(doc, ids, action) {
  const roots = selectionRoots(doc, ids), parents = new Set(roots.map(e => e.parentId ?? null));
  for (const parent of parents) {
    const siblings = childrenOf(doc, parent), chosen = roots.filter(e => (e.parentId ?? null) === parent).map(e => e.id);
    const ordered = reorder(siblings, chosen, action); let index = 0;
    doc.elements = doc.elements.map(e => siblings.includes(e) ? ordered[index++] : e);
  }
}
export function resizeNode(doc, id, box) {
  const e = doc.elements.find(item => item.id === id); if (!e) return;
  if (e.type !== 'group') { Object.assign(e, box); refreshGroups(doc); return; }
  const sx = box.width / e.width, sy = box.height / e.height;
  const leaves = selectionLeaves(doc, [id]);
  for (const child of leaves) if (child.width * sx < MIN_SIZE - .001 || child.height * sy < MIN_SIZE - .001) return;
  for (const child of leaves) { child.x = box.x + (child.x - e.x) * sx; child.y = box.y + (child.y - e.y) * sy; child.width *= sx; child.height *= sy; }
  refreshGroups(doc);
}
export function moveSelection(doc, ids, dx, dy) { moveItems(selectionLeaves(doc, ids), dx, dy, doc.canvas); refreshGroups(doc); }
export function alignSelection(doc, ids, action) {
  const items = selectionRoots(doc, ids), before = items.map(e => ({ id: e.id, x: e.x, y: e.y }));
  if (!alignItems(items, action)) return false;
  for (const e of items) if (e.type === 'group') {
    const original = before.find(item => item.id === e.id), dx = e.x - original.x, dy = e.y - original.y;
    for (const child of selectionLeaves(doc, [e.id])) { child.x += dx; child.y += dy; }
  }
  refreshGroups(doc); return true;
}
export function detectLayout(items) {
  if (items.length < 2) return 'free';
  function fits(horizontal) {
    const pos = horizontal ? 'x' : 'y', size = horizontal ? 'width' : 'height', cross = horizontal ? 'y' : 'x', crossSize = horizontal ? 'height' : 'width';
    const sorted = [...items].sort((a, b) => a[pos] - b[pos]);
    if (sorted.some((e, i) => i && sorted[i - 1][pos] + sorted[i - 1][size] > e[pos] + 1)) return false;
    return Math.max(...items.map(e => e[cross])) < Math.min(...items.map(e => e[cross] + e[crossSize]));
  }
  const h = fits(true), v = fits(false);
  return h && !v ? 'H' : v && !h ? 'V' : 'free';
}
export const groupLayout = (doc, group) => group.layout && group.layout !== 'auto' ? group.layout : detectLayout(childrenOf(doc, group.id));

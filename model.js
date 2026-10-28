export const FORMAT = 'ponchi-maker';
export const VERSION = 1;
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
  if (raw.version !== VERSION) fail('このJSONのバージョンには対応していません。');
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
    if (!e || !['rect', 'text'].includes(e.type)) fail('要素の種類が不正です。');
    const id = string(e.id, 100, '要素ID');
    if (!id || ids.has(id)) fail('要素IDが空、または重複しています。');
    ids.add(id);
    const x = number(e.x, 0, width - MIN_SIZE, 'X座標'), y = number(e.y, 0, height - MIN_SIZE, 'Y座標');
    return { id, type: e.type, name: string(e.name, 100, '管理用の名前'), x, y,
      width: number(e.width, MIN_SIZE, width - x + 0.001, '要素の幅'), height: number(e.height, MIN_SIZE, height - y + 0.001, '要素の高さ'),
      text: string(e.text, 2000, '文字'), fontSize: number(e.fontSize, 8, 120, '文字サイズ'),
      color: color(e.color), fill: color(e.fill), stroke: color(e.stroke),
      strokeWidth: number(e.strokeWidth, 0, 12, '枠線の太さ'), radius: number(e.radius, 0, 80, '角の丸み') };
  });
  return { format: FORMAT, version: VERSION, name: string(raw.name, 80, 'ドキュメント名'), canvas: { width, height }, elements };
}

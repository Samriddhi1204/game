// Validates src/data/*.json. Fails on parse errors, unknown or duplicate ids, numbers out of range
// and hotspots or rects outside the map. More checks arrive with each phase's data files.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const dataDir = join(root, 'src/data');
const errors = [];
const fail = (msg) => errors.push(msg);

function readJson(file) {
  try {
    return JSON.parse(readFileSync(join(dataDir, file), 'utf8'));
  } catch (err) {
    fail(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Width and height from the WebP header (VP8, VP8L or VP8X). */
function webpSize(buf) {
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X')
    return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  if (kind === 'VP8 ') {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  const bits = buf.readUInt32LE(21);
  return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
}

const files = readdirSync(dataDir).filter((f) => f.endsWith('.json'));
const data = Object.fromEntries(files.map((f) => [f, readJson(f)]));
const map = webpSize(readFileSync(join(root, 'assets/map.webp')));

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const KINDS = ['spawn', 'section', 'npc', 'shop', 'board', 'landmark'];

const hs = data['hotspots.json'];
if (hs) {
  if (hs.v !== 1) fail('hotspots.json: v must be 1');
  const list = Array.isArray(hs.hotspots) ? hs.hotspots : [];
  if (list.length === 0) fail('hotspots.json: hotspots must be a non-empty array');
  const ids = new Set();
  for (const h of list) {
    const at = `hotspots.json[${h?.id ?? '?'}]`;
    if (typeof h?.id !== 'string' || !h.id) fail(`${at}: missing id`);
    else if (ids.has(h.id)) fail(`${at}: duplicate id`);
    else ids.add(h.id);
    if (!KINDS.includes(h?.kind)) fail(`${at}: unknown kind "${h?.kind}"`);
    if (typeof h?.label !== 'string' || !h.label) fail(`${at}: missing label`);
    if (!isNum(h?.x) || h.x < 0 || h.x > map.width)
      fail(`${at}: x outside the map (0..${map.width})`);
    if (!isNum(h?.y) || h.y < 0 || h.y > map.height)
      fail(`${at}: y outside the map (0..${map.height})`);
    if (!isNum(h?.radius) || h.radius < 8 || h.radius > 400) fail(`${at}: radius must be 8..400`);
    if (
      h?.requiresWins !== undefined &&
      (!Number.isInteger(h.requiresWins) || h.requiresWins < 0 || h.requiresWins > 5)
    ) {
      fail(`${at}: requiresWins must be an integer 0..5`);
    }
    if (h?.requiresWins !== undefined && !h.lockedHint)
      fail(`${at}: locked hotspots need a lockedHint`);
    if (h?.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(h.color))
      fail(`${at}: color must be #rrggbb`);
  }
  if (list.filter((h) => h?.kind === 'spawn').length !== 1)
    fail('hotspots.json: need exactly one spawn');
}

const col = data['collision.json'];
if (col) {
  if (col.v !== 1) fail('collision.json: v must be 1');
  const list = Array.isArray(col.rects) ? col.rects : [];
  const names = new Set();
  for (const r of list) {
    const at = `collision.json[${r?.name ?? '?'}]`;
    if (typeof r?.name !== 'string' || !r.name) fail(`${at}: missing name`);
    else if (names.has(r.name)) fail(`${at}: duplicate name`);
    else names.add(r.name);
    if (![r?.x1, r?.y1, r?.x2, r?.y2].every(isNum)) {
      fail(`${at}: x1,y1,x2,y2 must be numbers`);
      continue;
    }
    if (r.x1 >= r.x2 || r.y1 >= r.y2) fail(`${at}: needs x1<x2 and y1<y2`);
    if (r.x1 < 0 || r.y1 < 0 || r.x2 > map.width || r.y2 > map.height) {
      fail(`${at}: outside the map (${map.width}x${map.height})`);
    }
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(1);
}
console.log(`validate-data: ${files.length} file(s) OK (map ${map.width}x${map.height}).`);

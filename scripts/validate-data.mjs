// Validates src/data/*.json and the tileset image. Fails on parse errors, unknown or duplicate ids,
// numbers out of range, hotspots outside the map or on blocked tiles, and a tileset that is too
// small for the legend. More checks arrive with each phase's data files.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const errors = [];
const fail = (msg) => errors.push(msg);

function readJson(file) {
  try {
    return JSON.parse(readFileSync(join(root, 'src/data', file), 'utf8'));
  } catch (err) {
    fail(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const KINDS = ['spawn', 'section', 'npc', 'shop', 'board', 'landmark'];
const MARGIN = 1;
const SPACING = 2;

// ---- tiles.json
const tilesFile = readJson('tiles.json');
const tiles = Array.isArray(tilesFile?.tiles) ? tilesFile.tiles : [];
if (tilesFile && tilesFile.v !== 1) fail('tiles.json: v must be 1');
if (tiles.length === 0) fail('tiles.json: tiles must be a non-empty array');
const chars = new Set();
const names = new Set();
for (const t of tiles) {
  const at = `tiles.json[${t?.name ?? '?'}]`;
  if (typeof t?.char !== 'string' || t.char.length !== 1) fail(`${at}: char must be one character`);
  else if (chars.has(t.char)) fail(`${at}: duplicate char "${t.char}"`);
  else chars.add(t.char);
  if (typeof t?.name !== 'string' || !t.name) fail(`${at}: missing name`);
  else if (names.has(t.name)) fail(`${at}: duplicate name`);
  else names.add(t.name);
  if (typeof t?.walkable !== 'boolean') fail(`${at}: walkable must be true or false`);
  if (!/^#[0-9a-fA-F]{6}$/.test(t?.color ?? '')) fail(`${at}: color must be #rrggbb`);
}
const byChar = new Map(tiles.map((t) => [t.char, t]));

// ---- tilemap.json
const tm = readJson('tilemap.json');
let cols = 0;
let rows = 0;
let tileSize = 32;
if (tm) {
  if (tm.v !== 1) fail('tilemap.json: v must be 1');
  tileSize = tm.tileSize;
  if (!Number.isInteger(tileSize) || tileSize < 8 || tileSize > 128)
    fail('tilemap.json: tileSize must be an integer 8..128');
  const list = Array.isArray(tm.rows) ? tm.rows : [];
  rows = list.length;
  cols = typeof list[0] === 'string' ? list[0].length : 0;
  if (rows === 0 || cols === 0) fail('tilemap.json: rows must be a non-empty array of strings');
  list.forEach((line, r) => {
    if (typeof line !== 'string' || line.length !== cols) {
      fail(`tilemap.json: row ${r} must be a string of ${cols} tiles`);
      return;
    }
    for (let c = 0; c < cols; c++) {
      if (!byChar.has(line[c]))
        fail(`tilemap.json: unknown tile "${line[c]}" at row ${r}, col ${c}`);
    }
  });
}
const mapW = cols * tileSize;
const mapH = rows * tileSize;
const walkableAt = (x, y) => {
  const line = tm?.rows?.[Math.floor(y / tileSize)];
  return typeof line === 'string' && byChar.get(line[Math.floor(x / tileSize)])?.walkable === true;
};

// ---- tileset.png: needs a picture for every tile type
try {
  const png = readFileSync(join(root, 'assets/tiles/tileset.png'));
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  const perRow = (w - 2 * MARGIN + SPACING) / (tileSize + SPACING);
  const perCol = (h - 2 * MARGIN + SPACING) / (tileSize + SPACING);
  if (!Number.isInteger(perRow) || !Number.isInteger(perCol)) {
    fail(
      `assets/tiles/tileset.png is ${w}x${h}: not a whole number of ${tileSize}px tiles with margin ${MARGIN} and spacing ${SPACING}`,
    );
  }
  if (perRow * perCol < tiles.length) {
    fail(
      `assets/tiles/tileset.png fits ${perRow * perCol} tiles but tiles.json lists ${tiles.length}`,
    );
  }
} catch (err) {
  fail(`assets/tiles/tileset.png: ${err instanceof Error ? err.message : String(err)}`);
}

// ---- hotspots.json
const hs = readJson('hotspots.json');
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
    if (!isNum(h?.x) || h.x < 0 || h.x > mapW) fail(`${at}: x outside the map (0..${mapW})`);
    if (!isNum(h?.y) || h.y < 0 || h.y > mapH) fail(`${at}: y outside the map (0..${mapH})`);
    if (!isNum(h?.radius) || h.radius < 8 || h.radius > 400) fail(`${at}: radius must be 8..400`);
    if (
      (h?.action !== undefined || h?.kind === 'spawn') &&
      isNum(h?.x) &&
      isNum(h?.y) &&
      !walkableAt(h.x, h.y)
    ) {
      fail(`${at}: must sit on a walkable tile`);
    }
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

// ---- combat.json (the full range checks live in parseCombat and its unit test; these are the CI gate)
const combat = readJson('combat.json');
if (combat) {
  if (combat.v !== 1) fail('combat.json: v must be 1');
  const inRange = (label, v, min, max) => {
    if (!isNum(v) || v < min || v > max)
      fail(`combat.json: ${label} must be a number ${min}..${max} (got ${v})`);
  };
  inRange('maxHp', combat.maxHp, 1, 1000);
  inRange('inputBuffer', combat.inputBuffer, 0, 30);
  inRange('block.reduction', combat.block?.reduction, 0, 1);
  inRange('dodge.distance', combat.dodge?.distance, 0, 400);
  if (!['toward', 'hold'].includes(combat.heavyScheme))
    fail('combat.json: heavyScheme must be "toward" or "hold"');
  for (const [who, actions] of [
    ['actions', combat.actions],
    ['dummy.actions', combat.dummy?.actions],
  ]) {
    for (const kind of ['punch', 'heavy', 'special']) {
      const a = actions?.[kind];
      if (!a) {
        fail(`combat.json: ${who}.${kind} is missing`);
        continue;
      }
      inRange(`${who}.${kind}.startup`, a.startup, 1, 120);
      inRange(`${who}.${kind}.damage`, a.damage, 0, 100);
      // Fairness (spec section 10): a blockable attack the dummy throws needs a 20+ frame telegraph.
      if (who === 'dummy.actions' && a.startup < 20)
        fail(
          `combat.json: dummy.actions.${kind}.startup is ${a.startup}, below the 20-frame telegraph minimum`,
        );
    }
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(1);
}
console.log(
  `validate-data: OK (${cols}x${rows} tiles of ${tileSize}px = ${mapW}x${mapH}, ${tiles.length} tile types).`,
);

import { HOTSPOT_KINDS, type HotspotDef, type HotspotKind } from './hotspots';
import { TileGrid, type TileDef } from './tiles';

function rec(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`${path}: expected an object`);
  }
  return v as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string, path: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`${path}.${key}: expected a number`);
  }
  return v;
}

function str(o: Record<string, unknown>, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') throw new Error(`${path}.${key}: expected a string`);
  return v;
}

function optStr(o: Record<string, unknown>, key: string, path: string): string | undefined {
  return o[key] === undefined ? undefined : str(o, key, path);
}

function optNum(o: Record<string, unknown>, key: string, path: string): number | undefined {
  return o[key] === undefined ? undefined : num(o, key, path);
}

function list(o: Record<string, unknown>, key: string, path: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`${path}.${key}: expected an array`);
  return v as unknown[];
}

/** Parse and validate hotspots.json. Returns fresh, mutable objects. */
export function parseHotspots(raw: unknown): HotspotDef[] {
  const root = rec(raw, 'hotspots.json');
  if (root['v'] !== 1) throw new Error('hotspots.json: unsupported version');
  return list(root, 'hotspots', 'hotspots.json').map((item, i) => {
    const path = `hotspots[${i}]`;
    const o = rec(item, path);
    const kind = str(o, 'kind', path);
    if (!(HOTSPOT_KINDS as readonly string[]).includes(kind)) {
      throw new Error(`${path}.kind: unknown kind "${kind}"`);
    }
    const action = optStr(o, 'action', path);
    const requiresWins = optNum(o, 'requiresWins', path);
    const lockedHint = optStr(o, 'lockedHint', path);
    const color = optStr(o, 'color', path);
    const def: HotspotDef = {
      id: str(o, 'id', path),
      label: str(o, 'label', path),
      kind: kind as HotspotKind,
      x: num(o, 'x', path),
      y: num(o, 'y', path),
      radius: num(o, 'radius', path),
      ...(action !== undefined && { action }),
      ...(requiresWins !== undefined && { requiresWins }),
      ...(lockedHint !== undefined && { lockedHint }),
      ...(color !== undefined && { color }),
    };
    return def;
  });
}

function bool(o: Record<string, unknown>, key: string, path: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new Error(`${path}.${key}: expected true or false`);
  return v;
}

/** Parse and validate tiles.json (the tile legend). */
export function parseTiles(raw: unknown): TileDef[] {
  const root = rec(raw, 'tiles.json');
  if (root['v'] !== 1) throw new Error('tiles.json: unsupported version');
  return list(root, 'tiles', 'tiles.json').map((item, i) => {
    const path = `tiles[${i}]`;
    const o = rec(item, path);
    const char = str(o, 'char', path);
    if (char.length !== 1) throw new Error(`${path}.char: must be exactly one character`);
    const color = str(o, 'color', path);
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error(`${path}.color: expected #rrggbb`);
    return { char, name: str(o, 'name', path), walkable: bool(o, 'walkable', path), color };
  });
}

/** Parse and validate tilemap.json against the legend. Returns a fresh, mutable grid. */
export function parseTilemap(raw: unknown, defs: readonly TileDef[]): TileGrid {
  const root = rec(raw, 'tilemap.json');
  if (root['v'] !== 1) throw new Error('tilemap.json: unsupported version');
  const tileSize = num(root, 'tileSize', 'tilemap.json');
  if (!Number.isInteger(tileSize) || tileSize < 8 || tileSize > 128) {
    throw new Error('tilemap.json.tileSize: expected an integer 8..128');
  }
  const rows = list(root, 'rows', 'tilemap.json').map((r, i) => {
    if (typeof r !== 'string') throw new Error(`tilemap.json.rows[${i}]: expected a string`);
    return r;
  });
  return new TileGrid(tileSize, rows, defs);
}

/** The single spawn hotspot. */
export function findSpawn(hotspots: readonly HotspotDef[]): HotspotDef {
  const spawn = hotspots.find((h) => h.kind === 'spawn');
  if (!spawn) throw new Error('hotspots.json: no spawn hotspot');
  return spawn;
}

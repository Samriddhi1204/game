import { HOTSPOT_KINDS, type HotspotDef, type HotspotKind } from './hotspots';
import type { NamedRect } from './types';

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

/** Parse and validate collision.json. Returns fresh, mutable objects. */
export function parseCollision(raw: unknown): NamedRect[] {
  const root = rec(raw, 'collision.json');
  if (root['v'] !== 1) throw new Error('collision.json: unsupported version');
  return list(root, 'rects', 'collision.json').map((item, i) => {
    const path = `rects[${i}]`;
    const o = rec(item, path);
    return {
      name: str(o, 'name', path),
      x1: num(o, 'x1', path),
      y1: num(o, 'y1', path),
      x2: num(o, 'x2', path),
      y2: num(o, 'y2', path),
    };
  });
}

/** The single spawn hotspot. */
export function findSpawn(hotspots: readonly HotspotDef[]): HotspotDef {
  const spawn = hotspots.find((h) => h.kind === 'spawn');
  if (!spawn) throw new Error('hotspots.json: no spawn hotspot');
  return spawn;
}

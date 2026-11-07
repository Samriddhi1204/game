import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isBlocked } from '../../src/core/map/collision';
import { findSpawn, parseHotspots, parseTilemap, parseTiles } from '../../src/core/map/parse';

const read = (f: string): unknown => JSON.parse(readFileSync(`src/data/${f}`, 'utf8'));
const defs = parseTiles(read('tiles.json'));
const grid = parseTilemap(read('tilemap.json'), defs);
const hotspots = parseHotspots(read('hotspots.json'));

/** Size of the tileset PNG, from its IHDR chunk. */
function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('tile data', () => {
  it('has a tileset image with a picture for every tile type', () => {
    const { width, height } = pngSize(readFileSync('assets/tiles/tileset.png'));
    const margin = 1;
    const spacing = 2;
    // Phaser needs a whole number of tiles, with the margin counted on both sides.
    const cols = (width - 2 * margin + spacing) / (grid.tileSize + spacing);
    const rows = (height - 2 * margin + spacing) / (grid.tileSize + spacing);
    expect(Number.isInteger(cols) && Number.isInteger(rows)).toBe(true);
    expect(cols * rows).toBeGreaterThanOrEqual(defs.length);
  });

  it('has unique tile names', () => {
    const names = defs.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('makes roads, paths, plaza, track and underpass walkable, and scenery blocked', () => {
    const walk = (name: string): boolean | undefined => defs.find((d) => d.name === name)?.walkable;
    for (const n of ['road', 'road_dash_h', 'road_dash_v', 'path', 'plaza', 'track', 'underpass']) {
      expect(walk(n), n).toBe(true);
    }
    for (const n of ['grass', 'roof', 'wall', 'rail', 'tree', 'field'])
      expect(walk(n), n).toBe(false);
  });
});

describe('map data', () => {
  it('has unique hotspot ids and exactly one spawn', () => {
    const ids = hotspots.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(hotspots.filter((h) => h.kind === 'spawn')).toHaveLength(1);
  });

  it('keeps every hotspot inside the map', () => {
    for (const h of hotspots) {
      expect(h.x, h.id).toBeGreaterThanOrEqual(0);
      expect(h.x, h.id).toBeLessThanOrEqual(grid.width);
      expect(h.y, h.id).toBeGreaterThanOrEqual(0);
      expect(h.y, h.id).toBeLessThanOrEqual(grid.height);
      expect(h.radius, h.id).toBeGreaterThan(0);
    }
  });

  it('spawns the player on a tile they can stand on', () => {
    const s = findSpawn(hotspots);
    expect(isBlocked({ x: s.x, y: s.y }, grid)).toBe(false);
  });

  it('puts every interactive hotspot on a walkable tile the player can reach from the spawn', () => {
    // Flood fill over tile centres where the feet box fits. Guards against exports that wall off a hotspot.
    const ts = grid.tileSize;
    const free = (c: number, r: number): boolean =>
      !isBlocked({ x: (c + 0.5) * ts, y: (r + 0.5) * ts }, grid);
    const s = findSpawn(hotspots);
    const start = Math.floor(s.x / ts) + Math.floor(s.y / ts) * grid.cols;
    const seen = new Uint8Array(grid.cols * grid.rows);
    const queue = [start];
    seen[start] = 1;
    while (queue.length > 0) {
      const idx = queue.pop();
      if (idx === undefined) break;
      const c = idx % grid.cols;
      const r = (idx - c) / grid.cols;
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
        const n = nc + nr * grid.cols;
        if (seen[n] || !free(nc, nr)) continue;
        seen[n] = 1;
        queue.push(n);
      }
    }
    for (const h of hotspots.filter((d) => d.action !== undefined)) {
      const c = Math.floor(h.x / ts);
      const r = Math.floor(h.y / ts);
      expect(grid.isWalkableTile(c, r), `${h.id} is not on a walkable tile`).toBe(true);
      expect(seen[c + r * grid.cols], `${h.id} is not reachable from the spawn`).toBe(1);
    }
  });

  it('has no walkable tile the player can never reach (no stranded paths)', () => {
    const ts = grid.tileSize;
    const s = findSpawn(hotspots);
    const seen = new Set<number>();
    const stack = [Math.floor(s.x / ts) + Math.floor(s.y / ts) * grid.cols];
    while (stack.length > 0) {
      const idx = stack.pop();
      if (idx === undefined || seen.has(idx)) continue;
      const c = idx % grid.cols;
      const r = (idx - c) / grid.cols;
      if (!grid.isWalkableTile(c, r)) continue;
      seen.add(idx);
      stack.push(idx + 1, idx - 1, idx + grid.cols, idx - grid.cols);
    }
    let walkable = 0;
    for (let r = 0; r < grid.rows; r++)
      for (let c = 0; c < grid.cols; c++) if (grid.isWalkableTile(c, r)) walkable++;
    expect(seen.size).toBe(walkable);
  });

  it('rejects malformed hotspots with a clear message', () => {
    expect(() => parseHotspots({ v: 2, hotspots: [] })).toThrow(/version/);
    expect(() => parseHotspots({ v: 1, hotspots: [{ id: 'x' }] })).toThrow(/hotspots\[0\]/);
  });
});

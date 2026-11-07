import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isBlocked } from '../../src/core/map/collision';
import { findSpawn, parseCollision, parseHotspots } from '../../src/core/map/parse';
import type { MapSize, Vec2 } from '../../src/core/map/types';

const read = (f: string): unknown => JSON.parse(readFileSync(`src/data/${f}`, 'utf8'));
const hotspots = parseHotspots(read('hotspots.json'));
const rects = parseCollision(read('collision.json'));

/** Width and height of the shipped map, read from the WebP header. */
function webpSize(buf: Buffer): MapSize {
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X')
    return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  if (kind === 'VP8 ')
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  const bits = buf.readUInt32LE(21);
  return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
}
const map = webpSize(readFileSync('assets/map.webp'));

describe('map data', () => {
  it('reads the real map size', () => {
    expect(map).toEqual({ width: 2000, height: 1342 });
  });

  it('has unique ids and one spawn', () => {
    const ids = hotspots.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(hotspots.filter((h) => h.kind === 'spawn')).toHaveLength(1);
  });

  it('keeps every hotspot and rect inside the map', () => {
    for (const h of hotspots) {
      expect(h.x).toBeGreaterThanOrEqual(0);
      expect(h.x).toBeLessThanOrEqual(map.width);
      expect(h.y).toBeGreaterThanOrEqual(0);
      expect(h.y).toBeLessThanOrEqual(map.height);
      expect(h.radius).toBeGreaterThan(0);
    }
    for (const r of rects) {
      expect(r.x1).toBeLessThan(r.x2);
      expect(r.y1).toBeLessThan(r.y2);
      expect(r.x1).toBeGreaterThanOrEqual(0);
      expect(r.y1).toBeGreaterThanOrEqual(0);
      expect(r.x2).toBeLessThanOrEqual(map.width);
      expect(r.y2).toBeLessThanOrEqual(map.height);
    }
  });

  it('spawns the player on free ground', () => {
    const s = findSpawn(hotspots);
    expect(isBlocked({ x: s.x, y: s.y }, rects, map)).toBe(false);
  });

  it('lets the player walk from the spawn to every interactive hotspot', () => {
    // Flood fill on an 6px grid using the real feet-box test. A hotspot is reachable if some free
    // cell inside its radius is reached. This guards against exports that wall a hotspot off.
    const step = 6;
    const cols = Math.ceil(map.width / step);
    const rows = Math.ceil(map.height / step);
    const seen = new Uint8Array(cols * rows);
    const free = (c: number, r: number): boolean =>
      !isBlocked({ x: c * step, y: r * step }, rects, map);
    const s = findSpawn(hotspots);
    const queue: number[] = [Math.round(s.x / step) + Math.round(s.y / step) * cols];
    seen[queue[0] ?? 0] = 1;
    while (queue.length > 0) {
      const idx = queue.pop();
      if (idx === undefined) break;
      const c = idx % cols;
      const r = (idx - c) / cols;
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const n = nc + nr * cols;
        if (seen[n] || !free(nc, nr)) continue;
        seen[n] = 1;
        queue.push(n);
      }
    }
    for (const h of hotspots.filter((d) => d.action !== undefined)) {
      let reached = false;
      const p: Vec2 = { x: 0, y: 0 };
      for (let y = h.y - h.radius; y <= h.y + h.radius && !reached; y += step) {
        for (let x = h.x - h.radius; x <= h.x + h.radius; x += step) {
          if (Math.hypot(x - h.x, y - h.y) > h.radius) continue;
          p.x = x;
          p.y = y;
          const c = Math.round(x / step);
          const r = Math.round(y / step);
          if (c >= 0 && r >= 0 && c < cols && r < rows && seen[c + r * cols]) {
            reached = true;
            break;
          }
        }
      }
      expect(reached, `${h.id} is not reachable from the spawn`).toBe(true);
    }
  });

  it('rejects malformed data with a clear message', () => {
    expect(() => parseHotspots({ v: 2, hotspots: [] })).toThrow(/version/);
    expect(() => parseHotspots({ v: 1, hotspots: [{ id: 'x' }] })).toThrow(/hotspots\[0\]/);
    expect(() => parseCollision({ v: 1, rects: [{ name: 'r', x1: 'a' }] })).toThrow(/x1/);
  });
});

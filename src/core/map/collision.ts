import type { TileGrid } from './tiles';
import type { Vec2 } from './types';

/** Player feet-box size (spec section 12). `pos` is the centre of this box. */
export const FEET_W = 24;
export const FEET_H = 16;

const EPS = 1e-6;
/** Longest distance moved in one sub-step. Less than a tile, so a wall can never be skipped. */
const MAX_STEP = 8;

/** True if a feet box centred at pos touches any blocked tile or leaves the map. */
export function isBlocked(pos: Vec2, grid: TileGrid, hw = FEET_W / 2, hh = FEET_H / 2): boolean {
  const ts = grid.tileSize;
  const c0 = Math.floor((pos.x - hw) / ts);
  const c1 = Math.floor((pos.x + hw - EPS) / ts);
  const r0 = Math.floor((pos.y - hh) / ts);
  const r1 = Math.floor((pos.y + hh - EPS) / ts);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (!grid.isWalkableTile(c, r)) return true;
    }
  }
  return false;
}

const probe: Vec2 = { x: 0, y: 0 };

/** Move a stuck player to the nearest tile centre where the feet box fits (e.g. after the editor paints over them). */
function escape(pos: Vec2, grid: TileGrid, hw: number, hh: number): void {
  const ts = grid.tileSize;
  const c0 = Math.floor(pos.x / ts);
  const r0 = Math.floor(pos.y / ts);
  let bestD2 = Infinity;
  let bx = pos.x;
  let by = pos.y;
  const reach = Math.max(grid.cols, grid.rows);
  for (let ring = 1; ring <= reach; ring++) {
    for (let r = r0 - ring; r <= r0 + ring; r++) {
      for (let c = c0 - ring; c <= c0 + ring; c++) {
        if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== ring) continue;
        probe.x = (c + 0.5) * ts;
        probe.y = (r + 0.5) * ts;
        if (isBlocked(probe, grid, hw, hh)) continue;
        const d2 = (probe.x - pos.x) ** 2 + (probe.y - pos.y) ** 2;
        if (d2 < bestD2) {
          bestD2 = d2;
          bx = probe.x;
          by = probe.y;
        }
      }
    }
    // A found tile in ring k can still lose to a closer one in ring k+1 (diagonals), so look one more.
    if (bestD2 < Infinity && (ring - 1) * ts > Math.sqrt(bestD2)) break;
  }
  pos.x = bx;
  pos.y = by;
}

function blockedColumn(grid: TileGrid, col: number, r0: number, r1: number): boolean {
  for (let r = r0; r <= r1; r++) if (!grid.isWalkableTile(col, r)) return true;
  return false;
}

function blockedRow(grid: TileGrid, row: number, c0: number, c1: number): boolean {
  for (let c = c0; c <= c1; c++) if (!grid.isWalkableTile(c, row)) return true;
  return false;
}

function stepX(pos: Vec2, dx: number, grid: TileGrid, hw: number, hh: number): void {
  if (dx === 0) return;
  const ts = grid.tileSize;
  const r0 = Math.floor((pos.y - hh) / ts);
  const r1 = Math.floor((pos.y + hh - EPS) / ts);
  let nx = pos.x + dx;
  if (dx > 0) {
    const c = Math.floor((nx + hw - EPS) / ts);
    if (blockedColumn(grid, c, r0, r1)) nx = c * ts - hw;
  } else {
    const c = Math.floor((nx - hw) / ts);
    if (blockedColumn(grid, c, r0, r1)) nx = (c + 1) * ts + hw;
  }
  pos.x = nx;
}

function stepY(pos: Vec2, dy: number, grid: TileGrid, hw: number, hh: number): void {
  if (dy === 0) return;
  const ts = grid.tileSize;
  const c0 = Math.floor((pos.x - hw) / ts);
  const c1 = Math.floor((pos.x + hw - EPS) / ts);
  let ny = pos.y + dy;
  if (dy > 0) {
    const r = Math.floor((ny + hh - EPS) / ts);
    if (blockedRow(grid, r, c0, c1)) ny = r * ts - hh;
  } else {
    const r = Math.floor((ny - hh) / ts);
    if (blockedRow(grid, r, c0, c1)) ny = (r + 1) * ts + hh;
  }
  pos.y = ny;
}

/**
 * Move `pos` by (dx, dy) over walkable tiles only. Movement is cut into steps shorter than a tile
 * and each step is resolved x then y, so the player slides along walls, never sticks on a corner,
 * and can never cross a blocked tile however big the frame delta. Mutates `pos`; allocates nothing.
 */
export function moveAndCollide(
  pos: Vec2,
  dx: number,
  dy: number,
  grid: TileGrid,
  hw = FEET_W / 2,
  hh = FEET_H / 2,
): void {
  if (isBlocked(pos, grid, hw, hh)) escape(pos, grid, hw, hh);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MAX_STEP));
  const sx = dx / steps;
  const sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    stepX(pos, sx, grid, hw, hh);
    stepY(pos, sy, grid, hw, hh);
  }
}

import type { MapSize, Rect, Vec2 } from './types';

/** Player feet-box size (spec section 12). `pos` is the centre of this box. */
export const FEET_W = 24;
export const FEET_H = 16;

const EPS = 1e-6;

function overlaps(pos: Vec2, hw: number, hh: number, r: Rect): boolean {
  return (
    pos.x + hw > r.x1 + EPS &&
    pos.x - hw < r.x2 - EPS &&
    pos.y + hh > r.y1 + EPS &&
    pos.y - hh < r.y2 - EPS
  );
}

/** True if a feet box centred at pos overlaps any rect or leaves the map. */
export function isBlocked(
  pos: Vec2,
  rects: readonly Rect[],
  map: MapSize,
  hw = FEET_W / 2,
  hh = FEET_H / 2,
): boolean {
  if (pos.x < hw || pos.y < hh || pos.x > map.width - hw || pos.y > map.height - hh) return true;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r && overlaps(pos, hw, hh, r)) return true;
  }
  return false;
}

/** Push the box out of any rect it already overlaps (e.g. a rect drawn over the player). */
function depenetrate(pos: Vec2, rects: readonly Rect[], hw: number, hh: number): void {
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (!r || !overlaps(pos, hw, hh, r)) continue;
      const pushLeft = pos.x + hw - r.x1;
      const pushRight = r.x2 - (pos.x - hw);
      const pushUp = pos.y + hh - r.y1;
      const pushDown = r.y2 - (pos.y - hh);
      const m = Math.min(pushLeft, pushRight, pushUp, pushDown);
      if (m === pushLeft) pos.x -= pushLeft;
      else if (m === pushRight) pos.x += pushRight;
      else if (m === pushUp) pos.y -= pushUp;
      else pos.y += pushDown;
      moved = true;
    }
    if (!moved) return;
  }
}

/**
 * Move `pos` by (dx, dy), x first then y. Each axis is swept against the rect edges it would
 * cross, so a large step can never tunnel through a wall, and sliding along a wall never sticks
 * on a corner. Mutates `pos`; allocates nothing.
 */
export function moveAndCollide(
  pos: Vec2,
  dx: number,
  dy: number,
  rects: readonly Rect[],
  map: MapSize,
  hw = FEET_W / 2,
  hh = FEET_H / 2,
): void {
  depenetrate(pos, rects, hw, hh);

  if (dx !== 0) {
    let nx = pos.x + dx;
    const top = pos.y - hh;
    const bottom = pos.y + hh;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (!r || !(top < r.y2 - EPS && bottom > r.y1 + EPS)) continue;
      if (dx > 0) {
        if (pos.x + hw <= r.x1 + EPS && nx + hw > r.x1) nx = Math.min(nx, r.x1 - hw);
      } else if (pos.x - hw >= r.x2 - EPS && nx - hw < r.x2) {
        nx = Math.max(nx, r.x2 + hw);
      }
    }
    pos.x = nx;
  }

  if (dy !== 0) {
    let ny = pos.y + dy;
    const left = pos.x - hw;
    const right = pos.x + hw;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (!r || !(left < r.x2 - EPS && right > r.x1 + EPS)) continue;
      if (dy > 0) {
        if (pos.y + hh <= r.y1 + EPS && ny + hh > r.y1) ny = Math.min(ny, r.y1 - hh);
      } else if (pos.y - hh >= r.y2 - EPS && ny - hh < r.y2) {
        ny = Math.max(ny, r.y2 + hh);
      }
    }
    pos.y = ny;
  }

  pos.x = Math.min(Math.max(pos.x, hw), map.width - hw);
  pos.y = Math.min(Math.max(pos.y, hh), map.height - hh);
}

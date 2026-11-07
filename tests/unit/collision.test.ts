import { describe, expect, it } from 'vitest';
import { isBlocked, moveAndCollide } from '../../src/core/map/collision';
import type { MapSize, Rect, Vec2 } from '../../src/core/map/types';

const map: MapSize = { width: 1000, height: 1000 };
const wall: Rect = { x1: 100, y1: 100, x2: 200, y2: 200 };

describe('moveAndCollide', () => {
  it('moves freely in open space', () => {
    const p: Vec2 = { x: 500, y: 500 };
    moveAndCollide(p, 10, -5, [], map);
    expect(p).toEqual({ x: 510, y: 495 });
  });

  it('stops flush against a wall from every side', () => {
    const left: Vec2 = { x: 50, y: 150 };
    moveAndCollide(left, 200, 0, [wall], map);
    expect(left.x).toBe(100 - 12);
    const right: Vec2 = { x: 300, y: 150 };
    moveAndCollide(right, -200, 0, [wall], map);
    expect(right.x).toBe(200 + 12);
    const above: Vec2 = { x: 150, y: 50 };
    moveAndCollide(above, 0, 200, [wall], map);
    expect(above.y).toBe(100 - 8);
    const below: Vec2 = { x: 150, y: 300 };
    moveAndCollide(below, 0, -200, [wall], map);
    expect(below.y).toBe(200 + 8);
  });

  it('never tunnels through a thin wall at huge speed', () => {
    const thin: Rect = { x1: 300, y1: 0, x2: 302, y2: 1000 };
    const p: Vec2 = { x: 200, y: 500 };
    moveAndCollide(p, 5000, 0, [thin], map);
    expect(p.x).toBeLessThanOrEqual(300 - 12);
  });

  it('slides along a wall when moving diagonally', () => {
    const p: Vec2 = { x: 50, y: 120 };
    moveAndCollide(p, 100, 30, [wall], map);
    expect(p.x).toBe(88);
    expect(p.y).toBe(150);
  });

  it('does not stick on the corner where two rects meet', () => {
    const a: Rect = { x1: 100, y1: 0, x2: 200, y2: 100 };
    const b: Rect = { x1: 100, y1: 100, x2: 200, y2: 200 };
    const p: Vec2 = { x: 88, y: 20 };
    for (let i = 0; i < 100; i++) moveAndCollide(p, 5, 3, [a, b], map);
    // Slid down the flat wall (no snag at the seam) and then off the bottom corner.
    expect(p.y).toBeGreaterThan(200);
    expect(p.x).toBeGreaterThan(200);
  });

  it('slides past a rect corner without snagging', () => {
    // Walk down along the left face and off the bottom corner.
    const p: Vec2 = { x: 88, y: 150 };
    for (let i = 0; i < 60; i++) moveAndCollide(p, 4, 4, [wall], map);
    expect(p.y).toBeGreaterThan(wall.y2);
    expect(p.x).toBeGreaterThan(wall.x2 - 1);
  });

  it('is blocked by the world edge', () => {
    const p: Vec2 = { x: 500, y: 500 };
    moveAndCollide(p, -5000, -5000, [], map);
    expect(p).toEqual({ x: 12, y: 8 });
    moveAndCollide(p, 9999, 9999, [], map);
    expect(p).toEqual({ x: 988, y: 992 });
  });

  it('pushes the player out of a rect drawn on top of them', () => {
    const p: Vec2 = { x: 150, y: 150 };
    moveAndCollide(p, 0, 0, [wall], map);
    expect(isBlocked(p, [wall], map)).toBe(false);
  });

  it('reports blocked positions', () => {
    expect(isBlocked({ x: 150, y: 150 }, [wall], map)).toBe(true);
    expect(isBlocked({ x: 400, y: 400 }, [wall], map)).toBe(false);
    expect(isBlocked({ x: 2, y: 400 }, [wall], map)).toBe(true);
  });
});

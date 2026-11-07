import { describe, expect, it } from 'vitest';
import { isBlocked, moveAndCollide } from '../../src/core/map/collision';
import { TileGrid } from '../../src/core/map/tiles';
import type { Vec2 } from '../../src/core/map/types';
import { defs } from './tiles.test';

// 10 x 8 tiles of 32 px. '#' blocks. Walkable interior is x 32..288, y 32..224.
const grid = new TileGrid(
  32,
  [
    '##########',
    '#........#',
    '#........#',
    '#..####..#',
    '#..####..#',
    '#........#',
    '#........#',
    '##########',
  ],
  defs,
);
const HW = 12;
const HH = 8;

describe('moveAndCollide on tiles', () => {
  it('moves freely over walkable tiles', () => {
    const p: Vec2 = { x: 64, y: 64 };
    moveAndCollide(p, 10, 5, grid);
    expect(p).toEqual({ x: 74, y: 69 });
  });

  it('stops flush against walls on every side', () => {
    const left: Vec2 = { x: 64, y: 64 };
    moveAndCollide(left, -500, 0, grid);
    expect(left.x).toBe(32 + HW);
    const right: Vec2 = { x: 64, y: 64 };
    moveAndCollide(right, 500, 0, grid);
    expect(right.x).toBe(288 - HW);
    const up: Vec2 = { x: 64, y: 64 };
    moveAndCollide(up, 0, -500, grid);
    expect(up.y).toBe(32 + HH);
    const down: Vec2 = { x: 64, y: 64 };
    moveAndCollide(down, 0, 500, grid);
    expect(down.y).toBe(224 - HH);
  });

  it('cannot leave the map even with a huge step', () => {
    const p: Vec2 = { x: 64, y: 64 };
    moveAndCollide(p, 99999, 99999, grid);
    expect(isBlocked(p, grid)).toBe(false);
    expect(p.x).toBeLessThanOrEqual(288 - HW);
    expect(p.y).toBeLessThanOrEqual(224 - HH);
  });

  it('never tunnels through the central block at high speed', () => {
    const p: Vec2 = { x: 50, y: 112 }; // left of the block, level with it
    moveAndCollide(p, 4000, 0, grid);
    expect(p.x).toBe(96 - HW);
  });

  it('slides along a wall when moving diagonally into it', () => {
    const p: Vec2 = { x: 48, y: 64 };
    moveAndCollide(p, -100, 30, grid);
    expect(p.x).toBe(32 + HW);
    expect(p.y).toBeCloseTo(94, 6);
  });

  it('slides around the block corner without snagging', () => {
    // Press down-right against the left face of the block, then keep going past its bottom corner.
    const p: Vec2 = { x: 96 - HW, y: 70 };
    for (let i = 0; i < 80; i++) moveAndCollide(p, 3, 3, grid);
    expect(p.y).toBeGreaterThan(160);
    expect(p.x).toBeGreaterThan(96 + HW);
  });

  it('fits through a one-tile-wide corridor', () => {
    const corridor = new TileGrid(32, ['#.#', '#.#', '#.#', '#.#'], defs);
    const p: Vec2 = { x: 48, y: 48 };
    moveAndCollide(p, 0, 400, corridor);
    expect(p.y).toBe(128 - HH);
    expect(p.x).toBe(48);
  });

  it('pushes the player out if a blocked tile is painted over them', () => {
    const g = new TileGrid(32, grid.toRows(), defs);
    const p: Vec2 = { x: 64, y: 64 };
    g.setType(2, 2, g.indexOfChar('#'));
    g.setType(1, 2, g.indexOfChar('#'));
    g.setType(2, 1, g.indexOfChar('#'));
    g.setType(1, 1, g.indexOfChar('#'));
    expect(isBlocked(p, g)).toBe(true);
    moveAndCollide(p, 0, 0, g);
    expect(isBlocked(p, g)).toBe(false);
  });

  it('reports blocked positions', () => {
    expect(isBlocked({ x: 64, y: 64 }, grid)).toBe(false);
    expect(isBlocked({ x: 112, y: 112 }, grid)).toBe(true);
    expect(isBlocked({ x: 33, y: 64 }, grid)).toBe(true); // box would poke into the left wall
    expect(isBlocked({ x: 2, y: 64 }, grid)).toBe(true);
  });
});

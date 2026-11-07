import { describe, expect, it } from 'vitest';
import { clampView, followView, roundToDevicePixel, snapView } from '../../src/core/map/camera';
import type { MapSize, Vec2 } from '../../src/core/map/types';

const map: MapSize = { width: 2000, height: 1342 };

describe('camera', () => {
  it('clamps the view inside the map', () => {
    const v: Vec2 = { x: -50, y: 5000 };
    clampView(v, 960, 540, map);
    expect(v).toEqual({ x: 0, y: 802 });
  });

  it('centres the view when the map is smaller than the view', () => {
    const v: Vec2 = { x: 0, y: 0 };
    clampView(v, 3000, 2000, map);
    expect(v).toEqual({ x: -500, y: -329 });
  });

  it('snaps onto the target, clamped to the map edge', () => {
    const v: Vec2 = { x: 0, y: 0 };
    snapView(v, { x: 100, y: 100 }, 960, 540, map);
    expect(v).toEqual({ x: 0, y: 0 });
    snapView(v, { x: 1000, y: 700 }, 960, 540, map);
    expect(v).toEqual({ x: 520, y: 430 });
  });

  it('eases towards the target and converges', () => {
    const v: Vec2 = { x: 0, y: 0 };
    followView(v, { x: 1000, y: 700 }, 960, 540, map, 1 / 60);
    expect(v.x).toBeGreaterThan(0);
    expect(v.x).toBeLessThan(520);
    for (let i = 0; i < 300; i++) followView(v, { x: 1000, y: 700 }, 960, 540, map, 1 / 60);
    expect(v.x).toBeCloseTo(520, 1);
  });

  it('follows at the same pace at 60 Hz and 120 Hz', () => {
    const a: Vec2 = { x: 0, y: 0 };
    const b: Vec2 = { x: 0, y: 0 };
    for (let i = 0; i < 30; i++) followView(a, { x: 1000, y: 700 }, 960, 540, map, 1 / 60);
    for (let i = 0; i < 60; i++) followView(b, { x: 1000, y: 700 }, 960, 540, map, 1 / 120);
    expect(a.x).toBeCloseTo(b.x, 3);
  });

  it('rounds to the device pixel grid', () => {
    expect(roundToDevicePixel(10.26, 2)).toBe(10.5);
    expect(roundToDevicePixel(10.2, 1)).toBe(10);
  });
});

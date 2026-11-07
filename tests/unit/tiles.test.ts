import { describe, expect, it } from 'vitest';
import { parseTilemap, parseTiles } from '../../src/core/map/parse';
import { TileGrid, type TileDef } from '../../src/core/map/tiles';

export const defs: TileDef[] = [
  { char: '.', name: 'road', walkable: true, color: '#999999' },
  { char: '#', name: 'wall', walkable: false, color: '#aa5533' },
];

describe('TileGrid', () => {
  const grid = new TileGrid(32, ['#.#', '...', '##.'], defs);

  it('reports size and walkability', () => {
    expect(grid.cols).toBe(3);
    expect(grid.rows).toBe(3);
    expect(grid.width).toBe(96);
    expect(grid.isWalkableTile(1, 0)).toBe(true);
    expect(grid.isWalkableTile(0, 0)).toBe(false);
    expect(grid.isWalkableAt(40, 10)).toBe(true);
    expect(grid.isWalkableAt(10, 10)).toBe(false);
  });

  it('treats everything outside the grid as blocked', () => {
    expect(grid.isWalkableTile(-1, 1)).toBe(false);
    expect(grid.isWalkableTile(1, 3)).toBe(false);
    expect(grid.isWalkableAt(-5, 40)).toBe(false);
    expect(grid.typeAt(9, 9)).toBe(-1);
  });

  it('round-trips through toRows and setType', () => {
    expect(grid.toRows()).toEqual(['#.#', '...', '##.']);
    const copy = new TileGrid(32, grid.toRows(), defs);
    copy.setType(0, 0, copy.indexOfChar('.'));
    copy.setType(99, 99, 0); // ignored
    copy.setType(1, 1, 77); // ignored: no such type
    expect(copy.toRows()).toEqual(['..#', '...', '##.']);
  });

  it('rejects ragged rows, unknown characters and duplicate legend chars', () => {
    expect(() => new TileGrid(32, ['..', '.'], defs)).toThrow(/row 1/);
    expect(() => new TileGrid(32, ['.x'], defs)).toThrow(/unknown tile "x"/);
    expect(() => new TileGrid(32, ['.'], [...defs, ...defs])).toThrow(/duplicate/);
    expect(() => new TileGrid(32, [], defs)).toThrow(/no rows/);
  });
});

describe('parsers', () => {
  it('parses a legend and a map and rejects bad input with a clear message', () => {
    const parsed = parseTiles({ v: 1, tiles: defs });
    expect(parsed).toHaveLength(2);
    const g = parseTilemap({ v: 1, tileSize: 32, rows: ['.#'] }, parsed);
    expect(g.cols).toBe(2);
    expect(() =>
      parseTiles({ v: 1, tiles: [{ char: 'ab', name: 'x', walkable: true, color: '#000000' }] }),
    ).toThrow(/one character/);
    expect(() =>
      parseTiles({ v: 1, tiles: [{ char: 'a', name: 'x', walkable: 'yes', color: '#000000' }] }),
    ).toThrow(/true or false/);
    expect(() =>
      parseTiles({ v: 1, tiles: [{ char: 'a', name: 'x', walkable: true, color: 'red' }] }),
    ).toThrow(/#rrggbb/);
    expect(() => parseTilemap({ v: 1, tileSize: 3, rows: ['.'] }, parsed)).toThrow(/tileSize/);
    expect(() => parseTilemap({ v: 2, tileSize: 32, rows: ['.'] }, parsed)).toThrow(/version/);
    expect(() => parseTilemap({ v: 1, tileSize: 32, rows: [1] }, parsed)).toThrow(/rows\[0\]/);
  });
});

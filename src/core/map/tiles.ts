/** One entry of tiles.json. The Nth entry is the Nth image in the tileset. */
export interface TileDef {
  /** The single character used for this tile in tilemap.json. */
  char: string;
  name: string;
  walkable: boolean;
  /** Swatch colour for the debug editor palette, "#rrggbb". */
  color: string;
}

/**
 * The map as a grid of tile types. Walkability comes from the tile type, so "can the player stand
 * here" is one array lookup. Anything outside the grid counts as blocked.
 */
export class TileGrid {
  readonly cols: number;
  readonly rows: number;
  /** Row-major tile type indexes (positions in `defs`). */
  readonly cells: Uint8Array;
  private readonly walkableByType: Uint8Array;
  private readonly indexByChar = new Map<string, number>();

  constructor(
    readonly tileSize: number,
    rowStrings: readonly string[],
    readonly defs: readonly TileDef[],
  ) {
    if (defs.length === 0 || defs.length > 255) throw new Error('tiles: need 1..255 tile types');
    defs.forEach((d, i) => {
      if (this.indexByChar.has(d.char)) throw new Error(`tiles: duplicate char "${d.char}"`);
      this.indexByChar.set(d.char, i);
    });
    this.walkableByType = Uint8Array.from(defs, (d) => (d.walkable ? 1 : 0));
    this.rows = rowStrings.length;
    this.cols = rowStrings[0]?.length ?? 0;
    if (this.rows === 0 || this.cols === 0) throw new Error('tilemap: no rows');
    this.cells = new Uint8Array(this.cols * this.rows);
    rowStrings.forEach((line, r) => {
      if (line.length !== this.cols) {
        throw new Error(`tilemap: row ${r} has ${line.length} tiles, expected ${this.cols}`);
      }
      for (let c = 0; c < this.cols; c++) {
        const ch = line.charAt(c);
        const idx = this.indexByChar.get(ch);
        if (idx === undefined)
          throw new Error(`tilemap: unknown tile "${ch}" at row ${r}, col ${c}`);
        this.cells[r * this.cols + c] = idx;
      }
    });
  }

  get width(): number {
    return this.cols * this.tileSize;
  }

  get height(): number {
    return this.rows * this.tileSize;
  }

  /** Tile type index, or -1 outside the grid. */
  typeAt(col: number, row: number): number {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return -1;
    return this.cells[row * this.cols + col] ?? -1;
  }

  isWalkableTile(col: number, row: number): boolean {
    const t = this.typeAt(col, row);
    return t >= 0 && this.walkableByType[t] === 1;
  }

  isWalkableAt(x: number, y: number): boolean {
    return this.isWalkableTile(Math.floor(x / this.tileSize), Math.floor(y / this.tileSize));
  }

  indexOfChar(ch: string): number {
    return this.indexByChar.get(ch) ?? -1;
  }

  setType(col: number, row: number, type: number): void {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    if (type < 0 || type >= this.defs.length) return;
    this.cells[row * this.cols + col] = type;
  }

  /** The grid as the strings stored in tilemap.json. */
  toRows(): string[] {
    const out: string[] = [];
    for (let r = 0; r < this.rows; r++) {
      let line = '';
      for (let c = 0; c < this.cols; c++)
        line += this.defs[this.cells[r * this.cols + c] ?? 0]?.char ?? '?';
      out.push(line);
    }
    return out;
  }
}

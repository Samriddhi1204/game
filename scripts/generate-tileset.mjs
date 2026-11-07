// Draws assets/tiles/tileset.png from plain coloured shapes (placeholder art).
// Run `node scripts/generate-tileset.mjs`. Tile N is the Nth entry of src/data/tiles.json.
// To use real art: replace assets/tiles/tileset.png with your own image that follows the same
// layout (below), or edit this script. Nothing else needs to change.
//
// Layout: 8 tiles per row, each tile 32x32 with a 1px margin and 2px spacing. The 1px border
// around every tile repeats the tile's edge pixels ("extrusion") so there are no seams when the
// map is drawn at fractional scales on phones.
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const TS = 32;
const MARGIN = 1;
const SPACING = 2;
const PER_ROW = 8;
const tiles = JSON.parse(
  readFileSync(new URL('../src/data/tiles.json', import.meta.url), 'utf8'),
).tiles;

// ---- tiny software canvas -------------------------------------------------------------------
class Tile {
  constructor() {
    this.px = new Uint8Array(TS * TS * 4);
  }
  set(x, y, c) {
    if (x < 0 || y < 0 || x >= TS || y >= TS) return;
    const i = (y * TS + x) * 4;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
    this.px[i + 3] = 255;
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  circle(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, c);
  }
  fill(c) {
    this.rect(0, 0, TS, TS, c);
  }
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shade = (c, d) => c.map((v) => Math.max(0, Math.min(255, v + d)));

// ---- palette --------------------------------------------------------------------------------
const GRASS = [122, 197, 42];
const ROAD = [150, 154, 158];
const PATH = [210, 213, 216];
const WHITE = [238, 238, 238];

function noise(t, base, seed, amount, density) {
  const r = rng(seed);
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++)
      if (r() < density) t.set(x, y, shade(base, (r() < 0.5 ? -1 : 1) * amount));
}

function grass(t, seed) {
  t.fill(GRASS);
  const r = rng(seed);
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(r() * (TS - 2)) + 1;
    const y = Math.floor(r() * (TS - 3)) + 2;
    t.set(x, y, shade(GRASS, -26));
    t.set(x, y - 1, shade(GRASS, -26));
    t.set(x + 1, y - 1, shade(GRASS, 22));
  }
}

const art = {
  grass: (t) => grass(t, 11),
  grass_flowers: (t) => {
    grass(t, 29);
    for (const [x, y, c] of [
      [7, 8, WHITE],
      [21, 5, [255, 214, 90]],
      [14, 22, [255, 150, 190]],
      [26, 25, WHITE],
    ]) {
      t.rect(x, y, 2, 2, c);
      t.set(x, y, shade(c, -18));
    }
  },
  road: (t) => {
    t.fill(ROAD);
    noise(t, ROAD, 3, 7, 0.12);
  },
  road_dash_h: (t) => {
    art.road(t);
    t.rect(5, 15, 22, 2, WHITE);
  },
  road_dash_v: (t) => {
    art.road(t);
    t.rect(15, 5, 2, 22, WHITE);
  },
  path: (t) => {
    t.fill(PATH);
    const joint = shade(PATH, -26);
    t.rect(0, 15, TS, 1, joint);
    t.rect(0, 31, TS, 1, joint);
    t.rect(7, 0, 1, 15, joint);
    t.rect(23, 16, 1, 15, joint);
    noise(t, PATH, 5, 4, 0.06);
  },
  plaza: (t) => {
    const a = [200, 203, 208];
    const b = [186, 190, 197];
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 2; i++) t.rect(i * 16, j * 16, 16, 16, (i + j) % 2 ? b : a);
    noise(t, a, 7, 4, 0.05);
  },
  track: (t) => {
    const base = [181, 87, 63];
    t.fill(base);
    noise(t, base, 9, 9, 0.14);
    t.rect(0, 10, TS, 1, [226, 176, 156]);
    t.rect(0, 21, TS, 1, [226, 176, 156]);
  },
  field: (t) => {
    for (let j = 0; j < 4; j++) t.rect(0, j * 8, TS, 8, j % 2 ? [104, 166, 48] : [92, 150, 40]);
  },
  roof: (t) => {
    const base = [224, 80, 31];
    t.fill(base);
    for (let row = 0; row < 4; row++) {
      const y = row * 8;
      t.rect(0, y + 7, TS, 1, [168, 52, 18]);
      t.rect(0, y, TS, 1, [240, 112, 62]);
      for (let x = (row % 2) * 4; x < TS; x += 8) t.rect(x, y + 1, 1, 6, [196, 64, 22]);
    }
  },
  wall: (t) => {
    const base = [240, 201, 130];
    t.fill(base);
    t.rect(0, 0, TS, 2, [168, 52, 18]);
    t.rect(0, 28, TS, 4, [206, 166, 100]);
    for (const x of [4, 19]) {
      t.rect(x, 6, 9, 12, [66, 94, 124]);
      t.rect(x + 1, 7, 7, 10, [96, 160, 210]);
      t.rect(x + 1, 7, 7, 2, [150, 205, 240]);
      t.rect(x + 4, 7, 1, 10, [66, 94, 124]);
    }
  },
  rail: (t) => {
    const base = [112, 92, 72];
    t.fill(base);
    noise(t, base, 13, 12, 0.3);
    for (const y of [3, 11, 19, 27]) t.rect(3, y, 26, 3, [72, 50, 34]);
    for (const x of [8, 21]) {
      t.rect(x, 0, 3, TS, [60, 62, 68]);
      t.rect(x + 1, 0, 1, TS, [186, 188, 194]);
    }
  },
  underpass: (t) => {
    const base = [46, 46, 50];
    t.fill(base);
    noise(t, base, 17, 6, 0.12);
    t.rect(0, 4, TS, 1, [76, 76, 82]);
    t.rect(0, 27, TS, 1, [76, 76, 82]);
  },
  tree: (t) => {
    grass(t, 41);
    t.circle(16, 28, 9, shade(GRASS, -40));
    t.circle(16, 15, 13, [36, 118, 40]);
    t.circle(13, 12, 8, [58, 150, 54]);
    t.circle(11, 10, 3, [96, 184, 84]);
  },
  arch: (t) => {
    grass(t, 53);
    t.rect(5, 3, 22, 26, [160, 100, 75]);
    t.rect(5, 3, 22, 3, [196, 136, 104]);
    for (let y = 8; y < 28; y += 5) t.rect(5, y, 22, 1, [120, 72, 52]);
    for (let y = 8, k = 0; y < 28; y += 5, k++)
      for (let x = 5 + (k % 2) * 5; x < 27; x += 10) t.rect(x, y, 1, 5, [120, 72, 52]);
    t.rect(5, 29, 22, 2, [90, 56, 40]);
  },
  table: (t) => {
    art.plaza(t);
    for (const [x, y] of [
      [16, 5],
      [16, 27],
      [5, 16],
      [27, 16],
    ])
      t.circle(x, y, 3, [120, 84, 58]);
    t.circle(16, 17, 9, [110, 72, 44]);
    t.circle(16, 16, 9, [160, 112, 68]);
    t.circle(14, 14, 3, [196, 150, 100]);
  },
};

// ---- compose the sheet ---------------------------------------------------------------------
const rows = Math.ceil(tiles.length / PER_ROW);
// Phaser counts the margin on both sides and spacing only between tiles.
const W = 2 * MARGIN + PER_ROW * TS + (PER_ROW - 1) * SPACING;
const H = 2 * MARGIN + rows * TS + (rows - 1) * SPACING;
const sheet = new Uint8Array(W * H * 4); // transparent

function blit(tile, ox, oy) {
  const put = (sx, sy, dx, dy) => {
    const s = (sy * TS + sx) * 4;
    const d = (dy * W + dx) * 4;
    for (let k = 0; k < 4; k++) sheet[d + k] = tile.px[s + k];
  };
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) put(x, y, ox + x, oy + y);
  for (let i = 0; i < TS; i++) {
    put(0, i, ox - 1, oy + i);
    put(TS - 1, i, ox + TS, oy + i);
    put(i, 0, ox + i, oy - 1);
    put(i, TS - 1, ox + i, oy + TS);
  }
  put(0, 0, ox - 1, oy - 1);
  put(TS - 1, 0, ox + TS, oy - 1);
  put(0, TS - 1, ox - 1, oy + TS);
  put(TS - 1, TS - 1, ox + TS, oy + TS);
}

tiles.forEach((def, i) => {
  const t = new Tile();
  const draw = art[def.name];
  if (draw) draw(t);
  else {
    // Unknown tile type: loud magenta checker so a missing drawing is obvious in the game.
    for (let y = 0; y < TS; y++)
      for (let x = 0; x < TS; x++)
        t.set(x, y, (x >> 3) % 2 === (y >> 3) % 2 ? [255, 0, 255] : [40, 0, 40]);
    console.warn(`No drawing for tile "${def.name}"; using the magenta placeholder.`);
  }
  blit(
    t,
    MARGIN + (i % PER_ROW) * (TS + SPACING),
    MARGIN + Math.floor(i / PER_ROW) * (TS + SPACING),
  );
});

// ---- PNG encoder ---------------------------------------------------------------------------
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  Buffer.from(sheet.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = new URL('../assets/tiles/tileset.png', import.meta.url);
writeFileSync(out, png);
console.log(`tileset.png: ${tiles.length} tiles, ${W}x${H}px, ${png.length} bytes`);

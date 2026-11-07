# MNNIT Conquest

A small, funny browser game set on the MNNIT campus. You play a fucchha. The full design is in
[`MNNIT_Conquest_Spec.md`](./MNNIT_Conquest_Spec.md), which is the source of truth.

**Status: Phase 1 (map and input).** Walk the campus map on phone or laptop, with a floating
joystick, WASD/arrows, collision, a following camera, hotspots with a context button, and a
`?debug=1` editor to place hotspots and collision by eye.

**Rule: phone-first quality.** The game must be interactive, smooth and high quality on a phone
browser as well as on desktop. See spec section 1 and `CLAUDE.md`.

## Run

```bash
npm ci
npm run dev          # http://localhost:5173 (also reachable on your LAN for phone testing)
```

## Test

```bash
npm run typecheck
npm run lint
npm run format:check   # npm run format to fix
npm test               # Vitest unit tests (src/core)
npm run validate-data  # stub for now: checks src/data/*.json parse
npm run build
npm run check-size     # initial JS <= 500 KB gz, initial transfer <= 1.5 MB, map <= 600 KB
npm run e2e            # Playwright, desktop + mobile (915x412, touch); builds and serves dist
```

Playwright uses the Chromium already installed in the cloud container (`/opt/pw-browsers`). On a
normal machine run `npx playwright install chromium` once.

## Controls

| Action                                                | Touch                                                          | Keyboard      |
| ----------------------------------------------------- | -------------------------------------------------------------- | ------------- |
| Walk                                                  | Floating joystick: touch anywhere in the left half             | WASD / arrows |
| Context button (Baat karo, Challenge, Tiwari ji, ...) | Button that appears bottom-right near a hotspot                | E / Enter     |
| Fullscreen                                            | Corner button (hidden where the browser has no Fullscreen API) |               |

## Debug editor (`?debug=1`)

Open the game with `?debug=1` (for example `https://<you>.github.io/game/?debug=1`). The editor is
a separate chunk and is never downloaded in normal play.

1. Tap **Edit** to switch from playing to editing. Tap it again to go back to walking.
2. Tools: **Pan** (drag the map), **Hotspots** (drag a hotspot or NPC; drag the square on its
   circle's right edge to change its radius), **Paint** (pick a tile from the palette at the bottom
   right, then drag over the map; **Brush** cycles 1x1, 2x2, 3x3), **Fill rect** (drag a rectangle
   to fill it with the selected tile), **Pick** (tap a tile to copy it into the brush), **Undo**.
   **-**, **+** and **Fit** zoom, **Grid** shows tile lines, **Blocked** tints the tiles you cannot
   walk on (red tint).
3. Leave Edit mode and walk around: your changes apply immediately, so you can test them.
4. Tap **Export**. It copies both files to the clipboard, downloads `tilemap.json` and
   `hotspots.json`, and shows both in a panel with Copy and Download buttons in case the browser
   blocks one of them. Replace `src/data/tilemap.json` and `src/data/hotspots.json` with them
   (or paste them to me) and commit.
5. Edits are kept in this browser's localStorage so an accidental reload does not lose them.
   **Reset layout** clears them. The info box shows player position, FPS, frame time and object
   count.

`npm test` checks that the spawn is on a walkable tile, every interactive hotspot is on a walkable
tile reachable from it, and no stray walkable tile is cut off, so a bad export fails CI instead of
walling something off.

## Rendering quality

Layout is 960x540 logical units. The backing canvas is `RENDER_SCALE` (1 or 2) times larger so
text and map edges stay sharp on hi-dpi phones. It is chosen automatically; add `?rs=1` or `?rs=2`
to the URL to compare. If a phone drops frames at 2, try `?rs=1` and tell me the numbers.

## Build and deploy

`npm run build` writes a static site to `dist/` (Vite `base: './'`, hashed filenames).

CI (`.github/workflows/ci.yml`) runs install, typecheck, lint, prettier, unit tests, data
validation, build, size budget and e2e on pushes to `main` and `claude/**`, on `phase-*` tags and
on pull requests. It uploads the Pages artifact and deploys **only on `main`**.

One-time setup for the live link: merge to `main`, then in the repo go to
**Settings > Pages > Source: GitHub Actions**.

## Layout

```
src/core/    Pure TypeScript: no Phaser, no DOM, no Math.random (enforced by ESLint)
             map/ = collision, camera, hotspots, data parsing
src/game/    Phaser layer: scenes, error handling, portrait pause
src/data/    JSON content: tiles.json (legend), tilemap.json (the map), hotspots.json (more per phase)
assets/      tiles/tileset.png (map tiles); map.webp is the old painted map, kept as a reference only
scripts/     validate-data, check-size-budget, generate-tileset
tests/       unit/ (Vitest), e2e/ (Playwright)
```

Content (lines, names, numbers) will live in `src/data/*.json`.

## Notes and deviations from the spec

- **Tile map instead of a painted picture.** You asked for a tiled map where the character stays
  on the road, so spec section 12 changed in v2.2. The map is 64 x 42 tiles of 32 px
  (2048 x 1344 px). `src/data/tilemap.json` is the layout: one string per row, one character per
  tile, with the legend in `src/data/tiles.json` (which tile is walkable, its swatch colour). The
  first layout was traced from your painted map.
- **Walkable tiles:** roads (plain and dashed), kerb paths, the canteen plaza, the running track and
  the underpass. Everything else blocks.
- **Changing the look:** the tile pictures are in `assets/tiles/tileset.png`, 32 px tiles with a 1 px
  margin, 2 px spacing and 1 px extruded edges (this stops seams on phones). The Nth entry in
  `tiles.json` is the Nth picture, left to right, top to bottom. Paint over the PNG in any image
  editor, or replace it with the same layout. `node scripts/generate-tileset.mjs` redraws the
  placeholder art. To add a tile type, add it to `tiles.json`, add its picture to the sheet, and use
  its character in `tilemap.json` (or paint it in the debug editor).
- **Phaser 3.90** (`~3.90.0`) is pinned because the npm default is now Phaser 4.
- Portrait pause uses `game.pause()` and `game.resume()` driven by `matchMedia`. The app mirrors
  state to `data-scene`, `data-paused` and `data-load-error` on `<html>` for e2e tests.
- `npm audit` reports one moderate advisory (`minimatch` DoS) inside `typescript-eslint`'s
  dev dependencies. It is lint tooling only and is not in the shipped bundle.

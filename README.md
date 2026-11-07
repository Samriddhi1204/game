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
2. Tools: **Pan** (drag the map), **Select/Move** (drag a hotspot or NPC, drag a rect, drag a
   white corner square to resize a rect, drag the square on a hotspot circle's right edge to change
   its radius; dragging empty ground pans), **Draw rect** (drag on empty map to add a collision
   rect), **Delete** (removes the selected rect). **-**, **+** and **Fit** zoom; **Overlay** shows or hides
   the shapes.
3. Leave Edit mode and walk around: your changes apply immediately, so you can test them.
4. Tap **Export**. It copies both files to the clipboard, downloads `hotspots.json` and
   `collision.json`, and shows both in a panel with Copy and Download buttons in case the browser
   blocks one of them. Replace `src/data/hotspots.json` and `src/data/collision.json` with them
   (or paste them to me) and commit.
5. Edits are kept in this browser's localStorage so an accidental reload does not lose them.
   **Reset layout** clears them. The info box shows player position, FPS, frame time and object
   count.

`npm test` checks that the spawn is on free ground and every interactive hotspot is reachable from
it, so a bad export fails CI instead of walling something off.

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
src/data/    JSON content: hotspots.json, collision.json (more per phase)
assets/      map.webp
scripts/     validate-data, check-size-budget
tests/       unit/ (Vitest), e2e/ (Playwright)
```

Content (lines, names, numbers) will live in `src/data/*.json`.

## Notes and deviations from the spec

- **Map size:** the provided `assets/map.webp` is **2000 x 1342 px**, not the 2048 x 1374 the spec
  says. The file is unchanged. The spec's placeholder coordinates were scaled by 0.9766 into
  `hotspots.json` and `collision.json` as a starting point; re-place them in the debug editor.
- **Phaser 3.90** (`~3.90.0`) is pinned because the npm default is now Phaser 4.
- Portrait pause uses `game.pause()` and `game.resume()` driven by `matchMedia`. The app mirrors
  state to `data-scene`, `data-paused` and `data-load-error` on `<html>` for e2e tests.
- `npm audit` reports one moderate advisory (`minimatch` DoS) inside `typescript-eslint`'s
  dev dependencies. It is lint tooling only and is not in the shipped bundle.

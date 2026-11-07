# MNNIT Conquest

A small, funny browser game set on the MNNIT campus. You play a fucchha. The full design is in
[`MNNIT_Conquest_Spec.md`](./MNNIT_Conquest_Spec.md), which is the source of truth.

**Status: Phase 0 (scaffold).** Tap to start, then a placeholder Map scene. No gameplay yet.

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

## Debug

`?debug=1` is reserved for the Phase 1 debug editor. It does nothing yet.

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
src/game/    Phaser layer: scenes, error handling, portrait pause
src/data/    JSON content (empty until Phase 3+)
assets/      map.webp
scripts/     validate-data, check-size-budget
tests/       unit/ (Vitest), e2e/ (Playwright)
```

Content (lines, names, numbers) will live in `src/data/*.json`.

## Notes and deviations from the spec

- **Map size:** the provided `assets/map.webp` is **2000 x 1342 px**, not the 2048 x 1374 the spec
  says. The file is unchanged. Phase 1 placeholder coordinates will be re-placed in the debug
  editor, so this costs nothing.
- **Phaser 3.90** (`~3.90.0`) is pinned because the npm default is now Phaser 4.
- The Map scene shows the map scaled to fit as a static picture. The spec calls it a blank
  placeholder; this proves the hashed asset pipeline and the loading bar on a real phone.
- Portrait pause uses `game.pause()` and `game.resume()` driven by `matchMedia`. The app mirrors
  state to `data-scene`, `data-paused` and `data-load-error` on `<html>` for e2e tests.
- `npm audit` reports one moderate advisory (`minimatch` DoS) inside `typescript-eslint`'s
  dev dependencies. It is lint tooling only and is not in the shipped bundle.

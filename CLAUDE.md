# MNNIT Conquest: project rules

`MNNIT_Conquest_Spec.md` is the source of truth. Read it before changing anything, work one phase
at a time, and stop after each phase to report (spec section 21). Do not add features that are not
in the spec; suggest them instead.

## Non-negotiables

- **Phone-first quality.** The game must be interactive, smooth and high quality on a phone
  browser as well as on desktop (spec section 1). That means crisp text and map edges at device
  resolution (`RENDER_SCALE` in `src/game/config.ts`), 60 fps, instant touch response, big touch
  targets, safe-area insets respected. If a change helps desktop but hurts the phone, it is wrong.
- **Layering.** `src/core` is pure TypeScript: no Phaser, no DOM, no `Math.random`. ESLint
  enforces it. Game rules live in core; `src/game` only feeds input in and draws state out.
- **Gameplay reads named actions only** (`InputState`), never keys or pointers.
- **No allocations in update loops.** Pool objects; no per-frame strings or arrays in hot paths.
- **Content lives in `src/data/*.json`**, validated by `scripts/validate-data.mjs`.
- **Never claim something works on a device you cannot test on.** Say what must be checked on a
  real phone.
- No real person's name or likeness (except Tiwari ji, affectionately). No generated art.

## Fight simulation rules

- `src/core/sim` is deterministic: fixed 60 Hz steps, seeded RNG only, state mutated in place, no
  allocation per step. Same seed + same inputs must give the same `Sim.hash()`.
- Rendering reads sim state after a step and may interpolate; it never writes to it.
- Every number comes from `src/data/combat.json` (range-checked by `parseCombat`).
- Fairness limits are enforced in the sim and tested: nothing may keep a fighter unable to act for
  more than 60 frames in a row (hitstop included); a blockable attack's windup is at least 20 frames.
- New fighter states must be added to the transition table in `core/sim/states.ts` with a test.

## Gates (all must pass before a phase is done)

`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run validate-data`,
`npm run build`, `npm run check-size`, `npm run e2e`.

## Coordinates

Layout and game coordinates are logical (960x540). The map is a tile grid (`src/data/tilemap.json`,
32 px tiles, 64 x 42 = 2048 x 1344 px, legend in `tiles.json`); hotspot positions in
`hotspots.json` are in map pixels. The player may only walk on walkable tiles (roads, kerbs, plaza,
track, underpass). Tile pictures are `assets/tiles/tileset.png` (see `scripts/generate-tileset.mjs`).

Branch `main` deploys to GitHub Pages.

# MNNIT Conquest — Build Spec v2.1

> **For the coding assistant:** This file is the source of truth. Read all of it before writing any code. If something here conflicts with what you would normally do, follow this file and tell me. Work one phase at a time (section 20) and stop after each phase.

A small, funny, timepass browser game set on the MNNIT campus. You play a fucchha (first-year). Walk a top-down campus map, build a bond with a senior who funds you, buy snacks from Tiwari ji, and fight the five department professors in side-view fights, in any order. Beat all five and the Admin Block opens for the final fight with the Director. Along the way, the TPR (Training & Placement Representative) and his gang run placements for themselves, and Jalan Kumar dismisses every win you get.

---

## 1. Goals, in priority order

1. **Loads fast, runs smooth, easy to play.** Steady 60 fps on a mid-range Android phone. Playable within 3 seconds on 4G. Controls a non-gamer understands in 10 seconds.
   - **Phone-first quality (mandatory rule, added in v2.1).** The map and every screen must be interactive, smooth and high quality on a phone browser as well as on desktop. Concretely: crisp rendering at device resolution (text and map edges never look blurry on a hi-dpi phone); touch input that responds on the first frame of a touch; no dropped frames while walking or panning; touch targets at least 48 css px (80 logical px for the main action buttons); nothing hidden under a notch, home bar or browser bar; and no feature that only works with a mouse or keyboard. A change that makes the phone experience worse is a bug, even if desktop looks fine.
2. **Funny.** The jokes are the product. Every screen a player sees often (fights, loss screen, map encounters) carries jokes, and joke text always comes from rotating pools so it doesn't repeat.
3. **Robust.** No crashes, no soft-locks, no corrupted saves. Every failure path has a defined behaviour.
4. **Small and finished.** Build exactly what is specified. Content (lines, names, numbers) lives in JSON so I can edit it without touching code.

**Non-goals for v1:** backend, accounts, multiplayer, leaderboards, analytics or tracking, in-app purchases, Director Mode, a tutorial, collectible coins on the map. The game makes no network requests after the initial load (except lazy-loading its own assets).

## 2. Hosting and cost

- **Static site only. No server, no database.** Everything runs in the browser and saves to localStorage.
- Deploy with **GitHub Pages via GitHub Actions** (free). Cloudflare Pages is an acceptable free alternative.
- Total running cost: **₹0.** A custom domain is optional and is the only possible cost.
- Set up deployment in **Phase 0**, so every phase can be tested on my phone through a live link.

## 3. Tech stack

- **Phaser 3** (WebGL with Canvas fallback), **TypeScript** (strict), **Vite**. Static build only. Check the current Phaser docs for config options instead of relying on memory.
- **Vitest** for unit tests, **Playwright** for end-to-end tests, **ESLint** + **Prettier**.
- npm, Node LTS, lockfile committed.
- Ask me before adding any other runtime dependency. No UI frameworks.

## 4. Architecture

Strict layering. `src/core` must never import Phaser or touch the DOM (enforce with ESLint `no-restricted-imports` on `src/core/**`).

```
/src
  /core        Pure TypeScript, fully unit-testable
    sim/       Fight simulation (fixed timestep), fighter state machine, hit resolution, status effects
    ai/        Boss AI (data-driven), boss traits
    economy/   Money, perks, permanent rewards
    progress/  Conquests, win count, story beats, unlocks
    dialogue/  Dialogue runner (lines, choices, conditions, rotating pools)
    save/      Save schema, versioning, validation, migration
    rng.ts     Seeded RNG (never Math.random in core)
    types.ts
  /game        Phaser layer: scenes, rendering, input, UI. No game rules here.
    scenes/    Boot, Preload, TapToStart, Map, Fight, Result, Ending, Error
    input/     Input abstraction + keyboard + touch
    ui/        Dialogue box, shop, HUD, touch controls, modals
    debug/     Lazy-loaded via dynamic import, only with ?debug=1
  /data        JSON content with typed loaders
/assets        map.webp, sprite atlases, audio
/scripts       validate-data, check-size-budget
/tests         unit/ and e2e/
```

Rules:
- Core exposes pure functions or small classes, e.g. `step(state, inputs) -> state`. The Phaser layer feeds inputs in and draws state out.
- Scenes clean up everything they create (listeners, tweens, timers, pooled objects) on shutdown.
- One `GameState` store with typed accessors; no other global mutable singletons.

## 5. Display, platforms, controls

- **Targets:** Chrome Android and Safari iOS in landscape, plus desktop browsers.
- **Resolution:** fixed **logical** size 960x540, Phaser scale mode FIT, centred, letterboxed. All layout and game coordinates use logical units. The backing canvas is `RENDER_SCALE` times larger (1 or 2, chosen from `devicePixelRatio` and window size; `?rs=1` or `?rs=2` overrides it) so text and map edges stay sharp on hi-dpi phones. Text is rasterised at that scale. If 2x costs frames on a weak phone, report the measured numbers and lower the default instead of accepting a blurry or choppy game.
- **Portrait:** "Rotate your phone" overlay; pause until landscape.
- **Page setup:** viewport meta with `viewport-fit=cover`, no user scaling; `touch-action: none`; disable text selection, long-press callouts, context menu, pull-to-refresh, double-tap zoom, and page scroll. Keep touch UI inside safe-area insets.
- **Tap to start** screen after loading (unlocks audio on mobile).
- **Fullscreen button** where the Fullscreen API exists; hidden otherwise.

### Input abstraction (mandatory)

Gameplay reads only named actions: `moveX`, `moveY` (analog -1..1), `attack`, `heavy`, `block` (held), `dodge`, `special`, `interact`, `pause`. Keyboard and touch write into it. Gameplay never reads keys or pointers directly.

**Simple controls are a top requirement.**

| Action | Touch | Keyboard |
|---|---|---|
| Move | Floating joystick, bottom-left | WASD / arrows |
| Block | Hold joystick **away** from the professor | Hold away, or L |
| Punch | **Attack** button | J |
| Heavy | Joystick **toward** the professor + Attack | K (direct) |
| Dodge | **Dodge** button | Space |
| Special "LITE LO" | Button appears only when meter is full | I |
| Interact / Challenge | Context button on the map | E / Enter |
| Pause | Pause icon top corner | Esc |

- Touch: only **two** permanent buttons on the right (Attack, Dodge), each at least 80 px at 960x540, well spaced. Special appears as a third button when the meter is full. Icons, not words (fist, dash arrow, star). Handle at least 3 simultaneous pointers.
- Register touch buttons on **pointer down**. Sample input once at the start of each fixed sim step.
- **Input buffer:** 6 frames.
- **No tutorial.** During the player's first fight only, small icon hints fade in next to the buttons for a few seconds. No text, no pause.
- The "toward = heavy, away = block" scheme is a feel risk. Flag it in the Phase 2 playtest checklist; alternative if it feels bad: hold Attack for 12+ frames = heavy.

### Map controls
Joystick to walk. When near something, one context button appears ("Baat karo", "Challenge", "Tiwari ji"). That's it.

## 6. Game overview

### Core loop
Spawn at Ganga Gate → choose **any** section → (optional: talk to the Senior for money, buy snacks from Tiwari ji) → **Challenge** → fight → win → story beat + new Senior round unlocks → pick the next section → after 5 wins the Admin Block unlocks → Director → ending.

- **Free order.** All five sections are open from the start.
- **Story beats are keyed to win count (1–5), never to which section was beaten.**
- **Losing costs nothing.** Marksheet loss screen, then "Lite lo, phir se" restarts instantly with no loading.
- **Characters never block progress.** Nothing a map character does can make the game unwinnable.
- **Health is CGPA.** Internally HP (default 100); displayed as CGPA = HP / 10 with one decimal, starting at 10.0. Damage pops as "−0.6 CGPA".
- **"Lite lo"** is the game's catchphrase: the special move, the retry button, the pause menu title, and the Director's last line.

### Tone and content safety (mandatory)
- **No real person's name or likeness** in code, data, or assets, except Tiwari ji, who is written only affectionately. Professors use fictional pun nicknames. Joke about situations (grades, attendance, placements, lectures), never about anyone's appearance.
- Juniors address seniors as "sir" — this is normal MNNIT culture and is portrayed as respect, never fear. The Senior is warm.
- No copyrighted meme images, music, or film audio. Meme formats in text are fine.
- All text lives in `data/*.json`.

## 7. Cast (v1)

| # | Character | Role | Where |
|---|---|---|---|
| 1 | Maths prof (working name "Godfather of Calculus") + **evil TA** | Boss | Yamuna Canteen (default) |
| 2 | EE prof (working name "Prof. Polite Current") | Boss | SVBH (default) |
| 3 | ECE prof ("Prof. Signal") | Boss | Academic Building (default) |
| 4 | Mechanical prof ("Thermo Sir") | Boss | Athlete Ground (default) |
| 5 | CSE prof ("Prof. Infinite Loop") | Boss | MP Hall (default) |
| 6 | The Director | Final boss | Admin Block |
| 7 | The Senior | Bank, bond track | Near the hostel road |
| 8 | TPR Bhai + Chintu & Pintu (silent sidekicks) | Villain arc | Notice board / roams |
| 9 | Jalan Kumar | Reacts to every win and loss | Appears after fights |
| 10 | Tiwari ji | The only shop | Yamuna Canteen counter |
| 11 | The player (the fucchha) | Silent protagonist | — |

Section-to-boss mapping is data (`sections.json`), not code.

## 8. Story beats (keyed to win count)

| After win | Beat |
|---|---|
| 0 (start) | TPR Bhai walks past with Chintu and Pintu. Notice board says *"Notice group pe daala tha."* (group "TPR Official (3 members)"). |
| 1 | Jalan Kumar's first dismissal (line keyed to the boss just beaten). Senior round 2 unlocks. |
| 2 | Shortlist board updates: TPR Bhai, Chintu, Pintu. Player: *"under process."* |
| 3 | TPR Bhai turns friendly: *"Bhai apna code bhej de, bas dekhna hai."* Player chooses send / don't send (outcome is the same story beat: he gets shortlisted "with project: your code" — if refused, he got it from Chintu). |
| 4 | Shortlist shows TPR with your project. The **chit event** is armed for the next fight (section 9.4). |
| 5 | Admin Block unlocks. Senior: *"Ja, Director ko dikha de."* |
| Ending | Credits: TPR placed ("Package: NDA hai"), Chintu placed (same company, same team), Pintu placed ("Criteria: dosti"), You: "Conquered all of MNNIT. Placement status: under process." Jalan Kumar: *"Director bhi easy hai waise."* Post-credits: TPR *"Bhai referral chahiye toh bolna 😊"* → **Seen.** Then "Director Mode: coming soon." |

Jalan Kumar also appears on every loss screen with a rotating line ("Dekha? Bola tha na.").

## 9. Economy

One resource: **money.** No coins on the map.

### 9.1 The Senior (the only income)
- Bond track with 5 rounds. **Round 1** is available from the start; **round n+1 unlocks after win n** (so he can't be farmed).
- Each round: a short intro conversation with 3 multiple-choice questions. Answers using "sir" and the right details earn a bonus; wrong answers get a gentle tease (*"Sir bolte hain, fucchha. Chal, aage bol."*), never a penalty.
- Every round always pays at least its base amount. Defaults: 60, 80, 100, 120, 150 base; +10 per right answer.
- A hidden fourth option, **"Lite lo sir 🙏"**, plays a rare-outcome line pool (most outcomes: he laughs it off; ~1 in 10: an extra-funny payoff). No mechanical penalty.
- Personality arc: friendly from the start, more personal each round, warns you about TPR Bhai by round 4.
- **Fallback:** if you can't afford a snack at Tiwari ji, the Senior covers the difference **once per win cycle**: *"Kitne kam hain? Le, baad mein chai pila dena."*

### 9.2 Tiwari ji (the only shop)
- Counter at Yamuna Canteen, separate hotspot from the boss Challenge.
- Snacks are perks that apply to **the next fight, wherever it is**, and are consumed when that fight starts. Up to 2 perks per fight.
- Can't afford → button disabled, cost shown, line *"Udhaar band hai beta. Lite lo."*
- Default menu (all data):

| id | Name | Effect | Cost |
|---|---|---|---|
| `chai_samosa` | Chai samosa | `maxHpBonus` +25 (+2.5 CGPA) | 40 |
| `bun_maska` | Bun maska | `specialStart` 50 | 60 |
| `cold_coffee` | Cold coffee | `staminaRegenMult` 1.5 | 50 |
| `extra_chutney` | Extra chutney | `damageMult` 1.15 | 70 |
| `tiwari_special` | Tiwari ji special | `revealWeakness` | 80 |

### 9.3 Permanent rewards on conquest (defaults)
Maths: +15 max HP · EE: +25% special meter gain · ECE: weakness hint always shown · Mechanical: +10% damage · CSE: dodge costs 20% less stamina.

### 9.4 The chit event (one time)
At the Challenge prompt of the first fight after win 4, offer: *"Rakh le chit? Pakka aayega."* (+25% damage).
- **Yes:** at the boss's first phase change, TPR Bhai pops in at the screen edge: **"SIR! Isne chit rakhi hai!"** The chit is removed, and the boss gets +aggression for that phase only. TPR: *"Sorry bhai, integrity bhi koi cheez hoti hai."* Net effect must stay roughly neutral (test it).
- **No:** TPR appears anyway: *"Hmm. Aaj nahi pakda. Agli baar."* No effect.

### Perk effect types the engine must support
`maxHpBonus`, `damageMult`, `specialStart`, `staminaRegenMult`, `dodgeCostMult`, `revealWeakness`, `specialGainMult`.

## 10. Combat spec

Side-view 1v1. One arena per section (solid colours first, themed backgrounds later). All numbers are **defaults to tune** and live in `data/combat.json` and `data/fighters.json`.

### Simulation
- Fixed timestep, 60 steps/s, accumulator in the Fight scene. Max 5 steps per rendered frame. When the tab returns from hidden, reset the accumulator.
- Deterministic: same seed + same input sequence = identical state hash. Seeded RNG only. Rendering may interpolate but never changes state.
- Hitstop is part of the simulation.

### Fighter states
`idle, walk, punch, heavy, block, dodge, hurt, blockstun, special, stunned, knockdown, ko`. Explicit transition table with tests. Impossible transitions throw in dev and are logged-and-ignored in release.

### Default frame data (60 Hz)
| Action | Startup | Active | Recovery | Damage | Notes |
|---|---|---|---|---|---|
| Punch | 5 | 3 | 9 | 6 | Chains: on hit, can cancel into the next punch from recovery frame 1–8. Up to 3 punches per chain. hitstun 14, blockstun 8, meter +6 |
| Heavy | 16 | 4 | 24 | 18 | hitstun 24, blockstun 14, knockback, meter +12 |
| Block | 2 | held | 4 | — | −80% damage. No movement while blocking. |
| Dodge | 2 | 20 total | 4 | — | Invulnerable frames 3–13, ~140 px, costs 30 stamina, from idle/walk/block |
| Special "LITE LO" | 12 | 6 | 30 | 35 | Needs full meter (100), costs all of it. Also clears all player debuffs and restores 30 stamina. Blockable but breaks block for 20 frames. |

- Player base: HP 100, stamina 100 (regen 25/s starting 30 frames after the last spend), meter 0–100 (gains from landing and taking hits).
- Hitboxes/hurtboxes are AABBs in data, relative to the fighter, mirrored by facing.

### Status effects (core, data-driven)
`slow` (move speed mult), `dodgeShort` (dodge distance mult), `stun` (frozen N frames), `specialLock` (special unusable N frames), `meterDrain` (meter −X per second for N frames), `blockDisabled` (N frames), `enraged` (boss aggression/cooldown modifiers). Each has a duration, is visible on the HUD as an icon, and is cleared by LITE LO.

### Attack archetypes
`melee`, `projectile` (pooled), `loopProjectile` (leaves, circles the arena, returns), `shockwave` (ground wave, must be blocked or dodged), `areaShock` (around the boss, dodge only), `slowZone`, `zone` (boss claims part of the arena; standing in it causes chip damage), `pull` (drags the player toward the boss), `rollCall` (see below). Any attack may apply a status effect on hit.

**`rollCall`:** boss shouts "ROLL NUMBER <n>!" with a ≥30-frame telegraph, then opens a response window (default 40 frames). Pressing **dodge** in the window = *"Present sir!"*: no damage, boss `stun` 30 frames. Missing = *"ABSENT. Attendance short."*: player `stun` 40 frames + damage.

### Boss traits (data flags)
- `comboOnlyDamage`: punches 1 and 2 of a chain deal 0 (show a red "0" stamp); the 3rd hit of a chain deals the chain's total × 1.5. Heavies and the special deal normal damage.
- `tauntDrain`: big attacks show a speech-bubble taunt and apply `meterDrain` while the bubble is on screen.
- `assistant`: a non-targetable side character in the arena with phase-dependent behaviour (laugh text pops on player hit or dropped chain; optional projectile attacks in later phases).

### Boss AI
- State machine reading a per-phase pattern table. Phase changes at HP thresholds with a ~45-frame invulnerable transition and a line from a pool.
- Each phase: weighted attack pool, cooldowns, aggression, spacing.
- **Fairness rules (mandatory, enforced by tests):**
  - Minimum telegraph before any damaging attack: 20 frames; 30 for unblockable, area, or `rollCall` attacks, with a clearly different flash.
  - The AI reads the player with a 12–20 frame reaction delay.
  - The AI cannot start an attack in the 12 frames after the player leaves hitstun.
  - No attack combination may leave the player with no valid defensive option.
  - Status effects can never stack into a state where the player cannot act for more than 60 frames in a row.
- **Weakness system:** each boss has one weakness from `counter_after_dodge`, `heavy_in_recovery`, `punch_after_block`, `special_in_phase_change`, `chain_after_attack` (a full 3-hit chain right after a named attack). Exploiting it = ×1.5 damage + "Weak spot!" cue. Hint shown on the loss screen after the first defeat, or from the start with `revealWeakness`.
- Difficulty is data only. **All five section bosses should be roughly equal in difficulty**, hard in different ways (free order).

## 11. Boss roster (defaults, all in `fighters.json`)

Lines below are starting content; I will add more. Every line slot is a pool.

**Maths — "Godfather of Calculus" (working name)** · traits: `comboOnlyDamage`, `assistant` (evil TA)
Classroom mob boss; never hurries. Look: dark shades, long coat, chalk held like a cigar.
Attacks: "Seedha Zero" (giant red 0 stamp, `areaShock`, slow), "Mera Ilaaka" (`zone`, half arena), "Supply Bhejunga" (`melee`, heavy knockback), chalk flick (`projectile`). Phase 2: "Step Marking? Kabhi Nahi" (ignores the next partial chain).
TA: laughs on player hits/dropped chains; phase 2 throws red-pen marks (`projectile`); on the loss screen, laughing in the corner.
Weakness: `chain_after_attack` (after "Seedha Zero").
Lines: intro *"Mere ilaake mein aaye ho? Paper toh dena padega."* · phase *"Ab tak shuru nahi kiya tha maine."* · defeat *"...Full marks. Kisi ko batana mat."* · loss *"Marks: 0. Method bhi galat, answer bhi galat."*, *"TA ko hasi aa gayi. Badhai ho."*

**EE — "Prof. Polite Current" (working name)** · trait: `tauntDrain`
Soft-spoken, perfectly polite, devastatingly blunt. The politer the sentence, the bigger the hit.
Attacks: "Beta, Ek Minute" (quick zap), "Kirchhoff's Law" (`loopProjectile`), "Basic Concept Clear Nahi Hai" (`areaShock`; telegraph: takes off glasses), "Grounding" (`pull`). Special: "With All Due Respect" (long polite telegraph, unblockable, dodge only).
Weakness: `special_in_phase_change` (he's busy explaining in depth).
Lines: intro *"Aaiye, baithiye. Aaj hum aapki ghalatfehmiyon ko depth mein samjhenge."* · phase *"Aapki koshish dekh ke achha laga. Kaafi nahi thi, par achha laga."* · defeat *"Very good. Aaj aapne kuch seekha. Main proud hoon... thoda sa."* · loss *"Main aapko dosh nahi doonga. Aapke basics ko doonga."*, *"Aapke answer mein confidence tha. Sirf confidence tha."*

**ECE — "Prof. Signal"**
Attacks: "Noise" (spray of small `projectile`s), "Amplifier" (glow telegraph; next attack ×2), "Signal Lost" (vanishes, reappears with a flash, then attacks), "Pop Quiz" (`shockwave`), "Roll Call" (`rollCall`).
Weakness: `counter_after_dodge`.
Lines: *"Signal clear nahi hai tumhara. Bandwidth kam hai."* · defeat *"Signal received. Attendance de di."*

**Mechanical — "Thermo Sir"**
Heavy hitter. Attacks: "Gear Grinder" (spinning `melee`), "Torque" (huge knockback slam), "Friction" (applies `dodgeShort`), "Thermo Blast" (`shockwave`).
Weakness: `heavy_in_recovery`.
Lines: *"Efficiency 100% kabhi nahi hoti."* · defeat *"Theek hai, machine chal gayi."*

**CSE — "Prof. Infinite Loop"**
Attacks: "Infinite Loop" (`slowZone` with a lecture bubble "...aur ek cheez..."), "Segfault" (`projectile` applying `stun` 30), "Compile Error" (applies `specialLock`), "Recursion" (repeats its last attack once).
Weakness: `punch_after_block`.
Lines: *"Code chala? Comment kahan hai?"* · defeat *"Exit code 0. Jao."*

**The Director (final boss, 3 phases)**
Phase 1: attack pool from Maths + EE. Phase 2: ECE + Mechanical + **"Surprise Circular"** (banner announces a rule change; applies `blockDisabled` for 5 s with a 30-frame telegraph). Phase 3: CSE + everything slightly faster. On defeat: *"Lite lo."*
The Director reuses existing attack definitions by id; no new archetypes.

## 12. Map spec

- The world is one painted image: **`assets/map.webp`, 2048 × 1374 px** (provided, ~140 KB). No tile map.
- Check `maxTextureSize` at runtime; show a clear error if the map exceeds it.
- **Movement:** 220 px/s default, delta-time based, delta clamped, diagonals normalised, joystick magnitude scales speed.
- **Collision:** player feet-box 24x16. Static obstacles are rectangles in `data/collision.json`. Axis-separated AABB (x then y), no physics engine, no tunnelling, no corner sticking. Unit-tested in core.
- **Camera:** follows the player, clamped to world bounds, `MAP_ZOOM` constant (default 1.0), light smoothing, positions rounded to the device-pixel grid so the map never shimmers. The map and the UI use separate cameras, so `MAP_ZOOM` never scales the UI.
- **Hotspots** (`data/hotspots.json`): point + radius. Entering shows the context button once; must leave the radius before it triggers again. Locked hotspots show "Locked" + a hint. Conquered sections show "Conquered" (no re-fight in v1).
- **Labels:** section names drawn by the game over the map.
- **NPCs** on the map are placeholder coloured circles with name labels; positions in `hotspots.json`.

### Placeholder positions (map pixels, 2048×1374; refine in the debug editor)
| id | x, y | Notes |
|---|---|---|
| `ganga_gate` (spawn) | 230, 690 | West gate arches on the main road |
| `yamuna_canteen` | 520, 150 | Building with tables, top-left past the roundabout |
| `tiwari_ji` | 470, 160 | Counter beside the canteen |
| `academic_building` | 837, 610 | Big winged building, north of the main road |
| `admin_block` | 837, 760 | Courtyard building south of the road, facing Academic. Locked until 5 wins |
| `athlete_ground` | 1153, 330 | Running track, north of Academic |
| `library` | 1344, 600 | Long building east of Academic (landmark only) |
| `mp_hall` | 1320, 930 | Building with the round driveway |
| `svbh` | 960, 1170 | Long vertical building, south side |
| `underpass` | 1624, 690 | Landmark only |
| `senior` | 900, 1080 | Hostel road |
| `notice_board` | 640, 700 | Near the junction |

### Rough collision rectangles (x1, y1, x2, y2; refine in editor)
Academic 557,349,1117,571 · Library 1180,476,1509,567 · Admin 720,768,955,944 · Canteen building 427,37,540,120 · MP Hall 1247,747,1393,927 · Small canteen 1456,767,1547,873 · Dean's office 564,1040,673,1133 · Computer Centre 736,1033,863,1133 · SVBH 973,1007,1067,1340 · Hostel A 1173,1131,1515,1211 · Hostel B 1173,1264,1515,1347 · Railway north 1589,0,1660,607 · Railway south 1589,773,1660,1374. East of the railway is decoration; the player may walk there through the Underpass.

### Debug editor (`?debug=1`, lazy-loaded, never in the main bundle)
- Shows collision rects, hotspot circles, player coordinates, FPS, frame time, object count.
- Drag hotspots/NPCs; click-drag on empty map to draw collision rects; click a rect to delete or resize it.
- Must work with touch on a phone as well as mouse.
- **Export** button copies and downloads `hotspots.json` and `collision.json` in the exact schema.
- Fight debug: hitbox overlay; cheats: give money, instant win, unlock all, set win count, set HP.

## 13. Dialogue system

- One small runner in `core/dialogue` used by every map character and story beat.
- A dialogue is a list of nodes: `line` (speaker + text, or a pool id), `choice` (2–4 options, each with outcome effects and next node), `effect` (give money, set flag, raise bond).
- Conditions on dialogues: `winCount >= n`, flag set/unset, bond level.
- Pools pick lines with the seeded RNG and avoid repeating the last line used.
- UI: bottom dialogue box, speaker name, tap anywhere / interact to advance, big tappable choice buttons.

## 14. Screens

- **Loss screen = marksheet.** Header "MNNIT — Semester Result". Subject = the professor. Grade from how far you got (boss HP left: >66% F, >33% D, else C). Rotating "Remarks" from the boss's loss pool. "Examiner's note" = weakness hint (after first defeat). Jalan Kumar line at the bottom. Big button **"Lite lo, phir se"** (instant retry) and a small "Map pe wapas" button.
- **Win screen:** defeat line, "Section Conquered" banner, permanent reward shown, then back to the map, where the story beat for the new win count plays.
- **Pause menu:** title "Lite lo". Buttons: "Bas ho gaya" (resume), mute, fullscreen, "Map pe wapas" (from fights), "Reset progress" (with confirmation).
- **Ending:** credits (section 8), then "Director Mode: coming soon", then back to the map.

## 15. Data schemas (validated, versioned)

All content is JSON in `src/data` with typed loaders: `sections.json`, `fighters.json`, `attacks.json`, `combat.json`, `perks.json`, `dialogues.json`, `pools.json`, `storyBeats.json`, `hotspots.json`, `collision.json`.

`scripts/validate-data` runs in tests and CI and must fail on: unknown or duplicate ids, missing references (section → fighter, beat → dialogue, pool ids, attack ids), numbers out of sane ranges, hotspots/rects outside the map, telegraphs below the fairness limits, and empty pools.

```jsonc
// sections.json
{ "id": "yamuna_canteen", "name": "Yamuna Canteen", "fighterId": "maths_prof",
  "reward": { "permanentPerkId": "maths_cgpa_boost" }, "requiresWins": 0 }

// fighters.json (excerpt)
{ "id": "maths_prof", "nickname": "Godfather of Calculus", "department": "Maths",
  "hp": 120, "weakness": "chain_after_attack", "weaknessAttackId": "seedha_zero",
  "traits": ["comboOnlyDamage", "assistant"], "colorTheme": "#3b2f2f",
  "pools": { "intro": "maths_intro", "phase": "maths_phase", "defeat": "maths_defeat", "loss": "maths_loss" },
  "phases": [ { "hpAbove": 0.6, "reactionDelay": 18, "aggression": 0.45,
    "attacks": [ { "attackId": "seedha_zero", "weight": 2, "cooldown": 120 } ] } ] }

// attacks.json (excerpt)
{ "id": "seedha_zero", "name": "Seedha Zero", "type": "areaShock", "telegraph": 36,
  "damage": 16, "blockable": false }

// perks.json
{ "id": "chai_samosa", "name": "Chai samosa", "cost": 40, "seller": "tiwari_ji",
  "effect": { "type": "maxHpBonus", "value": 25 } }
```

## 16. Save system

- Key `mnnit-conquest/save`: `{ v: 1, conquered: [], winCount: 0, money: 0, permanentPerks: [], pendingPerks: [], seniorBond: 0, seniorRoundsDone: 0, flags: {}, seenBeats: [], muted: false }`.
- All storage access in try/catch (Safari private mode, quota). If unavailable: in-memory fallback + a small non-blocking note.
- Validate on load. If invalid or from a newer version: back up to `mnnit-conquest/save.bak`, start fresh, tell the player once. One migration function per version bump, with tests.
- Autosave on: conquest, money change (debounced), dialogue completion, purchase, mute toggle, `visibilitychange` to hidden.

## 17. Performance budget (measure, don't assume)

- 60 fps on a mid-range Android phone; frame time < 16.6 ms; no GC hitches in fights.
- Initial load < 3 s on 4G. Initial transfer ≤ 1.5 MB. Main JS (gzipped, incl. Phaser) ≤ 500 KB — if Phaser alone breaks this, report the real number and propose options.
- `map.webp` ≤ 600 KB (provided file is ~140 KB). Sprites in atlases. Audio compressed, loaded after the game starts.
- Lazy-load fight assets when entering a fight; show a loading bar only for the initial load.
- **No allocations in update loops.** Pools for projectiles, effects, floating text. No per-frame arrays/objects/closures/string building in hot paths.
- Lay out at 960x540 logical units; the backing canvas is `RENDER_SCALE` (1 or 2) times that for crispness. Cheap effects only. Re-measure fps whenever `RENDER_SCALE` or a full-screen effect changes.
- Pause game and audio when the tab is hidden.
- Hashed filenames for caching. No service worker in v1.
- `scripts/check-size-budget` fails CI if limits are exceeded.

## 18. Reliability (mandatory)

- Global `error` / `unhandledrejection` handlers → friendly Error scene with "Reload" and "Reset progress". Details to console only.
- Handle WebGL context loss/restore (prompt reload if restore fails).
- Handle orientation changes, resize, browser bars changing the viewport.
- Audio failures never block gameplay.
- Missing/failed asset → retry option on the loading screen, never a blank screen.
- No scene transition may leak input, timers, tweens, or listeners. Test: loop map → fight → map 20 times; object and listener counts stay flat.

## 19. Quality gates

- TypeScript `strict`, `noUncheckedIndexedAccess`, no `any`, no unused code. ESLint (no floating promises), Prettier.
- **Unit tests (Vitest) for core:** state transitions; punch chains; hit resolution; block/chip damage; dodge i-frames; stamina and meter; every status effect and that LITE LO clears them; `comboOnlyDamage`; `rollCall` success/fail; perks; economy (can't overspend, Senior rounds unlock by win count, fallback once per cycle); story beats by win count in any section order; chit event; collision (corners, fast movement); save load/corruption/migration; dialogue runner (choices, conditions, pools don't repeat); AI fairness rules; determinism (state hash); data validation.
- **E2E (Playwright), desktop + mobile viewport with touch:** loads with no console errors; tap to start; map renders; keyboard and touch movement; hotspot prompt; Senior dialogue pays money; buying at Tiwari ji; a fight starts; debug cheat wins it; conquest persists across reload; reset works; portrait overlay pauses.
- **CI (GitHub Actions):** install, typecheck, lint, unit, data validation, build, size budget, e2e, then deploy to GitHub Pages.
- Zero console errors or warnings in a normal session.
- Small, clear commits. Tag the end of each phase.

## 20. Build phases

Work one phase at a time. At the end of each: run all gates, deploy, commit, tag, then **stop and report** (section 21). Don't start the next phase until I say go.

**Phase 0 — Scaffold + live link.** Vite + Phaser + TS, folders, lint/format/tests, CI with GitHub Pages deploy, size-budget script, error handling, 960x540 FIT scaling, portrait overlay, Tap to start, loading bar, README. *Done when:* CI is green and the live link shows a scaled blank scene on my phone and laptop.

**Phase 1 — Map + input.** Input abstraction, joystick, keyboard, Map scene with `map.webp`, movement, collision, camera, hotspots, context button, placeholder NPC circles, debug editor with export. *Done when:* I can walk smoothly and place all hotspots and collision by eye on phone and laptop, then export the JSON.

**Phase 2 — Combat core.** Pure-core sim, state machine, frame data, punch chains, block-by-holding-away, dodge, stamina, meter, LITE LO special, status effects, HUD with CGPA display, touch buttons, training dummy, hitbox debug. *Done when:* the fight feels responsive and I approve the feel (including the toward=heavy control scheme).

**Phase 3 — First boss.** Boss AI, phases, attack archetypes, traits, weakness system, the Maths boss with the evil TA, marksheet loss screen, win screen, return to map. *Done when:* the fight is fair, winnable, fun, and the fairness tests pass.

**Phase 4 — Characters, economy, saves.** Dialogue runner, the Senior (bond rounds, money, fallback), Tiwari ji shop, perks, permanent rewards, story beats framework, Jalan Kumar lines, save system with migration and corruption handling. *Done when:* the loop works end to end for one section and survives reloads.

**Phase 5 — Content.** The other four bosses, TPR Bhai + Chintu & Pintu arc, notice board/shortlist, chit event, Admin Block unlock, the Director (3 phases), ending credits. *Done when:* the game is completable start to finish in any section order.

**Phase 6 — Polish and ship.** Art/audio hooks (asset-slot naming convention), sound effects and music, cheap screen shake and hit flashes, performance pass, memory-leak loop test. *Done when:* all gates pass and the live link plays well on my phone.

## 21. How to work with me

- Before each phase, post a short plan (files, approach, risks). Ask only if truly blocked; otherwise state your assumption and proceed.
- **Don't generate art.** Use coloured shapes and a clear asset-slot naming convention (e.g. `assets/fighters/<fighterId>/idle.png`) so I can drop real art in later.
- Don't add features or systems not in this file. Suggest them and wait.
- After each phase, report: what's done, the live link, how to run locally, a concrete playtest checklist, assumptions, measured numbers (bundle size, fps, load time), known limitations, and what I must verify on a real phone.
- Never claim something is bug-free or tested on a device you can't test on.
- Keep `README.md` current: run, test, debug, build, deploy, and where content data lives.
- If a requirement is impossible, risky, or conflicts with another, say so and propose the smallest alternative.

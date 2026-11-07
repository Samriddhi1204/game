import { readFileSync } from 'node:fs';
import { parseCombat } from '../../src/core/sim/config';
import type { Fighter } from '../../src/core/sim/fighter';
import { Sim, type SimOptions } from '../../src/core/sim/sim';
import {
  clearIntent,
  createIntent,
  ENEMY,
  PLAYER,
  type FighterStateName,
  type Intent,
} from '../../src/core/sim/types';

export const cfg = parseCombat(JSON.parse(readFileSync('src/data/combat.json', 'utf8')));

export function newSim(opts: SimOptions = {}): Sim {
  return new Sim(cfg, { strict: true, ...opts });
}

export const player = (s: Sim): Fighter => s.fighters[PLAYER];
export const enemy = (s: Sim): Fighter => s.fighters[ENEMY];

/** An intent with only the given fields set. */
export function intent(p: Partial<Intent> = {}): Intent {
  const i = createIntent();
  Object.assign(i, p);
  return i;
}

/** Step `n` times with fixed intents. */
export function run(s: Sim, n: number, p: Partial<Intent> = {}, e: Partial<Intent> = {}): void {
  const pi = intent(p);
  const ei = intent(e);
  for (let k = 0; k < n; k++) s.step(pi, ei);
}

/** Press a button for exactly one step (a tap), then release for the rest of `n` steps. */
export function tap(
  s: Sim,
  key: 'punch' | 'heavy' | 'dodge' | 'special',
  n = 1,
  extra: Partial<Intent> = {},
): void {
  s.step(intent({ [key]: true, ...extra }), intent());
  if (n > 1) run(s, n - 1, extra);
}

/** Put the enemy `dist` pixels in front of the player, both idle. */
export function face(s: Sim, dist: number): void {
  player(s).x = 400;
  player(s).prevX = 400;
  enemy(s).x = 400 + dist;
  enemy(s).prevX = 400 + dist;
}

/** Force a fighter into a state at a given frame (the next step increments the frame first). */
export function put(f: Fighter, state: FighterStateName, frame: number): void {
  f.state = state;
  f.frame = frame;
  f.hitDone = false;
  f.hitConfirmed = false;
  f.releasing = false;
}

export function eventsOf(s: Sim, type: string): { who: number; a: number; b: number }[] {
  return s.events.items.slice(0, s.events.count).filter((e) => e.type === type);
}

export { clearIntent };

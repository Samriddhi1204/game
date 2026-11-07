import type { ActionSet } from './config';
import { STATUS_KINDS, type FighterStateName, type Intent } from './types';

/** Per-fighter tuning from perks and permanent rewards (spec section 9). Neutral by default. */
export interface FighterMods {
  maxHpBonus: number;
  damageMult: number;
  specialStart: number;
  staminaRegenMult: number;
  dodgeCostMult: number;
  specialGainMult: number;
}

export function neutralMods(): FighterMods {
  return {
    maxHpBonus: 0,
    damageMult: 1,
    specialStart: 0,
    staminaRegenMult: 1,
    dodgeCostMult: 1,
    specialGainMult: 1,
  };
}

/** One fighter's complete simulation state. Mutated in place; never reallocated mid-fight. */
export class Fighter {
  x = 0;
  prevX = 0;
  facing: 1 | -1 = 1;
  state: FighterStateName = 'idle';
  /** Frames spent in the current state, counting the frame it started on as 1. */
  frame = 0;
  hp = 0;
  maxHp = 0;
  stamina = 0;
  meter = 0;
  staminaIdle = 0;
  /** 1-based index of the punch in the current chain; 0 when not chaining. */
  chain = 0;
  hitDone = false;
  hitConfirmed = false;
  releasing = false;
  /** Frames of hurt / blockstun left. */
  stunLeft = 0;
  dodgeDir: 1 | -1 = 1;
  kbFrames = 0;
  kbPerFrame = 0;
  /** Consecutive frames spent unable to act. Capped by the sim. */
  streak = 0;
  readonly statusFrames = new Int32Array(STATUS_KINDS.length);
  readonly statusValue = new Float64Array(STATUS_KINDS.length);
  readonly buf = { punch: 0, heavy: 0, dodge: 0, special: 0 };
  readonly held: Intent = {
    moveX: 0,
    punch: false,
    heavy: false,
    block: false,
    dodge: false,
    special: false,
  };
  /** Status this fighter's attacks apply on hit (-1 = none). Used by the training dummy. */
  hitStatusKind = -1;
  hitStatusFrames = 0;
  hitStatusValue = 0;

  constructor(
    public actions: ActionSet,
    public mods: FighterMods,
  ) {}

  hasStatus(kindIndex: number): boolean {
    return (this.statusFrames[kindIndex] ?? 0) > 0;
  }
}

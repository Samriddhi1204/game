import {
  clearIntent,
  ENEMY,
  PLAYER,
  STATUS_KINDS,
  type Intent,
  type StatusKind,
} from '../sim/types';
import type { Sim } from '../sim/sim';

export type DummyMode = 'idle' | 'block' | 'attack' | 'debuff';
export const DUMMY_MODES: readonly DummyMode[] = ['idle', 'block', 'attack', 'debuff'];

/** Statuses the debuff dummy cycles through so every icon and the LITE LO cleanse can be tried. */
const DEBUFF_CYCLE: readonly StatusKind[] = [
  'slow',
  'dodgeShort',
  'specialLock',
  'meterDrain',
  'blockDisabled',
  'stun',
];

/**
 * The training dummy. It stands still, blocks, or walks up and throws slow, clearly telegraphed
 * punches and heavies (the dummy's own frame data starts every attack with a 24+ frame windup).
 * Uses only the sim's seeded RNG, so a fight with a dummy stays deterministic.
 */
export class DummyBrain {
  mode: DummyMode = 'idle';
  private cooldown = 60;
  private nextHeavy = false;
  private debuffIndex = 0;

  setMode(mode: DummyMode): void {
    this.mode = mode;
    this.cooldown = 60;
  }

  cycleMode(): DummyMode {
    const i = DUMMY_MODES.indexOf(this.mode);
    this.setMode(DUMMY_MODES[(i + 1) % DUMMY_MODES.length] ?? 'idle');
    return this.mode;
  }

  update(sim: Sim, out: Intent): void {
    clearIntent(out);
    const me = sim.fighters[ENEMY];
    const pl = sim.fighters[PLAYER];
    if (me.state === 'ko' || sim.over) return;

    if (this.mode === 'block') {
      out.block = true;
      return;
    }
    if (this.mode === 'idle') return;

    const free = me.state === 'idle' || me.state === 'walk';
    if (!free) return;
    const dx = pl.x - me.x;
    const dist = Math.abs(dx);
    const range = sim.cfg.dummy.attackRange;
    if (dist > range) {
      out.moveX = Math.sign(dx) * 0.8;
      return;
    }
    if (this.cooldown > 0) {
      this.cooldown--;
      return;
    }
    // Attack. In debuff mode the hit carries the next status in the cycle.
    me.hitStatusKind = -1;
    if (this.mode === 'debuff') {
      const kind = DEBUFF_CYCLE[this.debuffIndex % DEBUFF_CYCLE.length] ?? 'slow';
      this.debuffIndex++;
      const def = sim.cfg.statuses[kind];
      me.hitStatusKind = STATUS_KINDS.indexOf(kind);
      me.hitStatusFrames = def.frames;
      me.hitStatusValue = def.value;
    }
    if (this.nextHeavy) out.heavy = true;
    else out.punch = true;
    this.nextHeavy = !this.nextHeavy;
    this.cooldown = sim.rng.int(60, 110);
  }
}

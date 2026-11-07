import type { Intent } from './types';

/** The raw named actions from the input layer (a subset of InputState). */
export interface RawInput {
  moveX: number;
  attack: boolean;
  heavy: boolean;
  block: boolean;
  dodge: boolean;
  special: boolean;
}

export interface ResolveConfig {
  heavyScheme: 'toward' | 'hold';
  holdFrames: number;
  stickThreshold: number;
}

/**
 * Turns raw input into a fighter's intent (spec section 5): holding the stick away from the enemy
 * blocks, stick toward + Attack is a heavy. Alternative scheme: holding Attack for `holdFrames` is a
 * heavy. Call once per simulation step.
 */
export class IntentResolver {
  private attackHeld = 0;
  private latchedHeavy = false;

  resolve(raw: RawInput, facing: 1 | -1, cfg: ResolveConfig, out: Intent): void {
    const dir = raw.moveX * facing;
    const toward = dir > cfg.stickThreshold;
    const away = dir < -cfg.stickThreshold;
    out.moveX = raw.moveX;
    out.block = raw.block || away;
    out.dodge = raw.dodge;
    out.special = raw.special;
    out.punch = false;
    out.heavy = raw.heavy;

    if (cfg.heavyScheme === 'toward') {
      if (raw.attack) {
        // The kind is decided on the frame Attack goes down and stays that way until release.
        if (this.attackHeld === 0) this.latchedHeavy = toward;
        this.attackHeld++;
        if (this.latchedHeavy) out.heavy = true;
        else out.punch = true;
      } else {
        this.attackHeld = 0;
      }
      return;
    }

    // "hold" scheme: a tap is a punch (fires on release), a long press is a heavy.
    if (raw.attack) {
      this.attackHeld++;
      if (this.attackHeld >= cfg.holdFrames) out.heavy = true;
    } else {
      if (this.attackHeld > 0 && this.attackHeld < cfg.holdFrames) out.punch = true;
      this.attackHeld = 0;
    }
  }

  reset(): void {
    this.attackHeld = 0;
    this.latchedHeavy = false;
  }
}

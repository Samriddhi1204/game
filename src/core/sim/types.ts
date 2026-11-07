export type FighterStateName =
  | 'idle'
  | 'walk'
  | 'punch'
  | 'heavy'
  | 'block'
  | 'dodge'
  | 'hurt'
  | 'blockstun'
  | 'special'
  | 'stunned'
  | 'knockdown'
  | 'ko';

export type StatusKind =
  'slow' | 'dodgeShort' | 'stun' | 'specialLock' | 'meterDrain' | 'blockDisabled' | 'enraged';

export const STATUS_KINDS: readonly StatusKind[] = [
  'slow',
  'dodgeShort',
  'stun',
  'specialLock',
  'meterDrain',
  'blockDisabled',
  'enraged',
];

export type AttackKind = 'punch' | 'heavy' | 'special';

export const PLAYER = 0;
export const ENEMY = 1;

/** What a fighter wants to do this step. All fields are "held" states; the sim finds the edges. */
export interface Intent {
  /** -1 (left) .. 1 (right) in arena space. */
  moveX: number;
  punch: boolean;
  heavy: boolean;
  block: boolean;
  dodge: boolean;
  special: boolean;
}

export function createIntent(): Intent {
  return { moveX: 0, punch: false, heavy: false, block: false, dodge: false, special: false };
}

export function clearIntent(i: Intent): void {
  i.moveX = 0;
  i.punch = false;
  i.heavy = false;
  i.block = false;
  i.dodge = false;
  i.special = false;
}

export type SimEventType =
  | 'hit'
  | 'blocked'
  | 'blockBreak'
  | 'dodge'
  | 'dodgeDenied'
  | 'special'
  | 'ko'
  | 'statusApplied'
  | 'statusCleared';

export interface SimEvent {
  type: SimEventType;
  /** Fighter the event is about (the one hit, or the one acting). */
  who: number;
  /** Event-specific number: damage for hit/blocked, status index for status events. */
  a: number;
  /** Event-specific number: chain index for hit, attack kind index for others. */
  b: number;
}

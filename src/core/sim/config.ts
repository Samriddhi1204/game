import { bool, numIn, rec, str } from '../guards';
import type { AttackKind, StatusKind } from './types';
import { STATUS_KINDS } from './types';

export interface Box {
  /** Offset from the fighter's x (mirrored by facing) and from the floor (negative is up). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AttackDef {
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  hitstun: number;
  blockstun: number;
  meterGain: number;
  meterOnHurt: number;
  knockback: number;
  hitstop: number;
  knockdown: boolean;
  /** Frames of blockDisabled applied to a blocker (0 = the attack does not break guard). */
  blockBreak: number;
  hitbox: Box;
}

export type ActionSet = Record<AttackKind, AttackDef>;

export interface StatusDefault {
  frames: number;
  value: number;
}

export interface CombatConfig {
  arena: { width: number; floorY: number; wallLeft: number; wallRight: number; color: string };
  start: { playerX: number; enemyX: number };
  hurtbox: Box;
  pushWidth: number;
  inputBuffer: number;
  heavyScheme: 'toward' | 'hold';
  holdFrames: number;
  stickThreshold: number;
  maxHp: number;
  maxStamina: number;
  maxMeter: number;
  staminaRegenPerSec: number;
  staminaRegenDelay: number;
  moveSpeed: number;
  chainMax: number;
  chainCancelFrames: number;
  knockdownFrames: number;
  maxDisabledStreak: number;
  blockHitstop: number;
  block: { startup: number; recovery: number; reduction: number };
  dodge: {
    startup: number;
    total: number;
    invulnFrom: number;
    invulnTo: number;
    moveFrom: number;
    moveTo: number;
    distance: number;
    cost: number;
  };
  special: { restoreStamina: number };
  statuses: Record<StatusKind, StatusDefault>;
  actions: ActionSet;
  dummy: { hp: number; reviveFrames: number; attackRange: number; actions: ActionSet };
}

function box(o: Record<string, unknown>, key: string, path: string): Box {
  const b = rec(o[key], `${path}.${key}`);
  const p = `${path}.${key}`;
  return {
    x: numIn(b, 'x', p, -400, 400),
    y: numIn(b, 'y', p, -400, 0),
    w: numIn(b, 'w', p, 1, 600),
    h: numIn(b, 'h', p, 1, 400),
  };
}

function attack(raw: unknown, path: string): AttackDef {
  const o = rec(raw, path);
  return {
    startup: numIn(o, 'startup', path, 1, 120),
    active: numIn(o, 'active', path, 1, 60),
    recovery: numIn(o, 'recovery', path, 0, 120),
    damage: numIn(o, 'damage', path, 0, 100),
    hitstun: numIn(o, 'hitstun', path, 1, 60),
    blockstun: numIn(o, 'blockstun', path, 1, 60),
    meterGain: numIn(o, 'meterGain', path, 0, 100),
    meterOnHurt: numIn(o, 'meterOnHurt', path, 0, 100),
    knockback: numIn(o, 'knockback', path, 0, 300),
    hitstop: numIn(o, 'hitstop', path, 0, 30),
    knockdown: bool(o, 'knockdown', path),
    blockBreak: numIn(o, 'blockBreak', path, 0, 60),
    hitbox: box(o, 'hitbox', path),
  };
}

function actionSet(raw: unknown, path: string): ActionSet {
  const o = rec(raw, path);
  return {
    punch: attack(o['punch'], `${path}.punch`),
    heavy: attack(o['heavy'], `${path}.heavy`),
    special: attack(o['special'], `${path}.special`),
  };
}

/** Parse and validate combat.json. Every number is range-checked so a typo cannot break a fight. */
export function parseCombat(raw: unknown): CombatConfig {
  const root = rec(raw, 'combat.json');
  if (root['v'] !== 1) throw new Error('combat.json: unsupported version');
  const P = 'combat.json';
  const arena = rec(root['arena'], `${P}.arena`);
  const start = rec(root['start'], `${P}.start`);
  const blockO = rec(root['block'], `${P}.block`);
  const dodgeO = rec(root['dodge'], `${P}.dodge`);
  const specialO = rec(root['special'], `${P}.special`);
  const statusO = rec(root['statuses'], `${P}.statuses`);
  const dummyO = rec(root['dummy'], `${P}.dummy`);
  const scheme = str(root, 'heavyScheme', P);
  if (scheme !== 'toward' && scheme !== 'hold') {
    throw new Error(`${P}.heavyScheme: expected "toward" or "hold"`);
  }
  const statuses = {} as Record<StatusKind, StatusDefault>;
  for (const kind of STATUS_KINDS) {
    const s = rec(statusO[kind], `${P}.statuses.${kind}`);
    statuses[kind] = {
      frames: numIn(s, 'frames', `${P}.statuses.${kind}`, 1, 600),
      value: numIn(s, 'value', `${P}.statuses.${kind}`, 0, 1000),
    };
  }
  const dodge = {
    startup: numIn(dodgeO, 'startup', `${P}.dodge`, 0, 30),
    total: numIn(dodgeO, 'total', `${P}.dodge`, 4, 60),
    invulnFrom: numIn(dodgeO, 'invulnFrom', `${P}.dodge`, 1, 60),
    invulnTo: numIn(dodgeO, 'invulnTo', `${P}.dodge`, 1, 60),
    moveFrom: numIn(dodgeO, 'moveFrom', `${P}.dodge`, 1, 60),
    moveTo: numIn(dodgeO, 'moveTo', `${P}.dodge`, 1, 60),
    distance: numIn(dodgeO, 'distance', `${P}.dodge`, 0, 400),
    cost: numIn(dodgeO, 'cost', `${P}.dodge`, 0, 100),
  };
  if (
    dodge.invulnTo < dodge.invulnFrom ||
    dodge.moveTo < dodge.moveFrom ||
    dodge.total < dodge.moveTo
  ) {
    throw new Error(`${P}.dodge: frame ranges are inconsistent`);
  }
  const cfg: CombatConfig = {
    arena: {
      width: numIn(arena, 'width', `${P}.arena`, 320, 4000),
      floorY: numIn(arena, 'floorY', `${P}.arena`, 100, 540),
      wallLeft: numIn(arena, 'wallLeft', `${P}.arena`, 0, 2000),
      wallRight: numIn(arena, 'wallRight', `${P}.arena`, 100, 4000),
      color: str(arena, 'color', `${P}.arena`),
    },
    start: {
      playerX: numIn(start, 'playerX', `${P}.start`, 0, 4000),
      enemyX: numIn(start, 'enemyX', `${P}.start`, 0, 4000),
    },
    hurtbox: box(root, 'hurtbox', P),
    pushWidth: numIn(root, 'pushWidth', P, 1, 200),
    inputBuffer: numIn(root, 'inputBuffer', P, 0, 30),
    heavyScheme: scheme,
    holdFrames: numIn(root, 'holdFrames', P, 2, 60),
    stickThreshold: numIn(root, 'stickThreshold', P, 0.1, 0.95),
    maxHp: numIn(root, 'maxHp', P, 1, 1000),
    maxStamina: numIn(root, 'maxStamina', P, 1, 1000),
    maxMeter: numIn(root, 'maxMeter', P, 1, 1000),
    staminaRegenPerSec: numIn(root, 'staminaRegenPerSec', P, 0, 500),
    staminaRegenDelay: numIn(root, 'staminaRegenDelay', P, 0, 300),
    moveSpeed: numIn(root, 'moveSpeed', P, 0.5, 20),
    chainMax: numIn(root, 'chainMax', P, 1, 10),
    chainCancelFrames: numIn(root, 'chainCancelFrames', P, 1, 30),
    knockdownFrames: numIn(root, 'knockdownFrames', P, 10, 60),
    maxDisabledStreak: numIn(root, 'maxDisabledStreak', P, 20, 60),
    blockHitstop: numIn(root, 'blockHitstop', P, 0, 20),
    block: {
      startup: numIn(blockO, 'startup', `${P}.block`, 0, 30),
      recovery: numIn(blockO, 'recovery', `${P}.block`, 0, 30),
      reduction: numIn(blockO, 'reduction', `${P}.block`, 0, 1),
    },
    dodge,
    special: { restoreStamina: numIn(specialO, 'restoreStamina', `${P}.special`, 0, 100) },
    statuses,
    actions: actionSet(root['actions'], `${P}.actions`),
    dummy: {
      hp: numIn(dummyO, 'hp', `${P}.dummy`, 1, 1000),
      reviveFrames: numIn(dummyO, 'reviveFrames', `${P}.dummy`, 1, 600),
      attackRange: numIn(dummyO, 'attackRange', `${P}.dummy`, 20, 400),
      actions: actionSet(dummyO['actions'], `${P}.dummy.actions`),
    },
  };
  if (cfg.arena.wallLeft >= cfg.arena.wallRight)
    throw new Error(`${P}.arena: wallLeft must be left of wallRight`);
  return cfg;
}

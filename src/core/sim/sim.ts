import { Rng } from '../rng';
import type { ActionSet, AttackDef, Box, CombatConfig } from './config';
import { Fighter, neutralMods, type FighterMods } from './fighter';
import { canTransition, isDisabled } from './states';
import {
  ENEMY,
  PLAYER,
  STATUS_KINDS,
  type AttackKind,
  type FighterStateName,
  type Intent,
  type SimEvent,
  type SimEventType,
  type StatusKind,
} from './types';

export function statusIndex(kind: StatusKind): number {
  return STATUS_KINDS.indexOf(kind);
}
const SLOW = statusIndex('slow');
const DODGE_SHORT = statusIndex('dodgeShort');
const STUN = statusIndex('stun');
const SPECIAL_LOCK = statusIndex('specialLock');
const METER_DRAIN = statusIndex('meterDrain');
const BLOCK_DISABLED = statusIndex('blockDisabled');

export const ATTACK_KIND_INDEX: Record<AttackKind, number> = { punch: 0, heavy: 1, special: 2 };

/** Fixed-size event list, reused every step so the sim allocates nothing. */
export class EventPool {
  count = 0;
  readonly items: SimEvent[] = Array.from({ length: 32 }, () => ({
    type: 'hit',
    who: 0,
    a: 0,
    b: 0,
  }));

  clear(): void {
    this.count = 0;
  }

  push(type: SimEventType, who: number, a = 0, b = 0): void {
    const e = this.items[this.count];
    if (!e) return; // full: drop, the HUD can live without the 33rd event in one step
    e.type = type;
    e.who = who;
    e.a = a;
    e.b = b;
    this.count++;
  }
}

export interface SimOptions {
  seed?: number;
  /** Throw on an impossible state transition (dev and tests). Release logs and ignores. */
  strict?: boolean;
  playerMods?: Partial<FighterMods>;
  enemyMods?: Partial<FighterMods>;
  enemyActions?: ActionSet;
  enemyMaxHp?: number;
}

/** A plain rectangle in arena space, used for debug drawing. */
export interface ArenaRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The deterministic fight simulation (spec section 10). `step` advances one 1/60 s tick from two
 * intents. Rendering reads the state afterwards and must never change it.
 */
export class Sim {
  readonly fighters: [Fighter, Fighter];
  readonly events = new EventPool();
  readonly rng: Rng;
  frame = 0;
  hitstop = 0;
  over = false;
  /** PLAYER, ENEMY, or -1 while the fight is on. */
  winner = -1;
  private readonly strict: boolean;
  private readonly seed: number;
  private readonly enemyMaxHp: number;
  private readonly playerMods: Partial<FighterMods>;
  private readonly enemyMods: Partial<FighterMods>;

  constructor(
    readonly cfg: CombatConfig,
    opts: SimOptions = {},
  ) {
    this.seed = opts.seed ?? 1;
    this.strict = opts.strict ?? true;
    this.enemyMaxHp = opts.enemyMaxHp ?? cfg.dummy.hp;
    this.playerMods = opts.playerMods ?? {};
    this.enemyMods = opts.enemyMods ?? {};
    this.rng = new Rng(this.seed);
    this.fighters = [
      new Fighter(cfg.actions, { ...neutralMods(), ...this.playerMods }),
      new Fighter(opts.enemyActions ?? cfg.dummy.actions, { ...neutralMods(), ...this.enemyMods }),
    ];
    this.reset();
  }

  /** Back to the start of the fight with the same setup. Reuses every object. */
  reset(): void {
    const c = this.cfg;
    this.rng.reseed(this.seed);
    this.frame = 0;
    this.hitstop = 0;
    this.over = false;
    this.winner = -1;
    this.events.clear();
    this.initFighter(this.fighters[PLAYER], c.start.playerX, 1, c.maxHp);
    this.initFighter(this.fighters[ENEMY], c.start.enemyX, -1, this.enemyMaxHp);
  }

  /** Bring a knocked-out fighter back at full health (training dummy). */
  revive(index: number): void {
    const f = this.fighters[index];
    if (!f) return;
    f.hp = f.maxHp;
    f.state = 'idle';
    f.frame = 0;
    f.stunLeft = 0;
    f.streak = 0;
    this.clearStatuses(f);
    this.over = false;
    this.winner = -1;
  }

  private initFighter(f: Fighter, x: number, facing: 1 | -1, maxHp: number): void {
    f.x = x;
    f.prevX = x;
    f.facing = facing;
    f.state = 'idle';
    f.frame = 0;
    f.maxHp = maxHp + f.mods.maxHpBonus;
    f.hp = f.maxHp;
    f.stamina = this.cfg.maxStamina;
    f.meter = Math.min(this.cfg.maxMeter, f.mods.specialStart);
    f.staminaIdle = this.cfg.staminaRegenDelay;
    f.chain = 0;
    f.hitDone = false;
    f.hitConfirmed = false;
    f.releasing = false;
    f.stunLeft = 0;
    f.dodgeDir = 1;
    f.kbFrames = 0;
    f.kbPerFrame = 0;
    f.streak = 0;
    f.statusFrames.fill(0);
    f.statusValue.fill(0);
    f.buf.punch = 0;
    f.buf.heavy = 0;
    f.buf.dodge = 0;
    f.buf.special = 0;
    f.held.moveX = 0;
    f.held.punch = false;
    f.held.heavy = false;
    f.held.block = false;
    f.held.dodge = false;
    f.held.special = false;
    f.hitStatusKind = -1;
  }

  // ---------------------------------------------------------------------------------- stepping

  step(playerIntent: Intent, enemyIntent: Intent): void {
    this.events.clear();
    this.frame++;
    this.readInput(this.fighters[PLAYER], playerIntent);
    this.readInput(this.fighters[ENEMY], enemyIntent);

    if (this.hitstop > 0) {
      this.hitstop--;
      // A frozen fighter still cannot act, so hitstop counts towards the lock limit.
      for (const f of this.fighters) {
        if (isDisabled(f.state)) f.streak++;
        f.prevX = f.x; // frozen: nothing for the renderer to interpolate
      }
      return;
    }
    const p = this.fighters[PLAYER];
    const e = this.fighters[ENEMY];
    this.updateFighter(p, e);
    this.updateFighter(e, p);
    this.separate(p, e);
    this.resolveHits(p, e);
  }

  /** Record press edges into the input buffer (spec: 6 frames) and remember what is held. */
  private readInput(f: Fighter, i: Intent): void {
    const b = f.buf;
    if (b.punch > 0) b.punch--;
    if (b.heavy > 0) b.heavy--;
    if (b.dodge > 0) b.dodge--;
    if (b.special > 0) b.special--;
    const h = f.held;
    const n = this.cfg.inputBuffer;
    if (i.punch && !h.punch) b.punch = n;
    if (i.heavy && !h.heavy) b.heavy = n;
    if (i.dodge && !h.dodge) b.dodge = n;
    if (i.special && !h.special) b.special = n;
    h.moveX = i.moveX;
    h.punch = i.punch;
    h.heavy = i.heavy;
    h.block = i.block;
    h.dodge = i.dodge;
    h.special = i.special;
  }

  /** Move a fighter to a new state through the transition table. */
  transition(f: Fighter, to: FighterStateName): boolean {
    if (!canTransition(f.state, to)) {
      if (this.strict) throw new Error(`Impossible transition ${f.state} -> ${to}`);
      console.warn(`Ignored impossible transition ${f.state} -> ${to}`);
      return false;
    }
    const keepFrame = f.state === to && (to === 'idle' || to === 'walk');
    f.state = to;
    if (!keepFrame) f.frame = 1;
    return true;
  }

  private updateFighter(f: Fighter, o: Fighter): void {
    const c = this.cfg;
    f.prevX = f.x;
    f.streak = isDisabled(f.state) ? f.streak + 1 : 0;
    this.tickStatuses(f);

    if (f.staminaIdle < c.staminaRegenDelay) f.staminaIdle++;
    else
      f.stamina = Math.min(
        c.maxStamina,
        f.stamina + (c.staminaRegenPerSec / 60) * f.mods.staminaRegenMult,
      );

    if (f.kbFrames > 0) {
      f.x += f.kbPerFrame;
      f.kbFrames--;
    }
    f.frame++;

    switch (f.state) {
      case 'idle':
      case 'walk':
        this.updateFree(f, o);
        break;
      case 'punch':
      case 'heavy':
      case 'special':
        this.updateAttack(f);
        break;
      case 'block':
        this.updateBlock(f, o);
        break;
      case 'dodge':
        this.updateDodge(f);
        break;
      case 'hurt':
      case 'blockstun':
        f.stunLeft--;
        if (f.stunLeft <= 0) this.toIdle(f);
        break;
      case 'knockdown':
        if (f.frame > c.knockdownFrames) this.toIdle(f);
        break;
      case 'stunned':
      case 'ko':
        break;
    }
    f.x = Math.min(Math.max(f.x, c.arena.wallLeft), c.arena.wallRight);
  }

  private toIdle(f: Fighter): void {
    this.transition(f, 'idle');
    f.chain = 0;
    f.releasing = false;
  }

  private faceOpponent(f: Fighter, o: Fighter): void {
    f.facing = o.x >= f.x ? 1 : -1;
  }

  private updateFree(f: Fighter, o: Fighter): void {
    this.faceOpponent(f, o);
    f.chain = 0;
    if (this.tryStartAction(f)) return;
    if (f.held.block && !f.hasStatus(BLOCK_DISABLED)) {
      this.transition(f, 'block');
      f.releasing = false;
      return;
    }
    const mx = f.held.moveX;
    if (Math.abs(mx) > 0.1) {
      const slow = f.hasStatus(SLOW) ? (f.statusValue[SLOW] ?? 1) : 1;
      f.x += mx * this.cfg.moveSpeed * slow;
      this.transition(f, 'walk');
    } else {
      this.transition(f, 'idle');
    }
  }

  /** Start a buffered action, in priority order. Returns true if the fighter changed state. */
  private tryStartAction(f: Fighter): boolean {
    const c = this.cfg;
    if (f.buf.special > 0) {
      f.buf.special = 0;
      if (f.meter >= c.maxMeter && !f.hasStatus(SPECIAL_LOCK)) {
        this.startSpecial(f);
        return true;
      }
    }
    if (f.buf.dodge > 0) {
      f.buf.dodge = 0;
      const cost = c.dodge.cost * f.mods.dodgeCostMult;
      if (f.stamina >= cost) {
        this.startDodge(f, cost);
        return true;
      }
      this.events.push('dodgeDenied', this.indexOf(f));
    }
    if (f.buf.heavy > 0) {
      f.buf.heavy = 0;
      this.startAttack(f, 'heavy', 0);
      return true;
    }
    if (f.buf.punch > 0) {
      f.buf.punch = 0;
      this.startAttack(f, 'punch', 1);
      return true;
    }
    return false;
  }

  private indexOf(f: Fighter): number {
    return f === this.fighters[PLAYER] ? PLAYER : ENEMY;
  }

  private startAttack(f: Fighter, kind: AttackKind, chain: number): void {
    this.transition(f, kind);
    f.hitDone = false;
    f.hitConfirmed = false;
    f.chain = chain;
  }

  private startSpecial(f: Fighter): void {
    const c = this.cfg;
    this.transition(f, 'special');
    f.hitDone = false;
    f.hitConfirmed = false;
    f.chain = 0;
    f.meter = 0; // costs all of it
    let cleared = 0;
    for (let k = 0; k < STATUS_KINDS.length; k++) {
      if ((f.statusFrames[k] ?? 0) > 0) cleared++;
    }
    this.clearStatuses(f);
    f.stamina = Math.min(c.maxStamina, f.stamina + c.special.restoreStamina);
    this.events.push('special', this.indexOf(f), cleared);
  }

  private startDodge(f: Fighter, cost: number): void {
    const mx = f.held.moveX;
    f.dodgeDir = Math.abs(mx) > 0.3 ? (mx > 0 ? 1 : -1) : (-f.facing as 1 | -1);
    f.stamina -= cost;
    f.staminaIdle = 0;
    this.transition(f, 'dodge');
    this.events.push('dodge', this.indexOf(f));
  }

  private updateAttack(f: Fighter): void {
    const kind = f.state as AttackKind;
    const def = f.actions[kind];
    const total = def.startup + def.active + def.recovery;
    if (kind === 'punch' && f.hitConfirmed && f.chain < this.cfg.chainMax) {
      const r = f.frame - (def.startup + def.active);
      if (r >= 1 && r <= this.cfg.chainCancelFrames && f.buf.punch > 0) {
        f.buf.punch = 0;
        this.startAttack(f, 'punch', f.chain + 1);
        return;
      }
    }
    if (f.frame > total) this.toIdle(f);
  }

  private updateBlock(f: Fighter, o: Fighter): void {
    const c = this.cfg;
    this.faceOpponent(f, o);
    if (f.releasing) {
      if (f.frame > c.block.recovery) this.toIdle(f);
      return;
    }
    if (this.tryStartAction(f)) return;
    if (!f.held.block || f.hasStatus(BLOCK_DISABLED)) {
      f.releasing = true;
      f.frame = 1;
    }
  }

  private updateDodge(f: Fighter): void {
    const d = this.cfg.dodge;
    if (f.frame >= d.moveFrom && f.frame <= d.moveTo) {
      const mult = f.hasStatus(DODGE_SHORT) ? (f.statusValue[DODGE_SHORT] ?? 1) : 1;
      f.x += (f.dodgeDir * d.distance * mult) / (d.moveTo - d.moveFrom + 1);
    }
    if (f.frame >= d.total) this.toIdle(f);
  }

  private tickStatuses(f: Fighter): void {
    for (let k = 0; k < STATUS_KINDS.length; k++) {
      const left = f.statusFrames[k] ?? 0;
      if (left <= 0) continue;
      f.statusFrames[k] = left - 1;
      if (k === METER_DRAIN) f.meter = Math.max(0, f.meter - (f.statusValue[k] ?? 0) / 60);
      if (left - 1 === 0) {
        f.statusValue[k] = 0;
        if (k === STUN && f.state === 'stunned') this.toIdle(f);
        this.events.push('statusCleared', this.indexOf(f), k);
      }
    }
  }

  // ------------------------------------------------------------------------------- status API

  /**
   * Apply a status. Returns false if it could not be applied. Stun is capped so nothing can keep a
   * fighter unable to act for more than `maxDisabledStreak` frames in a row.
   */
  applyStatus(f: Fighter, kind: StatusKind, frames: number, value: number): boolean {
    if (f.state === 'ko') return false;
    const k = statusIndex(kind);
    let fr = Math.floor(frames);
    if (kind === 'stun') {
      if (f.state === 'knockdown') return false;
      const room = this.lockRoom(f);
      if (room <= 0) return false;
      // Cap the whole stun, including what is already running, so hits cannot stack it past the limit.
      f.statusFrames[k] = Math.min(Math.max(f.statusFrames[k] ?? 0, fr), room);
      fr = f.statusFrames[k] ?? 0;
    } else if (fr > (f.statusFrames[k] ?? 0)) {
      f.statusFrames[k] = fr;
    }
    if (fr <= 0) return false;
    f.statusValue[k] = value;
    if (kind === 'stun') {
      this.transition(f, 'stunned');
      f.chain = 0;
      f.releasing = false;
    } else if (kind === 'blockDisabled' && f.state === 'block' && !f.releasing) {
      this.toIdle(f);
    }
    this.events.push('statusApplied', this.indexOf(f), k);
    return true;
  }

  clearStatuses(f: Fighter): void {
    f.statusFrames.fill(0);
    f.statusValue.fill(0);
  }

  // ---------------------------------------------------------------------------------- contact

  /** Keep the bodies apart. Nobody is pushed while dodging through an attack. */
  private separate(p: Fighter, e: Fighter): void {
    if (this.isGhosting(p) || this.isGhosting(e)) return;
    const c = this.cfg;
    const dx = e.x - p.x;
    const overlap = c.pushWidth - Math.abs(dx);
    if (overlap <= 0) return;
    const dir = dx !== 0 ? Math.sign(dx) : p.prevX <= e.prevX ? 1 : -1;
    let pMove = overlap / 2;
    let eMove = overlap / 2;
    if (e.x + dir * eMove > c.arena.wallRight || e.x + dir * eMove < c.arena.wallLeft) {
      pMove = overlap;
      eMove = 0;
    } else if (p.x - dir * pMove > c.arena.wallRight || p.x - dir * pMove < c.arena.wallLeft) {
      eMove = overlap;
      pMove = 0;
    }
    p.x -= dir * pMove;
    e.x += dir * eMove;
    p.x = Math.min(Math.max(p.x, c.arena.wallLeft), c.arena.wallRight);
    e.x = Math.min(Math.max(e.x, c.arena.wallLeft), c.arena.wallRight);
  }

  private isGhosting(f: Fighter): boolean {
    return f.state === 'dodge' && this.isInvulnerable(f);
  }

  isInvulnerable(f: Fighter): boolean {
    if (f.state === 'knockdown' || f.state === 'ko') return true;
    const d = this.cfg.dodge;
    return f.state === 'dodge' && f.frame >= d.invulnFrom && f.frame <= d.invulnTo;
  }

  /** The attack's hit box in arena coordinates, written into `out`. */
  attackBox(f: Fighter, def: AttackDef, out: ArenaRect): void {
    const hb: Box = def.hitbox;
    out.x = f.facing === 1 ? f.x + hb.x : f.x - hb.x - hb.w;
    out.y = this.cfg.arena.floorY + hb.y;
    out.w = hb.w;
    out.h = hb.h;
  }

  hurtBox(f: Fighter, out: ArenaRect): void {
    const h = this.cfg.hurtbox;
    out.x = f.x + h.x;
    out.y = this.cfg.arena.floorY + h.y;
    out.w = h.w;
    out.h = h.h;
  }

  private readonly boxA: ArenaRect = { x: 0, y: 0, w: 0, h: 0 };
  private readonly boxD: ArenaRect = { x: 0, y: 0, w: 0, h: 0 };

  private checkHit(att: Fighter, def: Fighter): boolean {
    if (att.state !== 'punch' && att.state !== 'heavy' && att.state !== 'special') return false;
    if (att.hitDone || def.state === 'ko') return false;
    const ad = att.actions[att.state];
    if (att.frame <= ad.startup || att.frame > ad.startup + ad.active) return false;
    if (this.isInvulnerable(def)) return false;
    this.attackBox(att, ad, this.boxA);
    this.hurtBox(def, this.boxD);
    const a = this.boxA;
    const d = this.boxD;
    return a.x < d.x + d.w && a.x + a.w > d.x && a.y < d.y + d.h && a.y + a.h > d.y;
  }

  private resolveHits(p: Fighter, e: Fighter): void {
    // Decide both first so a trade (both swing at once) lands for both.
    const pKind = p.state;
    const eKind = e.state;
    const pHits = this.checkHit(p, e);
    const eHits = this.checkHit(e, p);
    if (pHits) this.applyHit(p, e, pKind as AttackKind);
    if (eHits) this.applyHit(e, p, eKind as AttackKind);
  }

  /**
   * Frames a fighter can still be kept unable to act, leaving a one-frame margin. Hitstop, hurt,
   * blockstun, stun and knockdown all count, so nothing can chain into a lock longer than
   * `maxDisabledStreak` (spec section 10).
   */
  private lockRoom(def: Fighter): number {
    return this.cfg.maxDisabledStreak - def.streak - this.hitstop - 1;
  }

  /** Free a fighter whose lock has used up its budget: the hit still hurts, but it cannot hold them. */
  private breakFree(def: Fighter): void {
    this.toIdle(def);
    def.stunLeft = 0;
    def.statusFrames[STUN] = 0;
    def.statusValue[STUN] = 0;
  }

  private knockback(def: Fighter, att: Fighter, distance: number): void {
    const dir = def.x >= att.x ? 1 : -1;
    const frames = 6;
    def.kbFrames = frames;
    def.kbPerFrame = (dir * distance) / frames;
  }

  private applyHit(att: Fighter, def: Fighter, kind: AttackKind): void {
    const c = this.cfg;
    const ad = att.actions[kind];
    const di = this.indexOf(def);
    att.hitDone = true;
    const base = ad.damage * att.mods.damageMult;
    const blocking =
      def.state === 'block' &&
      !def.releasing &&
      def.frame > c.block.startup &&
      !def.hasStatus(BLOCK_DISABLED) &&
      def.facing * (att.x - def.x) >= 0;

    const stopFrames = blocking ? c.blockHitstop : ad.hitstop;
    const room =
      def.streak + this.hitstop + stopFrames + 1 >= c.maxDisabledStreak
        ? 0
        : this.lockRoom(def) - stopFrames;

    if (blocking) {
      const dmg = base * (1 - c.block.reduction);
      def.hp -= dmg;
      const broke = ad.blockBreak > 0;
      if (room > 0) {
        this.transition(def, 'blockstun');
        def.stunLeft = Math.min(broke ? ad.blockBreak : ad.blockstun, room);
      } else this.breakFree(def);
      if (broke) {
        def.statusFrames[BLOCK_DISABLED] = Math.max(
          def.statusFrames[BLOCK_DISABLED] ?? 0,
          ad.blockBreak,
        );
        this.events.push('blockBreak', di, ad.blockBreak);
      }
      this.knockback(def, att, ad.knockback * 0.4);
      att.hitConfirmed = true;
      att.meter = Math.min(c.maxMeter, att.meter + ad.meterGain * 0.5 * att.mods.specialGainMult);
      def.meter = Math.min(c.maxMeter, def.meter + ad.meterOnHurt * 0.5 * def.mods.specialGainMult);
      if (room > 0) this.hitstop = Math.max(this.hitstop, c.blockHitstop);
      this.events.push('blocked', di, dmg, att.chain);
    } else {
      def.hp -= base;
      def.chain = 0;
      def.releasing = false;
      if (room <= 0) this.breakFree(def);
      else if (ad.knockdown) {
        this.transition(def, 'knockdown');
        def.frame = 1;
      } else {
        this.transition(def, 'hurt');
        def.stunLeft = Math.min(ad.hitstun, room);
      }
      this.knockback(def, att, ad.knockback);
      att.hitConfirmed = true;
      att.meter = Math.min(c.maxMeter, att.meter + ad.meterGain * att.mods.specialGainMult);
      def.meter = Math.min(c.maxMeter, def.meter + ad.meterOnHurt * def.mods.specialGainMult);
      if (room > 0) this.hitstop = Math.max(this.hitstop, ad.hitstop);
      // A hit that had to break the lock carries no status: the player gets at least one free frame.
      if (att.hitStatusKind >= 0 && room > 0) {
        const sk = STATUS_KINDS[att.hitStatusKind];
        if (sk) this.applyStatus(def, sk, att.hitStatusFrames, att.hitStatusValue);
      }
      this.events.push('hit', di, base, att.chain);
    }

    if (def.hp <= 0) {
      def.hp = 0;
      def.state = 'ko';
      def.frame = 1;
      this.over = true;
      this.winner = this.indexOf(att);
      this.events.push('ko', di);
    }
  }

  // -------------------------------------------------------------------------------------- hash

  /** A 32-bit fingerprint of the whole fight. Same seed + same inputs must give the same value. */
  hash(): number {
    let h = 0x811c9dc5;
    const mix = (n: number): void => {
      h ^= n | 0;
      h = Math.imul(h, 0x01000193);
    };
    const q = (v: number): number => Math.round(v * 1000);
    mix(this.frame);
    mix(this.hitstop);
    mix(this.rng.getState());
    for (const f of this.fighters) {
      mix(q(f.x));
      mix(f.facing);
      mix(f.state.charCodeAt(0) * 131 + f.state.length);
      mix(f.frame);
      mix(q(f.hp));
      mix(q(f.stamina));
      mix(q(f.meter));
      mix(f.chain);
      mix(f.stunLeft);
      mix(f.streak);
      mix(f.buf.punch | (f.buf.heavy << 4) | (f.buf.dodge << 8) | (f.buf.special << 12));
      for (let k = 0; k < STATUS_KINDS.length; k++) mix(f.statusFrames[k] ?? 0);
    }
    return h >>> 0;
  }
}

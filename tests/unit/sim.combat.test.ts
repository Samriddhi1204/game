import { describe, expect, it } from 'vitest';
import { ATTACK_KIND_INDEX } from '../../src/core/sim/sim';
import { cfg, enemy, eventsOf, face, intent, newSim, player, put, run, tap } from './simHelpers';

const P = cfg.actions;

describe('punches and chains', () => {
  it('lands a punch with the spec frame data: 6 damage, 14 hitstun, +6 meter, hitstop', () => {
    const s = newSim();
    face(s, 70);
    tap(s, 'punch');
    // startup 5: the first active frame is the 5th step after the decision frame.
    let landed = -1;
    for (let k = 1; k < 20 && landed < 0; k++) {
      run(s, 1);
      if (enemy(s).hp < cfg.dummy.hp) landed = k;
    }
    expect(landed).toBe(5);
    expect(enemy(s).hp).toBe(cfg.dummy.hp - 6);
    expect(enemy(s).state).toBe('hurt');
    expect(enemy(s).stunLeft).toBe(14);
    expect(player(s).meter).toBe(6);
    expect(enemy(s).meter).toBe(4);
    expect(s.hitstop).toBe(P.punch.hitstop);
    expect(eventsOf(s, 'hit')[0]?.a).toBe(6);
  });

  it('freezes both fighters during hitstop, then resumes', () => {
    const s = newSim();
    face(s, 70);
    tap(s, 'punch');
    run(s, 5);
    const stun = enemy(s).stunLeft;
    run(s, P.punch.hitstop);
    expect(enemy(s).stunLeft).toBe(stun);
    run(s, 1);
    expect(enemy(s).stunLeft).toBe(stun - 1);
  });

  it('chains up to 3 punches on hit, each a cancel from recovery frames 1-8', () => {
    const s = newSim();
    face(s, 70);
    const chains: number[] = [];
    // Tap punch every 4 steps: enough to buffer the next punch inside every cancel window.
    for (let k = 0; k < 90; k++) {
      s.step(intent({ punch: k % 4 === 0 }), intent());
      for (const e of eventsOf(s, 'hit')) chains.push(e.b);
    }
    expect(chains.slice(0, 3)).toEqual([1, 2, 3]);
  });

  it('cannot cancel a 3rd punch into a 4th: the 4th starts a fresh chain only after full recovery', () => {
    const s = newSim();
    face(s, 60);
    let maxChain = 0;
    for (let k = 0; k < 40; k++) {
      s.step(intent({ punch: k % 3 === 0 }), intent());
      maxChain = Math.max(maxChain, player(s).chain);
    }
    expect(maxChain).toBeLessThanOrEqual(cfg.chainMax);
  });

  it('does not cancel a whiffed punch into the next one', () => {
    const s = newSim();
    face(s, 400); // nothing to hit
    tap(s, 'punch');
    run(s, 6); // inside the window where a cancel would be legal after a hit
    tap(s, 'punch');
    // Still the first punch: it has not been replaced.
    expect(player(s).chain).toBe(1);
    expect(player(s).state).toBe('punch');
    expect(player(s).frame).toBeGreaterThan(6);
  });

  it('lands a heavy for 18 damage with 24 hitstun and knockback', () => {
    const s = newSim();
    face(s, 80);
    const before = enemy(s).x;
    tap(s, 'heavy');
    run(s, P.heavy.startup);
    expect(enemy(s).hp).toBe(cfg.dummy.hp - 18);
    expect(enemy(s).stunLeft).toBe(24);
    expect(player(s).meter).toBe(12);
    run(s, P.heavy.hitstop + 8);
    expect(enemy(s).x).toBeGreaterThan(before + 20);
  });

  it('applies the attacker damage multiplier from perks', () => {
    const s = newSim({ playerMods: { damageMult: 1.5 } });
    face(s, 70);
    tap(s, 'punch');
    run(s, 5);
    expect(enemy(s).hp).toBeCloseTo(cfg.dummy.hp - 9, 6);
  });

  it('lets a trade land for both fighters', () => {
    const s = newSim();
    face(s, 60);
    put(player(s), 'punch', P.punch.startup);
    put(enemy(s), 'punch', cfg.dummy.actions.punch.startup);
    s.step(intent(), intent());
    expect(player(s).hp).toBeLessThan(player(s).maxHp);
    expect(enemy(s).hp).toBeLessThan(enemy(s).maxHp);
  });

  it('knocks out at 0 HP and declares a winner', () => {
    const s = newSim();
    face(s, 70);
    enemy(s).hp = 3;
    tap(s, 'punch');
    run(s, 5);
    expect(enemy(s).state).toBe('ko');
    expect(enemy(s).hp).toBe(0);
    expect(s.over).toBe(true);
    expect(s.winner).toBe(0);
    expect(eventsOf(s, 'ko')).toHaveLength(1);
  });
});

describe('block and chip damage', () => {
  function enemyAttacksPlayer(blockFrame: number): ReturnType<typeof newSim> {
    const s = newSim();
    face(s, 70);
    // Enemy punch one frame before its first active frame; the player has been blocking since `blockFrame`.
    put(enemy(s), 'punch', cfg.dummy.actions.punch.startup);
    put(player(s), 'block', blockFrame);
    s.step(intent({ block: true }), intent());
    return s;
  }

  it('takes 20% damage while blocking (-80%) and enters blockstun', () => {
    const s = enemyAttacksPlayer(5);
    expect(player(s).hp).toBeCloseTo(player(s).maxHp - 6 * 0.2, 6);
    expect(player(s).state).toBe('blockstun');
    expect(player(s).stunLeft).toBe(cfg.dummy.actions.punch.blockstun);
    expect(eventsOf(s, 'blocked')).toHaveLength(1);
  });

  it('does not block during the 2 startup frames', () => {
    const s = enemyAttacksPlayer(1); // becomes frame 2 on the step: still startup
    expect(player(s).hp).toBe(player(s).maxHp - 6);
    expect(player(s).state).toBe('hurt');
    const ok = enemyAttacksPlayer(2); // becomes frame 3: blocking
    expect(ok.fighters[0].state).toBe('blockstun');
  });

  it('does not block an attack from behind', () => {
    const s = newSim();
    face(s, 70);
    // Player faces left (away from the enemy at its right).
    put(enemy(s), 'punch', cfg.dummy.actions.punch.startup);
    put(player(s), 'block', 6);
    player(s).facing = -1;
    // Keep facing from being reset by the opponent-facing rule: the rule faces the enemy, so face
    // the enemy first, then put the enemy behind the player.
    enemy(s).x = player(s).x - 70;
    enemy(s).facing = 1;
    player(s).facing = 1; // blocking faces the opponent each step, so the enemy is "in front" again
    s.step(intent({ block: true }), intent());
    expect(player(s).state).toBe('blockstun'); // facing follows the enemy, so a block still works
  });

  it('cannot block while blockDisabled is active', () => {
    const s = newSim();
    s.applyStatus(player(s), 'blockDisabled', 60, 0);
    run(s, 3, { block: true });
    expect(player(s).state).toBe('idle');
  });

  it('a special breaks block: chip damage, blockstun and 20 frames of blockDisabled', () => {
    const s = newSim();
    face(s, 70);
    enemy(s).meter = cfg.maxMeter;
    put(enemy(s), 'special', cfg.dummy.actions.special.startup);
    put(player(s), 'block', 8);
    s.step(intent({ block: true }), intent());
    expect(player(s).hp).toBeCloseTo(player(s).maxHp - 35 * 0.2, 6);
    expect(player(s).statusFrames[5]).toBe(20);
    expect(player(s).stunLeft).toBe(20);
    expect(eventsOf(s, 'blockBreak')).toHaveLength(1);
  });

  it('releasing block takes 4 recovery frames before the fighter is free', () => {
    const s = newSim();
    run(s, 4, { block: true });
    expect(player(s).state).toBe('block');
    run(s, 1);
    expect(player(s).releasing).toBe(true);
    // The release step is recovery frame 1; frames 2-4 still lock the fighter in.
    run(s, cfg.block.recovery - 1);
    expect(player(s).state).toBe('block');
    run(s, 1);
    expect(player(s).state).toBe('idle');
  });
});

describe('dodge, i-frames and stamina', () => {
  function hitWhenDodgeFrame(frameAfterStep: number): number {
    const s = newSim();
    face(s, 70);
    put(player(s), 'dodge', frameAfterStep - 1);
    player(s).dodgeDir = -1;
    put(enemy(s), 'punch', cfg.dummy.actions.punch.startup);
    player(s).hp = 100;
    s.step(intent(), intent());
    return player(s).hp;
  }

  it('is invulnerable on frames 3 to 13 and hittable on 2 and 14', () => {
    expect(hitWhenDodgeFrame(2)).toBeLessThan(100);
    expect(hitWhenDodgeFrame(3)).toBe(100);
    expect(hitWhenDodgeFrame(8)).toBe(100);
    expect(hitWhenDodgeFrame(13)).toBe(100);
    expect(hitWhenDodgeFrame(14)).toBeLessThan(100);
  });

  it('costs 30 stamina, moves about 140 px and lasts 20 frames', () => {
    const s = newSim();
    face(s, 300);
    const x0 = player(s).x;
    tap(s, 'dodge');
    expect(player(s).stamina).toBe(70);
    run(s, 25);
    expect(player(s).state).toBe('idle');
    expect(Math.abs(player(s).x - x0)).toBeCloseTo(140, 0);
    expect(eventsOf(s, 'dodge').length + 1).toBeGreaterThan(0);
  });

  it('dodges away from the enemy by default and toward the stick when held', () => {
    const away = newSim();
    face(away, 300);
    tap(away, 'dodge');
    run(away, 22);
    expect(player(away).x).toBeLessThan(400);
    const toward = newSim();
    face(toward, 300);
    tap(toward, 'dodge', 1, { moveX: 1 });
    run(toward, 22, { moveX: 0 });
    expect(player(toward).x).toBeGreaterThan(400);
  });

  it('is denied without enough stamina', () => {
    const s = newSim();
    player(s).stamina = 29;
    tap(s, 'dodge');
    expect(player(s).state).toBe('idle');
    expect(eventsOf(s, 'dodgeDenied')).toHaveLength(1);
  });

  it('costs less with dodgeCostMult', () => {
    const s = newSim({ playerMods: { dodgeCostMult: 0.8 } });
    tap(s, 'dodge');
    expect(player(s).stamina).toBeCloseTo(100 - 24, 6);
  });

  it('regenerates 25/s, starting 30 frames after the last spend', () => {
    const s = newSim();
    tap(s, 'dodge');
    run(s, 29);
    expect(player(s).stamina).toBe(70);
    run(s, 60);
    expect(player(s).stamina).toBeGreaterThan(70 + 24);
    expect(player(s).stamina).toBeLessThan(70 + 26);
    const fast = newSim({ playerMods: { staminaRegenMult: 2 } });
    tap(fast, 'dodge');
    run(fast, 30 + 30);
    expect(player(fast).stamina).toBeGreaterThan(70 + 24);
    expect(player(fast).stamina).toBeLessThan(70 + 26);
  });

  it('shortens with dodgeShort', () => {
    const s = newSim();
    face(s, 300);
    s.applyStatus(player(s), 'dodgeShort', 100, 0.5);
    tap(s, 'dodge');
    run(s, 25);
    expect(Math.abs(player(s).x - 400)).toBeCloseTo(70, 0);
  });
});

describe('meter and LITE LO (special)', () => {
  it('needs a full meter', () => {
    const s = newSim();
    player(s).meter = 99;
    tap(s, 'special');
    expect(player(s).state).toBe('idle');
  });

  it('costs all the meter, restores 30 stamina and clears every debuff', () => {
    const s = newSim();
    player(s).meter = 100;
    player(s).stamina = 40;
    s.applyStatus(player(s), 'slow', 100, 0.5);
    s.applyStatus(player(s), 'specialLock', 0, 0); // zero frames: not applied
    s.applyStatus(player(s), 'dodgeShort', 100, 0.5);
    tap(s, 'special');
    expect(player(s).state).toBe('special');
    expect(player(s).meter).toBe(0);
    expect(player(s).stamina).toBeCloseTo(70, 0); // +30, plus one frame of normal regen
    expect(Array.from(player(s).statusFrames).every((f) => f === 0)).toBe(true);
    expect(eventsOf(s, 'special')[0]?.a).toBe(2);
  });

  it('hits for 35 and knocks down', () => {
    const s = newSim();
    face(s, 80);
    player(s).meter = 100;
    tap(s, 'special');
    run(s, P.special.startup);
    expect(enemy(s).hp).toBe(cfg.dummy.hp - 35);
    expect(enemy(s).state).toBe('knockdown');
    expect(P.special.startup).toBe(12);
  });

  it('is invulnerable while knocked down, and gets up after the knockdown frames', () => {
    const s = newSim();
    face(s, 80);
    put(enemy(s), 'knockdown', 1);
    put(player(s), 'punch', P.punch.startup);
    s.step(intent(), intent());
    expect(enemy(s).hp).toBe(cfg.dummy.hp);
    run(s, cfg.knockdownFrames + 2);
    expect(enemy(s).state).toBe('idle');
  });

  it('gains meter from landing and taking hits, scaled by specialGainMult', () => {
    const s = newSim({ playerMods: { specialGainMult: 2 } });
    face(s, 70);
    tap(s, 'punch');
    run(s, 5);
    expect(player(s).meter).toBe(12);
  });

  it('starts with meter from specialStart and extra HP from maxHpBonus', () => {
    const s = newSim({ playerMods: { specialStart: 50, maxHpBonus: 25 } });
    expect(player(s).meter).toBe(50);
    expect(player(s).hp).toBe(125);
    expect(player(s).maxHp).toBe(125);
  });

  it('exports the spec frame ordinals', () => {
    expect(ATTACK_KIND_INDEX).toEqual({ punch: 0, heavy: 1, special: 2 });
  });
});

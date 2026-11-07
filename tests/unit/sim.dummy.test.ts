import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DUMMY_MODES, DummyBrain } from '../../src/core/ai/dummy';
import { parseCombat } from '../../src/core/sim/config';
import { createIntent, STATUS_KINDS } from '../../src/core/sim/types';
import { cfg, enemy, face, newSim, player, run } from './simHelpers';

function simWith(mode: 'idle' | 'block' | 'attack' | 'debuff') {
  const sim = newSim({ seed: 2 });
  const brain = new DummyBrain();
  brain.setMode(mode);
  return { sim, brain };
}

describe('training dummy', () => {
  it('idle does nothing', () => {
    const { sim, brain } = simWith('idle');
    const e = createIntent();
    for (let k = 0; k < 200; k++) {
      brain.update(sim, e);
      sim.step(createIntent(), e);
    }
    expect(enemy(sim).state).toBe('idle');
    expect(enemy(sim).x).toBe(cfg.start.enemyX);
  });

  it('block holds block and takes chip damage only', () => {
    const { sim, brain } = simWith('block');
    face(sim, 70);
    const e = createIntent();
    const p = createIntent();
    for (let k = 0; k < 30; k++) {
      brain.update(sim, e);
      sim.step(p, e);
    }
    expect(enemy(sim).state).toBe('block');
    p.punch = true;
    sim.step(p, e);
    p.punch = false;
    for (let k = 0; k < 20; k++) {
      brain.update(sim, e);
      sim.step(p, e);
    }
    expect(enemy(sim).hp).toBeCloseTo(cfg.dummy.hp - 6 * 0.2, 6);
  });

  it('attack walks up and throws punches and heavies', () => {
    const { sim, brain } = simWith('attack');
    const e = createIntent();
    const seen = new Set<string>();
    for (let k = 0; k < 900; k++) {
      brain.update(sim, e);
      sim.step(createIntent(), e);
      seen.add(enemy(sim).state);
      if (player(sim).hp < 20) player(sim).hp = 100;
    }
    expect(seen.has('walk')).toBe(true);
    expect(seen.has('punch')).toBe(true);
    expect(seen.has('heavy')).toBe(true);
  });

  it('debuff applies a different status on each hit', () => {
    const { sim, brain } = simWith('debuff');
    face(sim, 60);
    const e = createIntent();
    const applied = new Set<number>();
    for (let k = 0; k < 3000 && applied.size < 4; k++) {
      brain.update(sim, e);
      sim.step(createIntent(), e);
      for (let i = 0; i < sim.events.count; i++) {
        const ev = sim.events.items[i];
        if (ev?.type === 'statusApplied' && ev.who === 0) applied.add(ev.a);
      }
      player(sim).hp = 100;
    }
    expect(applied.size).toBeGreaterThanOrEqual(4);
    for (const k of applied) expect(k).toBeLessThan(STATUS_KINDS.length);
  });

  it('cycles through every mode', () => {
    const brain = new DummyBrain();
    const order = [
      brain.mode,
      brain.cycleMode(),
      brain.cycleMode(),
      brain.cycleMode(),
      brain.cycleMode(),
    ];
    expect(order).toEqual(['idle', 'block', 'attack', 'debuff', 'idle']);
    expect(DUMMY_MODES).toHaveLength(4);
  });

  it('can be revived after a knockout', () => {
    const { sim } = simWith('idle');
    face(sim, 70);
    enemy(sim).hp = 1;
    run(sim, 1, { punch: true });
    run(sim, 6);
    expect(enemy(sim).state).toBe('ko');
    sim.revive(1);
    expect(enemy(sim).state).toBe('idle');
    expect(enemy(sim).hp).toBe(cfg.dummy.hp);
    expect(sim.over).toBe(false);
  });

  it('telegraphs every damaging attack by at least 20 frames (fairness rule)', () => {
    for (const k of ['punch', 'heavy', 'special'] as const) {
      expect(cfg.dummy.actions[k].startup, k).toBeGreaterThanOrEqual(20);
    }
  });
});

describe('combat.json', () => {
  it('matches the spec default frame data for the player', () => {
    const { punch, heavy, special } = cfg.actions;
    expect([
      punch.startup,
      punch.active,
      punch.recovery,
      punch.damage,
      punch.hitstun,
      punch.blockstun,
      punch.meterGain,
    ]).toEqual([5, 3, 9, 6, 14, 8, 6]);
    expect([
      heavy.startup,
      heavy.active,
      heavy.recovery,
      heavy.damage,
      heavy.hitstun,
      heavy.blockstun,
      heavy.meterGain,
    ]).toEqual([16, 4, 24, 18, 24, 14, 12]);
    expect([special.startup, special.active, special.recovery, special.damage]).toEqual([
      12, 6, 30, 35,
    ]);
    expect([cfg.block.startup, cfg.block.recovery, cfg.block.reduction]).toEqual([2, 4, 0.8]);
    expect([
      cfg.dodge.startup,
      cfg.dodge.total,
      cfg.dodge.invulnFrom,
      cfg.dodge.invulnTo,
      cfg.dodge.distance,
      cfg.dodge.cost,
    ]).toEqual([2, 20, 3, 13, 140, 30]);
    expect([
      cfg.maxHp,
      cfg.maxStamina,
      cfg.maxMeter,
      cfg.staminaRegenPerSec,
      cfg.staminaRegenDelay,
    ]).toEqual([100, 100, 100, 25, 30]);
    expect([cfg.inputBuffer, cfg.chainMax, cfg.chainCancelFrames]).toEqual([6, 3, 8]);
  });

  it('rejects out-of-range or malformed numbers with a clear message', () => {
    const base = JSON.parse(readFileSync('src/data/combat.json', 'utf8')) as Record<
      string,
      unknown
    >;
    expect(() => parseCombat({ ...base, v: 2 })).toThrow(/version/);
    expect(() => parseCombat({ ...base, maxHp: 0 })).toThrow(/maxHp/);
    expect(() => parseCombat({ ...base, heavyScheme: 'tap' })).toThrow(/heavyScheme/);
    expect(() => parseCombat({ ...base, dodge: { ...cfg.dodge, invulnTo: 1 } })).toThrow(/dodge/);
    expect(() =>
      parseCombat({ ...base, arena: { ...cfg.arena, wallLeft: 900, wallRight: 100 } }),
    ).toThrow(/wallLeft/);
  });
});

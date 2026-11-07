import { describe, expect, it } from 'vitest';
import { DummyBrain } from '../../src/core/ai/dummy';
import { Rng } from '../../src/core/rng';
import { createIntent, type Intent } from '../../src/core/sim/types';
import { newSim } from './simHelpers';

/** A scripted fight: the player mashes buttons from a seeded RNG, the dummy is in attack mode. */
function fight(
  simSeed: number,
  scriptSeed: number,
  frames: number,
): { hash: number; trace: number[] } {
  const sim = newSim({ seed: simSeed });
  const brain = new DummyBrain();
  brain.setMode('attack');
  const script = new Rng(scriptSeed);
  const p: Intent = createIntent();
  const e: Intent = createIntent();
  const trace: number[] = [];
  for (let k = 0; k < frames; k++) {
    p.moveX = script.int(-1, 1);
    p.punch = script.next() < 0.2;
    p.heavy = script.next() < 0.05;
    p.block = script.next() < 0.15;
    p.dodge = script.next() < 0.04;
    p.special = script.next() < 0.03;
    brain.update(sim, e);
    sim.step(p, e);
    if (k % 100 === 0) trace.push(sim.hash());
  }
  return { hash: sim.hash(), trace };
}

describe('determinism', () => {
  it('same seed and same inputs give an identical state hash, all the way through', () => {
    const a = fight(7, 99, 1500);
    const b = fight(7, 99, 1500);
    expect(a.hash).toBe(b.hash);
    expect(a.trace).toEqual(b.trace);
  });

  it('different inputs give a different hash', () => {
    expect(fight(7, 99, 1500).hash).not.toBe(fight(7, 100, 1500).hash);
  });

  it('a different sim seed changes the dummy and so the fight', () => {
    expect(fight(7, 99, 1500).hash).not.toBe(fight(8, 99, 1500).hash);
  });

  it('reset returns to exactly the starting state', () => {
    const sim = newSim({ seed: 5 });
    const start = sim.hash();
    const i = createIntent();
    i.punch = true;
    for (let k = 0; k < 200; k++) sim.step(i, createIntent());
    expect(sim.hash()).not.toBe(start);
    sim.reset();
    expect(sim.hash()).toBe(start);
  });

  it('never produces NaN or runaway values over a long scripted fight', () => {
    const sim = newSim({ seed: 3 });
    const brain = new DummyBrain();
    brain.setMode('debuff');
    const script = new Rng(11);
    const p = createIntent();
    const e = createIntent();
    for (let k = 0; k < 6000; k++) {
      p.moveX = script.int(-1, 1);
      p.punch = script.next() < 0.25;
      p.heavy = script.next() < 0.05;
      p.block = script.next() < 0.1;
      p.dodge = script.next() < 0.05;
      p.special = script.next() < 0.05;
      brain.update(sim, e);
      sim.step(p, e);
      if (sim.over) sim.revive(sim.winner === 0 ? 1 : 0);
      for (const f of sim.fighters) {
        expect(
          Number.isFinite(f.x) &&
            Number.isFinite(f.hp) &&
            Number.isFinite(f.stamina) &&
            Number.isFinite(f.meter),
        ).toBe(true);
        expect(f.hp).toBeGreaterThanOrEqual(0);
        expect(f.stamina).toBeGreaterThanOrEqual(0);
        expect(f.meter).toBeGreaterThanOrEqual(0);
        expect(f.meter).toBeLessThanOrEqual(100);
        expect(f.x).toBeGreaterThanOrEqual(48);
        expect(f.x).toBeLessThanOrEqual(912);
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { IntentResolver, type RawInput } from '../../src/core/sim/intent';
import { createIntent } from '../../src/core/sim/types';
import { cfg, face, intent, newSim, player, put, run } from './simHelpers';

const raw = (p: Partial<RawInput> = {}): RawInput => ({
  moveX: 0,
  attack: false,
  heavy: false,
  block: false,
  dodge: false,
  special: false,
  ...p,
});
const toward = { ...cfg, heavyScheme: 'toward' as const };
const hold = { ...cfg, heavyScheme: 'hold' as const };

describe('intent resolver: toward = heavy, away = block', () => {
  it('Attack alone is a punch', () => {
    const r = new IntentResolver();
    const out = createIntent();
    r.resolve(raw({ attack: true }), 1, toward, out);
    expect(out.punch).toBe(true);
    expect(out.heavy).toBe(false);
  });

  it('stick toward the enemy + Attack is a heavy', () => {
    const r = new IntentResolver();
    const out = createIntent();
    r.resolve(raw({ attack: true, moveX: 1 }), 1, toward, out);
    expect(out.heavy).toBe(true);
    expect(out.punch).toBe(false);
  });

  it('"toward" depends on facing: facing left, toward is negative', () => {
    const r = new IntentResolver();
    const out = createIntent();
    r.resolve(raw({ attack: true, moveX: -1 }), -1, toward, out);
    expect(out.heavy).toBe(true);
  });

  it('holding the stick away blocks', () => {
    const r = new IntentResolver();
    const out = createIntent();
    r.resolve(raw({ moveX: -1 }), 1, toward, out);
    expect(out.block).toBe(true);
    r.resolve(raw({ moveX: 0.3 }), 1, toward, out);
    expect(out.block).toBe(false);
  });

  it('the block key blocks without the stick', () => {
    const r = new IntentResolver();
    const out = createIntent();
    r.resolve(raw({ block: true }), 1, toward, out);
    expect(out.block).toBe(true);
  });

  it('keeps the chosen attack while Attack stays down, even if the stick moves', () => {
    const r = new IntentResolver();
    const out = createIntent();
    r.resolve(raw({ attack: true, moveX: 1 }), 1, toward, out);
    r.resolve(raw({ attack: true, moveX: 0 }), 1, toward, out);
    expect(out.heavy).toBe(true);
    expect(out.punch).toBe(false);
  });

  it('keyboard heavy (K) works directly', () => {
    const r = new IntentResolver();
    const out = createIntent();
    r.resolve(raw({ heavy: true }), 1, toward, out);
    expect(out.heavy).toBe(true);
  });
});

describe('intent resolver: alternative "hold Attack" scheme', () => {
  it('a quick tap is a punch, fired on release', () => {
    const r = new IntentResolver();
    const out = createIntent();
    r.resolve(raw({ attack: true }), 1, hold, out);
    expect(out.punch).toBe(false);
    r.resolve(raw({ attack: false }), 1, hold, out);
    expect(out.punch).toBe(true);
    r.resolve(raw(), 1, hold, out);
    expect(out.punch).toBe(false);
  });

  it('holding for 12 frames becomes a heavy', () => {
    const r = new IntentResolver();
    const out = createIntent();
    for (let i = 0; i < 11; i++) r.resolve(raw({ attack: true }), 1, hold, out);
    expect(out.heavy).toBe(false);
    r.resolve(raw({ attack: true }), 1, hold, out);
    expect(out.heavy).toBe(true);
    r.resolve(raw(), 1, hold, out);
    expect(out.punch).toBe(false);
  });
});

describe('input buffer (6 frames)', () => {
  it('runs a punch pressed up to 6 frames before the fighter can act', () => {
    const s = newSim();
    face(s, 300);
    put(player(s), 'hurt', 1);
    player(s).stunLeft = 4;
    s.step(intent({ punch: true }), intent());
    run(s, 5);
    expect(player(s).state).toBe('punch');
  });

  it('drops a press that is more than 6 frames old', () => {
    const s = newSim();
    face(s, 300);
    put(player(s), 'hurt', 1);
    player(s).stunLeft = 12;
    s.step(intent({ punch: true }), intent());
    run(s, 14);
    expect(player(s).state).toBe('idle');
  });

  it('keeps recording presses during hitstop', () => {
    const s = newSim();
    face(s, 70);
    run(s, 1, { punch: true });
    run(s, 5);
    expect(s.hitstop).toBeGreaterThan(0);
    s.step(intent({ dodge: true }), intent());
    expect(player(s).buf.dodge).toBeGreaterThan(0);
  });
});

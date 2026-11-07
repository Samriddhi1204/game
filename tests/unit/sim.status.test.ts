import { describe, expect, it } from 'vitest';
import { isDisabled } from '../../src/core/sim/states';
import { STATUS_KINDS, type StatusKind } from '../../src/core/sim/types';
import { statusIndex } from '../../src/core/sim/sim';
import { cfg, enemy, face, intent, newSim, player, put, run, tap } from './simHelpers';

const idx = statusIndex;

describe('status effects', () => {
  it('supports all seven kinds', () => {
    expect(STATUS_KINDS).toEqual([
      'slow',
      'dodgeShort',
      'stun',
      'specialLock',
      'meterDrain',
      'blockDisabled',
      'enraged',
    ]);
  });

  it('slow halves walking speed', () => {
    const s = newSim();
    const x0 = player(s).x;
    run(s, 1, { moveX: 1 });
    const normal = player(s).x - x0;
    s.applyStatus(player(s), 'slow', 60, 0.5);
    const x1 = player(s).x;
    run(s, 1, { moveX: 1 });
    expect(player(s).x - x1).toBeCloseTo(normal / 2, 6);
  });

  it('stun freezes the fighter for its duration, then frees it', () => {
    const s = newSim();
    expect(s.applyStatus(player(s), 'stun', 30, 0)).toBe(true);
    expect(player(s).state).toBe('stunned');
    const x0 = player(s).x;
    run(s, 29, { moveX: 1, punch: true });
    expect(player(s).state).toBe('stunned');
    expect(player(s).x).toBe(x0);
    run(s, 2);
    expect(player(s).state).toBe('idle');
  });

  it('specialLock blocks LITE LO even with a full meter', () => {
    const s = newSim();
    player(s).meter = 100;
    s.applyStatus(player(s), 'specialLock', 60, 0);
    tap(s, 'special');
    expect(player(s).state).toBe('idle');
    expect(player(s).meter).toBe(100);
  });

  it('meterDrain removes X meter per second', () => {
    const s = newSim();
    player(s).meter = 50;
    s.applyStatus(player(s), 'meterDrain', 120, 20);
    run(s, 60);
    expect(player(s).meter).toBeCloseTo(30, 6);
    run(s, 120);
    expect(player(s).meter).toBeCloseTo(10, 6); // stopped draining after its 120 frames
  });

  it('blockDisabled stops blocking and drops an active block', () => {
    const s = newSim();
    run(s, 6, { block: true });
    expect(player(s).state).toBe('block');
    s.applyStatus(player(s), 'blockDisabled', 90, 0);
    expect(player(s).state).toBe('idle');
    run(s, 3, { block: true });
    expect(player(s).state).toBe('idle');
  });

  it('enraged is carried with its value for the boss AI', () => {
    const s = newSim();
    s.applyStatus(enemy(s), 'enraged', 100, 1.5);
    expect(enemy(s).hasStatus(idx('enraged'))).toBe(true);
    expect(enemy(s).statusValue[idx('enraged')]).toBe(1.5);
  });

  it('dodgeShort is covered in the dodge tests; every status counts down and expires', () => {
    for (const kind of STATUS_KINDS) {
      const s = newSim();
      const f = enemy(s);
      s.applyStatus(f, kind, 10, 1);
      expect(f.hasStatus(idx(kind)), kind).toBe(true);
      run(s, 11);
      expect(f.hasStatus(idx(kind)), kind).toBe(false);
    }
  });

  it('re-applying keeps the longer duration', () => {
    const s = newSim();
    s.applyStatus(player(s), 'slow', 100, 0.5);
    s.applyStatus(player(s), 'slow', 30, 0.5);
    expect(player(s).statusFrames[idx('slow')]).toBe(100);
  });

  it('LITE LO clears every status that can be applied', () => {
    for (const kind of STATUS_KINDS.filter((k) => k !== 'stun' && k !== 'specialLock')) {
      const s = newSim();
      player(s).meter = 100;
      s.applyStatus(player(s), kind, 200, 1);
      if (kind === 'meterDrain') player(s).meter = 110; // survive the first drain tick
      tap(s, 'special');
      expect(player(s).state, kind).toBe('special');
      expect(player(s).hasStatus(idx(kind)), kind).toBe(false);
    }
  });

  it('status icons come with the sim: applying and clearing raise events', () => {
    const s = newSim();
    s.applyStatus(player(s), 'slow', 1, 0.5);
    expect(s.events.items.slice(0, s.events.count).some((e) => e.type === 'statusApplied')).toBe(
      true,
    );
    run(s, 2);
    run(s, 1);
  });
});

describe('statuses can never lock the player out for more than 60 frames', () => {
  it('caps a long stun', () => {
    const s = newSim();
    s.applyStatus(player(s), 'stun', 500, 0);
    expect(player(s).statusFrames[idx('stun')]).toBe(cfg.maxDisabledStreak - 1); // one frame of margin
  });

  it('caps a stun applied late in an existing lock', () => {
    const s = newSim();
    put(player(s), 'hurt', 1);
    player(s).stunLeft = 100;
    player(s).streak = 50;
    s.applyStatus(player(s), 'stun', 40, 0);
    expect(player(s).statusFrames[idx('stun')]).toBe(9);
    player(s).streak = 60;
    expect(s.applyStatus(player(s), 'stun', 40, 0)).toBe(false);
  });

  it('does not stun a knocked-down or knocked-out fighter', () => {
    const s = newSim();
    put(player(s), 'knockdown', 1);
    expect(s.applyStatus(player(s), 'stun', 30, 0)).toBe(false);
    put(player(s), 'ko', 1);
    expect(s.applyStatus(player(s), 'slow', 30, 0.5)).toBe(false);
  });

  it('breaks any hit loop: relentless re-hitting still leaves a way out within 60 frames', () => {
    const s = newSim();
    face(s, 70);
    const kinds: StatusKind[] = ['stun', 'blockDisabled'];
    let run0 = 0;
    let longest = 0;
    for (let k = 0; k < 600; k++) {
      // Enemy re-throws a punch whenever it can, applying a stun on hit.
      if (enemy(s).state !== 'punch' && enemy(s).state !== 'ko') {
        put(enemy(s), 'punch', cfg.dummy.actions.punch.startup);
        enemy(s).hitStatusKind = idx(kinds[0] ?? 'stun');
        enemy(s).hitStatusFrames = 40;
        enemy(s).hitStatusValue = 0;
      }
      player(s).hp = 100; // keep the player alive for the experiment
      s.step(intent(), intent());
      run0 = isDisabled(player(s).state) ? run0 + 1 : 0;
      longest = Math.max(longest, run0);
    }
    expect(longest).toBeLessThanOrEqual(cfg.maxDisabledStreak);
    expect(longest).toBeGreaterThan(20); // the loop really did hold the player
  });
});

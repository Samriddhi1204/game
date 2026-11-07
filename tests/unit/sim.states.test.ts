import { describe, expect, it, vi } from 'vitest';
import { canTransition, isActionable, isDisabled, TRANSITIONS } from '../../src/core/sim/states';
import type { FighterStateName } from '../../src/core/sim/types';
import { enemy, newSim, player, put } from './simHelpers';

const ALL: FighterStateName[] = [
  'idle',
  'walk',
  'punch',
  'heavy',
  'block',
  'dodge',
  'hurt',
  'blockstun',
  'special',
  'stunned',
  'knockdown',
  'ko',
];

describe('fighter state machine', () => {
  it('has a table row for every one of the 12 states', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...ALL].sort());
  });

  it('allows the transitions the game needs', () => {
    expect(canTransition('idle', 'punch')).toBe(true);
    expect(canTransition('punch', 'punch')).toBe(true); // chain
    expect(canTransition('block', 'dodge')).toBe(true);
    expect(canTransition('hurt', 'hurt')).toBe(true); // second hit
    expect(canTransition('knockdown', 'idle')).toBe(true);
    expect(canTransition('dodge', 'hurt')).toBe(true);
  });

  it('forbids the impossible ones', () => {
    expect(canTransition('ko', 'idle')).toBe(false);
    expect(canTransition('knockdown', 'punch')).toBe(false);
    expect(canTransition('hurt', 'punch')).toBe(false);
    expect(canTransition('stunned', 'dodge')).toBe(false);
    expect(canTransition('heavy', 'punch')).toBe(false); // no cancelling a heavy
    expect(canTransition('dodge', 'punch')).toBe(false);
    expect(canTransition('special', 'dodge')).toBe(false);
  });

  it('lets every state except ko and knockdown be interrupted by a hit or stun', () => {
    for (const s of ALL.filter((x) => x !== 'ko' && x !== 'knockdown')) {
      expect(canTransition(s, 'ko'), s).toBe(true);
    }
    expect(canTransition('ko', 'ko')).toBe(false);
  });

  it('only idle and walk are actionable; hurt, blockstun, stunned and knockdown are disabled', () => {
    expect(ALL.filter(isActionable)).toEqual(['idle', 'walk']);
    expect(ALL.filter(isDisabled).sort()).toEqual(['blockstun', 'hurt', 'knockdown', 'stunned']);
  });

  it('throws on an impossible transition in strict (dev) mode', () => {
    const s = newSim({ strict: true });
    put(player(s), 'knockdown', 1);
    expect(() => s.transition(player(s), 'punch')).toThrow(
      /Impossible transition knockdown -> punch/,
    );
  });

  it('logs and ignores it in release mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = newSim({ strict: false });
    put(enemy(s), 'ko', 1);
    expect(s.transition(enemy(s), 'idle')).toBe(false);
    expect(enemy(s).state).toBe('ko');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

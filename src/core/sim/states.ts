import type { FighterStateName } from './types';

const ACTIONABLE: readonly FighterStateName[] = ['idle', 'walk'];

/** Every state can end in one of these; a hit or stun can interrupt anything but ko. */
const INTERRUPTS: readonly FighterStateName[] = ['hurt', 'blockstun', 'stunned', 'knockdown', 'ko'];

/**
 * The explicit transition table. Anything not listed here is impossible, and `transition` refuses it.
 * Self loops are listed where they are real (a second hit restarts hurt; a punch chains into a punch).
 */
export const TRANSITIONS: Readonly<Record<FighterStateName, readonly FighterStateName[]>> = {
  idle: ['idle', 'walk', 'punch', 'heavy', 'block', 'dodge', 'special', ...INTERRUPTS],
  walk: ['idle', 'walk', 'punch', 'heavy', 'block', 'dodge', 'special', ...INTERRUPTS],
  punch: ['idle', 'punch', ...INTERRUPTS],
  heavy: ['idle', ...INTERRUPTS],
  block: ['idle', 'punch', 'heavy', 'dodge', 'special', ...INTERRUPTS],
  dodge: ['idle', ...INTERRUPTS],
  hurt: ['idle', 'hurt', 'stunned', 'blockstun', 'knockdown', 'ko'],
  blockstun: ['idle', 'blockstun', 'hurt', 'stunned', 'knockdown', 'ko'],
  special: ['idle', ...INTERRUPTS],
  stunned: ['idle', 'stunned', 'hurt', 'knockdown', 'ko'],
  knockdown: ['idle', 'ko'],
  ko: [],
};

export function canTransition(from: FighterStateName, to: FighterStateName): boolean {
  return TRANSITIONS[from].includes(to);
}

/** States in which a fighter may start a new action. */
export function isActionable(state: FighterStateName): boolean {
  return ACTIONABLE.includes(state);
}

/** States in which a fighter cannot act. Their consecutive length is capped (spec section 10). */
export function isDisabled(state: FighterStateName): boolean {
  return state === 'hurt' || state === 'blockstun' || state === 'stunned' || state === 'knockdown';
}

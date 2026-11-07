/** The actions a touch button can hold down (written into the input state while a finger is on it). */
export type HoldAction = 'attack' | 'dodge' | 'special';

/** Anything the input layer can hit-test a finger against. */
export interface TouchButton {
  contains(lx: number, ly: number): boolean;
  enabled: boolean;
  /** Called on pointer down for buttons that are not `hold` buttons. */
  press(): void;
  /** If set, the button holds this action while a finger is on it. */
  readonly hold?: HoldAction | undefined;
  /** Visual feedback while held. */
  setPressed?(pressed: boolean): void;
}

/** Shared pure types for the game core. No Phaser, no DOM. */

/** Names of the input actions gameplay reads (spec section 5). */
export interface InputState {
  moveX: number;
  moveY: number;
  attack: boolean;
  heavy: boolean;
  block: boolean;
  dodge: boolean;
  special: boolean;
  interact: boolean;
  pause: boolean;
}

/** Scene identifiers, mirrored to `data-scene` on <html> for tests. */
export type SceneKey = 'Boot' | 'Preload' | 'TapToStart' | 'Map' | 'Error';

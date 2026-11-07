import type Phaser from 'phaser';
import type { DummyBrain } from '../../core/ai/dummy';
import type { CombatConfig } from '../../core/sim/config';
import type { Sim } from '../../core/sim/sim';

/** What the lazy-loaded fight debug panel may touch. Types only: no runtime cost. */
export interface FightDebugHost {
  readonly scene: Phaser.Scene;
  readonly sim: Sim;
  readonly brain: DummyBrain;
  readonly cfg: CombatConfig;
  /** Refresh anything that shows the dummy mode. */
  syncDummyLabel(): void;
}

import type Phaser from 'phaser';
import type { HotspotDef } from '../../core/map/hotspots';
import type { TileGrid } from '../../core/map/tiles';
import type { MapSize, Vec2 } from '../../core/map/types';

/** What the lazy-loaded debug editor may touch on the Map scene. Types only: no runtime cost. */
export interface MapEditorHost {
  readonly scene: Phaser.Scene;
  readonly hotspots: HotspotDef[];
  readonly grid: TileGrid;
  readonly mapSize: MapSize;
  readonly player: Vec2;
  /** Top-left of the world view in map pixels. The editor moves it while free-cam is on. */
  readonly view: Vec2;
  readonly worldLayer: Phaser.GameObjects.Layer;
  zoom: number;
  /** While true the scene stops following the player. */
  freeCam: boolean;
  /** While false, joystick, keyboard and buttons are ignored by gameplay. */
  inputEnabled: boolean;
  /** Total game objects, including those inside layers. */
  objectCount(): number;
  /** Re-place NPC circles and labels after a hotspot was moved. */
  syncVisuals(): void;
  /** Change one tile in the grid and on screen. */
  setTile(col: number, row: number, type: number): void;
}

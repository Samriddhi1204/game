import type { HotspotDef } from '../core/map/hotspots';
import { findSpawn, parseHotspots, parseTilemap, parseTiles } from '../core/map/parse';
import type { TileDef, TileGrid } from '../core/map/tiles';
import { parseCombat, type CombatConfig } from '../core/sim/config';
import combatJson from './combat.json';
import hotspotsJson from './hotspots.json';
import tilemapJson from './tilemap.json';
import tilesJson from './tiles.json';

export function loadTiles(): TileDef[] {
  return parseTiles(tilesJson);
}

/** Fresh mutable copies, so the debug editor can change them without touching the imports. */
export function loadGrid(): TileGrid {
  return parseTilemap(tilemapJson, loadTiles());
}

export function loadCombat(): CombatConfig {
  return parseCombat(combatJson);
}

export function loadHotspots(): HotspotDef[] {
  return parseHotspots(hotspotsJson);
}

export { findSpawn };

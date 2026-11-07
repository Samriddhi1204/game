import type { HotspotDef } from '../core/map/hotspots';
import { findSpawn, parseCollision, parseHotspots } from '../core/map/parse';
import type { NamedRect } from '../core/map/types';
import collisionJson from './collision.json';
import hotspotsJson from './hotspots.json';

/** Fresh mutable copies, so the debug editor can change them without touching the imports. */
export function loadHotspots(): HotspotDef[] {
  return parseHotspots(hotspotsJson);
}

export function loadCollision(): NamedRect[] {
  return parseCollision(collisionJson);
}

export { findSpawn };

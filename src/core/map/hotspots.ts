export type HotspotKind = 'spawn' | 'section' | 'npc' | 'shop' | 'board' | 'landmark';

export const HOTSPOT_KINDS: readonly HotspotKind[] = [
  'spawn',
  'section',
  'npc',
  'shop',
  'board',
  'landmark',
];

export interface HotspotDef {
  id: string;
  label: string;
  kind: HotspotKind;
  x: number;
  y: number;
  radius: number;
  /** Context-button text. Hotspots without one (landmarks, spawn) never show a button. */
  action?: string;
  requiresWins?: number;
  lockedHint?: string;
  /** Placeholder circle colour for NPCs, "#rrggbb". */
  color?: string;
}

export type HotspotStatus = 'ready' | 'locked' | 'conquered';

export interface HotspotContext {
  winCount: number;
  conquered: ReadonlySet<string>;
}

/**
 * Decides which hotspot, if any, offers the context button. After a hotspot is triggered it stays
 * quiet until the player has left its radius (spec section 12).
 */
export class HotspotTracker {
  active: HotspotDef | null = null;
  status: HotspotStatus = 'ready';
  private readonly consumed: boolean[];

  constructor(private readonly defs: readonly HotspotDef[]) {
    this.consumed = defs.map(() => false);
  }

  update(x: number, y: number, ctx: HotspotContext): void {
    let best = -1;
    let bestD2 = Infinity;
    for (let i = 0; i < this.defs.length; i++) {
      const h = this.defs[i];
      if (!h) continue;
      const dx = h.x - x;
      const dy = h.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > h.radius * h.radius) {
        this.consumed[i] = false;
        continue;
      }
      if (h.action === undefined || this.consumed[i]) continue;
      if (d2 < bestD2) {
        best = i;
        bestD2 = d2;
      }
    }
    const h = best >= 0 ? (this.defs[best] ?? null) : null;
    this.active = h;
    if (!h) {
      this.status = 'ready';
    } else if (ctx.conquered.has(h.id)) {
      this.status = 'conquered';
    } else if ((h.requiresWins ?? 0) > ctx.winCount) {
      this.status = 'locked';
    } else {
      this.status = 'ready';
    }
  }

  /** Keep a hotspot quiet until the player leaves its radius (e.g. returning from its fight). */
  markConsumed(id: string): void {
    const i = this.defs.findIndex((d) => d.id === id);
    if (i >= 0) this.consumed[i] = true;
  }

  /** Fire the active hotspot. Returns it only if it is ready; locked or conquered return null. */
  trigger(): HotspotDef | null {
    const h = this.active;
    if (!h || this.status !== 'ready') return null;
    const i = this.defs.indexOf(h);
    if (i >= 0) this.consumed[i] = true;
    this.active = null;
    return h;
  }
}

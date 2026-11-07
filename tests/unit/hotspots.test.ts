import { describe, expect, it } from 'vitest';
import { HotspotTracker, type HotspotContext, type HotspotDef } from '../../src/core/map/hotspots';

const defs: HotspotDef[] = [
  { id: 'a', label: 'A', kind: 'section', x: 100, y: 100, radius: 50, action: 'Challenge' },
  { id: 'b', label: 'B', kind: 'npc', x: 130, y: 100, radius: 50, action: 'Baat karo' },
  {
    id: 'gate',
    label: 'Gate',
    kind: 'section',
    x: 500,
    y: 500,
    radius: 50,
    action: 'Challenge',
    requiresWins: 5,
    lockedHint: 'nope',
  },
  { id: 'lib', label: 'Library', kind: 'landmark', x: 800, y: 800, radius: 50 },
];
const ctx = (winCount = 0, conquered: string[] = []): HotspotContext => ({
  winCount,
  conquered: new Set(conquered),
});

describe('HotspotTracker', () => {
  it('has no prompt when nothing is near', () => {
    const t = new HotspotTracker(defs);
    t.update(900, 900, ctx());
    expect(t.active).toBeNull();
  });

  it('picks the nearest centre when radii overlap', () => {
    const t = new HotspotTracker(defs);
    t.update(95, 100, ctx());
    expect(t.active?.id).toBe('a');
    t.update(128, 100, ctx());
    expect(t.active?.id).toBe('b');
  });

  it('never prompts for landmarks, which have no action', () => {
    const t = new HotspotTracker(defs);
    t.update(800, 800, ctx());
    expect(t.active).toBeNull();
  });

  it('triggers once, then needs the player to leave the radius', () => {
    const t = new HotspotTracker(defs);
    t.update(60, 100, ctx());
    expect(t.trigger()?.id).toBe('a');
    t.update(61, 100, ctx());
    expect(t.active).toBeNull();
    expect(t.trigger()).toBeNull();
    t.update(300, 300, ctx());
    t.update(60, 100, ctx());
    expect(t.trigger()?.id).toBe('a');
  });

  it('shows a locked hotspot but refuses to trigger it', () => {
    const t = new HotspotTracker(defs);
    t.update(500, 500, ctx(4));
    expect(t.active?.id).toBe('gate');
    expect(t.status).toBe('locked');
    expect(t.trigger()).toBeNull();
    t.update(500, 500, ctx(5));
    expect(t.status).toBe('ready');
    expect(t.trigger()?.id).toBe('gate');
  });

  it('marks conquered sections and does not trigger them', () => {
    const t = new HotspotTracker(defs);
    t.update(500, 500, ctx(5, ['gate']));
    expect(t.status).toBe('conquered');
    expect(t.trigger()).toBeNull();
  });
});

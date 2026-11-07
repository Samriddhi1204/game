import Phaser from 'phaser';
import { ENEMY, PLAYER } from '../../core/sim/types';
import type { ArenaRect } from '../../core/sim/sim';
import type { FightDebugHost } from './fightHost';

/** check-size-budget fails if this string shows up in the initial bundle. */
const FIGHT_DEBUG_MARKER = 'FIGHT_DEBUG_MARKER';

const CSS = `
#dbg-fight{position:fixed;left:4px;bottom:4px;z-index:15;display:flex;flex-wrap:wrap;gap:4px;max-width:60vw;font:12px system-ui,sans-serif;touch-action:manipulation}
#dbg-fight button{font:inherit;min-height:34px;padding:4px 10px;border:1px solid #000;border-radius:6px;background:#dde3ea;color:#111}
#dbg-fight button[data-on=true]{background:#f2c14e}
#dbg-fight-info{position:fixed;left:4px;top:4px;z-index:15;margin:0;padding:3px 6px;background:#000a;color:#9f9;font:11px/1.3 ui-monospace,monospace;pointer-events:none;white-space:pre}
`;

/**
 * Debug tools for fights (spec section 12): hitbox overlay and cheats. Damage-dealing cheats that
 * need later phases (money, win count) arrive with those phases.
 */
export function attachFightDebug(host: FightDebugHost): () => void {
  const { scene, sim, brain, cfg } = host;
  let hitboxes = true;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const bar = document.createElement('div');
  bar.id = 'dbg-fight';
  bar.setAttribute('data-debug', FIGHT_DEBUG_MARKER);
  const info = document.createElement('pre');
  info.id = 'dbg-fight-info';
  document.body.append(bar, info);

  const add = (id: string, label: string, onClick: (b: HTMLButtonElement) => void): void => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset['id'] = id;
    b.textContent = label;
    b.addEventListener('click', () => {
      onClick(b);
    });
    bar.appendChild(b);
  };
  add('hitboxes', 'Hitboxes', (b) => {
    hitboxes = !hitboxes;
    b.dataset['on'] = String(hitboxes);
  });
  bar.querySelector<HTMLButtonElement>('[data-id=hitboxes]')?.setAttribute('data-on', 'true');
  add('meter', '+Meter', () => {
    const p = sim.fighters[PLAYER];
    p.meter = cfg.maxMeter;
  });
  add('heal', 'Heal', () => {
    const p = sim.fighters[PLAYER];
    p.hp = p.maxHp;
    p.stamina = cfg.maxStamina;
  });
  add('stamina', '0 stamina', () => {
    sim.fighters[PLAYER].stamina = 0;
  });
  add('kill', 'Kill dummy', () => {
    sim.fighters[ENEMY].hp = 1;
  });
  add('mode', 'Dummy mode', () => {
    brain.cycleMode();
    host.syncDummyLabel();
  });

  const g = scene.add.graphics();
  const a: ArenaRect = { x: 0, y: 0, w: 0, h: 0 };
  const draw = (): void => {
    g.clear();
    if (!hitboxes) return;
    for (const f of sim.fighters) {
      sim.hurtBox(f, a);
      g.lineStyle(2, 0x40c4ff, 1);
      g.strokeRect(a.x, a.y, a.w, a.h);
      if (f.state === 'punch' || f.state === 'heavy' || f.state === 'special') {
        const def = f.actions[f.state];
        sim.attackBox(f, def, a);
        const active = f.frame > def.startup && f.frame <= def.startup + def.active;
        g.lineStyle(2, active ? 0xff1744 : 0xffc107, 1);
        g.strokeRect(a.x, a.y, a.w, a.h);
        if (active) {
          g.fillStyle(0xff1744, 0.25);
          g.fillRect(a.x, a.y, a.w, a.h);
        }
      }
    }
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, draw);

  const timer = scene.time.addEvent({
    delay: 200,
    loop: true,
    callback: () => {
      const p = sim.fighters[PLAYER];
      const e = sim.fighters[ENEMY];
      info.textContent =
        `frame ${sim.frame}  hitstop ${sim.hitstop}  hash ${sim.hash().toString(16)}\n` +
        `you   ${p.state}/${p.frame} chain ${p.chain} hp ${p.hp.toFixed(1)} st ${p.stamina.toFixed(0)} mt ${p.meter.toFixed(0)}\n` +
        `dummy ${e.state}/${e.frame} hp ${e.hp.toFixed(1)}  fps ${scene.game.loop.actualFps.toFixed(0)}`;
    },
  });

  return () => {
    timer.remove();
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, draw);
    g.destroy();
    bar.remove();
    info.remove();
    style.remove();
  };
}

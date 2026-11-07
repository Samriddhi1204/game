import Phaser from 'phaser';
import { DummyBrain } from '../../core/ai/dummy';
import type { Vec2 } from '../../core/map/types';
import type { CombatConfig } from '../../core/sim/config';
import { IntentResolver } from '../../core/sim/intent';
import { Sim } from '../../core/sim/sim';
import { createIntent, ENEMY, PLAYER, STATUS_KINDS } from '../../core/sim/types';
import { loadCombat } from '../../data';
import { DEBUG, GAME_HEIGHT, GAME_WIDTH, TEST_HOOKS } from '../config';
import type { FightDebugHost } from '../debug/fightHost';
import { setSceneLabel } from '../dom';
import { addText, setView } from '../gfx';
import { takeFirstFightHints } from '../hints';
import { InputManager } from '../input/InputManager';
import { ActionButton, drawIcon } from '../ui/ActionButton';
import { FighterView } from '../ui/FighterView';
import { FightHud } from '../ui/FightHud';
import { HitButton } from '../ui/HitButton';
import { PauseMenu } from '../ui/PauseMenu';
import { PopPool } from '../ui/PopPool';
import type { TouchButton } from '../ui/TouchButton';

export interface FightSceneData {
  hotspotId?: string;
  label?: string;
  returnPos?: Vec2;
}

const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 5;
const MAX_FRAME_MS = 100;
const HOOK_INTERVAL_MS = 100;
const STATUS_NAMES = [
  'Slow',
  'Short dodge',
  'Stunned',
  'Special locked',
  'Meter drain',
  'Block disabled',
  'Enraged',
];

/** Remove the fight's test-hook attributes from <html>. */
function clearFightHooks(): void {
  const d = document.documentElement.dataset;
  for (const k of [
    'fightPlayerHp',
    'fightEnemyHp',
    'fightPlayerState',
    'fightEnemyState',
    'fightMeter',
    'fightStamina',
    'fightDummy',
    'fightPaused',
    'fightFrame',
    'fightPlayerX',
    'fightEnemyX',
  ]) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete d[k];
  }
}

export class FightScene extends Phaser.Scene {
  private cfg!: CombatConfig;
  private sim!: Sim;
  private readonly brain = new DummyBrain();
  private readonly resolver = new IntentResolver();
  private readonly pIntent = createIntent();
  private readonly eIntent = createIntent();
  private controls!: InputManager;
  private views: [FighterView, FighterView] | null = null;
  private hud!: FightHud;
  private pops!: PopPool;
  private pauseMenu!: PauseMenu;
  private dummyButton!: HitButton;
  private specialButton: ActionButton | null = null;
  private retry!: Phaser.GameObjects.Text;
  private acc = 0;
  private paused = false;
  private prevPause = false;
  private reviveAt = -1;
  private hookClock = 0;
  private returnPos: Vec2 | undefined;
  private hotspotId: string | undefined;
  private detachDebug: (() => void) | null = null;

  constructor() {
    super('Fight');
  }

  init(data: FightSceneData): void {
    this.returnPos = data.returnPos;
    this.hotspotId = data.hotspotId;
  }

  create(): void {
    setSceneLabel('Fight');
    setView(this.cameras.main, 0, 0);
    this.cfg = loadCombat();
    this.sim = new Sim(this.cfg, { strict: import.meta.env.DEV });
    this.brain.setMode('idle');
    this.resolver.reset();
    this.acc = 0;
    this.paused = false;
    this.prevPause = false;
    this.reviveAt = -1;
    this.hookClock = 0;
    const touch = this.sys.game.device.input.touch;
    const c = this.cfg;

    const world = this.add.layer();
    const hudLayer = this.add.layer();
    const topLayer = this.add.layer();

    // Arena
    world.add([
      this.add
        .rectangle(
          0,
          0,
          GAME_WIDTH,
          GAME_HEIGHT,
          Phaser.Display.Color.HexStringToColor(c.arena.color).color,
        )
        .setOrigin(0, 0),
      this.add
        .rectangle(0, c.arena.floorY, GAME_WIDTH, GAME_HEIGHT - c.arena.floorY, 0x000000, 0.28)
        .setOrigin(0, 0),
      this.add.rectangle(0, c.arena.floorY, GAME_WIDTH, 4, 0xffffff, 0.35).setOrigin(0, 0),
    ]);
    this.views = [
      new FighterView(this, world, 0xffd54f, c.arena.floorY),
      new FighterView(this, world, 0x8d6e63, c.arena.floorY),
    ];
    this.pops = new PopPool(this, world);
    this.hud = new FightHud(this, hudLayer, 'Training Dummy');

    // Buttons. Attack and Dodge are always there; Special appears when the meter is full.
    const buttons: TouchButton[] = [];
    if (touch) {
      const attack = new ActionButton(this, 850, 438, 58, 'fist', 'attack');
      const dodge = new ActionButton(this, 722, 474, 48, 'dash', 'dodge');
      this.specialButton = new ActionButton(this, 850, 314, 48, 'star', 'special');
      this.specialButton.setVisible(false);
      hudLayer.add([attack.container, dodge.container, this.specialButton.container]);
      buttons.push(attack, dodge, this.specialButton);
    } else {
      this.specialButton = null;
    }
    const pauseButton = new ActionButton(this, 902, 50, 30, 'pause', undefined, () => {
      this.setPaused(true);
    });
    hudLayer.add(pauseButton.container);
    buttons.push(pauseButton);
    this.dummyButton = new HitButton(
      this,
      340,
      18,
      190,
      44,
      '',
      () => {
        this.brain.cycleMode();
        this.syncDummyLabel();
      },
      20,
    );
    hudLayer.add(this.dummyButton.container);
    buttons.push(this.dummyButton);
    this.syncDummyLabel();

    this.controls = new InputManager(this, hudLayer, buttons);

    // "Lite lo, phir se" appears if you are knocked out.
    this.retry = addText(this, GAME_WIDTH / 2, 230, '  Lite lo, phir se  ', {
      fontSize: '44px',
      fontStyle: 'bold',
      color: '#1a1a1a',
      backgroundColor: '#f2c14e',
      padding: { x: 28, y: 16 },
    })
      .setOrigin(0.5)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.retry.on('pointerdown', () => {
      this.restart();
    });
    topLayer.add(this.retry);

    this.pauseMenu = new PauseMenu(this, topLayer, {
      resume: () => {
        this.setPaused(false);
      },
      toMap: () => {
        this.scene.start('Map', { pos: this.returnPos, consumedId: this.hotspotId });
      },
    });

    if (touch && takeFirstFightHints()) this.showHints(hudLayer);

    const resetClock = (): void => {
      this.acc = 0;
    };
    this.game.events.on(Phaser.Core.Events.VISIBLE, resetClock);
    this.game.events.on(Phaser.Core.Events.RESUME, resetClock);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.VISIBLE, resetClock);
      this.game.events.off(Phaser.Core.Events.RESUME, resetClock);
      this.controls.destroy();
      this.detachDebug?.();
      this.detachDebug = null;
      if (TEST_HOOKS) clearFightHooks();
    });

    if (DEBUG) {
      const host: FightDebugHost = {
        scene: this,
        sim: this.sim,
        brain: this.brain,
        cfg: this.cfg,
        syncDummyLabel: () => {
          this.syncDummyLabel();
        },
      };
      void import('../debug/fightDebug')
        .then((m) => {
          if (this.sys.isActive()) this.detachDebug = m.attachFightDebug(host);
        })
        .catch((err: unknown) => {
          console.error('Fight debug failed to load', err);
        });
    }
  }

  update(_time: number, delta: number): void {
    const sim = this.sim;
    const player = sim.fighters[PLAYER];
    this.controls.enabled = !this.paused && player.state !== 'ko';
    this.controls.update();
    const s = this.controls.state;
    if (s.pause && !this.prevPause) this.setPaused(!this.paused);
    this.prevPause = s.pause;

    if (!this.paused) {
      this.acc += Math.min(delta, MAX_FRAME_MS);
      let steps = 0;
      while (this.acc >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
        this.fixedStep();
        this.acc -= STEP_MS;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME && this.acc >= STEP_MS) this.acc = 0; // never spiral
    }
    this.render(this.paused ? 0 : this.acc / STEP_MS, delta);

    if (TEST_HOOKS) {
      this.hookClock += delta;
      if (this.hookClock >= HOOK_INTERVAL_MS) {
        this.hookClock = 0;
        this.writeHooks();
      }
    }
  }

  private fixedStep(): void {
    const sim = this.sim;
    const p = sim.fighters[PLAYER];
    this.resolver.resolve(this.controls.state, p.facing, this.cfg, this.pIntent);
    this.brain.update(sim, this.eIntent);
    sim.step(this.pIntent, this.eIntent);
    this.consumeEvents();
    const e = sim.fighters[ENEMY];
    // The dummy gets back up after a while; if you are the one knocked out, "Lite lo, phir se".
    if (e.state === 'ko') {
      if (this.reviveAt < 0) this.reviveAt = sim.frame + this.cfg.dummy.reviveFrames;
      else if (sim.frame >= this.reviveAt) {
        sim.revive(ENEMY);
        this.reviveAt = -1;
      }
    }
    if (p.state === 'ko' && !this.retry.visible) this.retry.setVisible(true);
  }

  private consumeEvents(): void {
    const sim = this.sim;
    const views = this.views;
    if (!views) return;
    for (let i = 0; i < sim.events.count; i++) {
      const ev = sim.events.items[i];
      if (!ev) continue;
      const f = sim.fighters[ev.who];
      if (!f) continue;
      const x = f.x;
      const top = this.cfg.arena.floorY - 150;
      switch (ev.type) {
        case 'hit':
          this.pops.spawn(
            x,
            top,
            `−${(ev.a / 10).toFixed(1)} CGPA`,
            ev.who === PLAYER ? '#ff5252' : '#ffffff',
            24 + (ev.b >= 3 ? 6 : 0),
          );
          views[ev.who]?.flash(6, 0xffffff);
          break;
        case 'blocked':
          this.pops.spawn(x, top, `−${(ev.a / 10).toFixed(1)} CGPA`, '#90caf9', 20);
          views[ev.who]?.flash(4, 0x4fc3f7);
          break;
        case 'blockBreak':
          this.pops.spawn(x, top - 28, 'Guard broken!', '#ffab40', 22, 900);
          break;
        case 'special':
          this.pops.spawn(x, top - 20, 'LITE LO!', '#ffd54f', 44, 1000, 50);
          break;
        case 'dodgeDenied':
          this.pops.spawn(x, top, 'No stamina', '#a5d6a7', 20);
          break;
        case 'ko':
          this.pops.spawn(
            x,
            top - 20,
            ev.who === ENEMY ? 'Section clear!' : 'F grade',
            '#ffffff',
            40,
            1200,
            30,
          );
          break;
        case 'statusApplied':
          if (ev.who === PLAYER)
            this.pops.spawn(x, top - 26, STATUS_NAMES[ev.a] ?? 'Debuff', '#fff59d', 20, 900);
          break;
        default:
          break;
      }
    }
  }

  private render(alpha: number, delta: number): void {
    const sim = this.sim;
    const views = this.views;
    if (!views) return;
    const p = sim.fighters[PLAYER];
    const e = sim.fighters[ENEMY];
    views[PLAYER].update(p, p.actions, this.cfg, alpha, false);
    views[ENEMY].update(e, e.actions, this.cfg, alpha, true);
    this.hud.update(p, e, this.cfg.maxStamina, this.cfg.maxMeter);
    this.pops.update(delta);
    const sp = this.specialButton;
    if (sp) {
      const full = p.meter >= this.cfg.maxMeter;
      sp.setVisible(full);
      sp.setEnabled(!p.hasStatus(STATUS_KINDS.indexOf('specialLock')));
    }
  }

  private setPaused(on: boolean): void {
    if (this.paused === on) return;
    this.paused = on;
    this.pauseMenu.show(on);
    this.controls.releaseAll();
    this.acc = 0;
  }

  private restart(): void {
    this.sim.reset();
    this.resolver.reset();
    this.reviveAt = -1;
    this.retry.setVisible(false);
    this.acc = 0;
  }

  private syncDummyLabel(): void {
    const mode = this.brain.mode;
    this.dummyButton.setLabel(`Dummy: ${mode.charAt(0).toUpperCase()}${mode.slice(1)}`);
  }

  /** First fight only: small icons near the controls, no text, no pause (spec section 5). */
  private showHints(layer: Phaser.GameObjects.Layer): void {
    const heavy = this.add.graphics({ x: 706, y: 372 });
    heavy.lineStyle(3, 0xffffff, 1);
    heavy.strokeCircle(0, 0, 13);
    heavy.fillStyle(0xffffff, 1);
    heavy.fillTriangle(9, 0, -1, -7, -1, 7);
    heavy.fillRect(-8, -2, 9, 4);
    heavy.fillRect(24, -2, 12, 4);
    heavy.fillRect(28, -6, 4, 12);
    const heavyFist = this.add.graphics({ x: 706 + 66, y: 372 }).setScale(0.55);
    drawIcon(heavyFist, 'fist', 0xffffff);
    const block = this.add.graphics({ x: 120, y: 400 });
    block.lineStyle(3, 0xffffff, 1);
    block.strokeCircle(0, 0, 13);
    block.fillStyle(0xffffff, 1);
    block.fillTriangle(-9, 0, 1, -7, 1, 7);
    block.fillRect(-1, -2, 9, 4);
    block.fillRoundedRect(26, -12, 18, 24, 5);
    const all = [heavy, heavyFist, block];
    layer.add(all);
    for (const g of all) g.setAlpha(0);
    this.tweens.chain({
      targets: all,
      tweens: [
        { alpha: 0.9, duration: 400 },
        { alpha: 0.9, duration: 5000 },
        { alpha: 0, duration: 600 },
      ],
      onComplete: () => {
        for (const g of all) g.destroy();
      },
    });
  }

  private writeHooks(): void {
    const d = document.documentElement.dataset;
    const sim = this.sim;
    const p = sim.fighters[PLAYER];
    const e = sim.fighters[ENEMY];
    d['fightPlayerHp'] = p.hp.toFixed(1);
    d['fightEnemyHp'] = e.hp.toFixed(1);
    d['fightPlayerState'] = p.state;
    d['fightEnemyState'] = e.state;
    d['fightMeter'] = String(Math.round(p.meter));
    d['fightStamina'] = String(Math.round(p.stamina));
    d['fightDummy'] = this.brain.mode;
    d['fightPaused'] = String(this.paused);
    d['fightFrame'] = String(sim.frame);
    d['fightPlayerX'] = String(Math.round(p.x));
    d['fightEnemyX'] = String(Math.round(e.x));
  }
}

import Phaser from 'phaser';
import { followView, roundToDevicePixel, snapView } from '../../core/map/camera';
import { moveAndCollide } from '../../core/map/collision';
import { HotspotTracker, type HotspotDef } from '../../core/map/hotspots';
import type { MapSize, Vec2 } from '../../core/map/types';
import { findSpawn, loadCollision, loadHotspots } from '../../data';
import {
  DEBUG,
  GAME_HEIGHT,
  GAME_WIDTH,
  MAP_ZOOM,
  MAX_FRAME_MS,
  PLAYER_SPEED,
  RENDER_SCALE,
  TEST_HOOKS,
} from '../config';
import type { MapEditorHost } from '../debug/host';
import { setSceneLabel } from '../dom';
import { addText, setView } from '../gfx';
import { InputManager } from '../input/InputManager';
import { HitButton } from '../ui/HitButton';
import { UserFacingError } from '../userError';
import { MAP_TEXTURE } from './PreloadScene';

interface Marker {
  def: HotspotDef;
  shape: Phaser.GameObjects.Shape | null;
  label: Phaser.GameObjects.Text;
}

const LABEL_LIFT = 16;
const HOOK_INTERVAL_MS = 100;

function colorOf(def: HotspotDef): number {
  return def.color ? parseInt(def.color.slice(1), 16) : 0xffffff;
}

export class MapScene extends Phaser.Scene {
  private host!: MapEditorHost;
  private tracker!: HotspotTracker;
  private controls!: InputManager;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private ctxButton!: HitButton;
  private ctxHint!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private playerBody!: Phaser.GameObjects.Arc;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private markers: Marker[] = [];
  private readonly empty: ReadonlySet<string> = new Set<string>();
  private winCount = 0;
  private lastPromptKey = '';
  private hookClock = 0;
  private actionCount = 0;
  private lastAction = '';
  private firstFrame = true;
  private detachEditor: (() => void) | null = null;

  constructor() {
    super('Map');
  }

  create(): void {
    setSceneLabel('Map');
    this.markers = [];
    this.firstFrame = true;
    this.actionCount = 0;
    this.lastAction = '';
    this.lastPromptKey = '';

    const hotspots = loadHotspots();
    const rects = loadCollision();
    const tex = this.textures.get(MAP_TEXTURE).getSourceImage();
    const mapSize: MapSize = { width: tex.width, height: tex.height };
    this.checkTextureSize(mapSize);

    const worldCam = this.cameras.main;
    worldCam.setBackgroundColor('#0b1118');
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    setView(this.uiCam, 0, 0);

    const worldLayer = this.add.layer();
    const uiLayer = this.add.layer();
    worldCam.ignore(uiLayer);
    this.uiCam.ignore(worldLayer);

    const spawn = findSpawn(hotspots);
    const player: Vec2 = { x: spawn.x, y: spawn.y };
    const view: Vec2 = { x: 0, y: 0 };
    this.host = {
      scene: this,
      hotspots,
      rects,
      mapSize,
      player,
      view,
      worldLayer,
      zoom: MAP_ZOOM,
      freeCam: false,
      inputEnabled: true,
      objectCount: () => this.children.length + worldLayer.length + uiLayer.length,
      syncVisuals: () => {
        this.syncMarkers();
      },
    };
    this.tracker = new HotspotTracker(hotspots);

    // World
    worldLayer.add(this.add.image(0, 0, MAP_TEXTURE).setOrigin(0, 0));
    for (const def of hotspots) this.markers.push(this.buildMarker(def, worldLayer));
    this.playerShadow = this.add.ellipse(0, 0, 26, 12, 0x000000, 0.3);
    this.playerBody = this.add.circle(0, 0, 11, 0xffd54f).setStrokeStyle(3, 0x3b2f2f);
    worldLayer.add([this.playerShadow, this.playerBody]);

    // HUD
    const buttons: HitButton[] = [];
    this.ctxButton = new HitButton(this, GAME_WIDTH - 264, GAME_HEIGHT - 108, 240, 84, '', () => {
      // Pressing is handled through InputManager as an "interact" action.
    });
    this.ctxButton.setVisible(false);
    buttons.push(this.ctxButton);
    uiLayer.add(this.ctxButton.container);
    if (this.scale.fullscreen.available) {
      const fs = new HitButton(
        this,
        GAME_WIDTH - 88,
        16,
        72,
        72,
        '⛶',
        () => {
          this.scale.toggleFullscreen();
        },
        40,
      );
      buttons.push(fs);
      uiLayer.add(fs.container);
    }
    this.ctxHint = addText(this, GAME_WIDTH - 144, GAME_HEIGHT - 120, '', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#000000bb',
      padding: { x: 8, y: 4 },
      align: 'center',
    })
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.toast = addText(this, GAME_WIDTH / 2, 20, '', {
      fontSize: '22px',
      color: '#ffffff',
      backgroundColor: '#000000cc',
      padding: { x: 14, y: 8 },
    })
      .setOrigin(0.5, 0)
      .setVisible(false);
    uiLayer.add([this.ctxHint, this.toast]);

    this.controls = new InputManager(this, uiLayer, buttons, this.ctxButton);

    snapView(view, player, GAME_WIDTH / MAP_ZOOM, GAME_HEIGHT / MAP_ZOOM, mapSize);
    this.placePlayer();
    this.applyView();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.controls.destroy();
      this.detachEditor?.();
      this.detachEditor = null;
      this.toastTimer = null;
    });

    if (DEBUG) {
      void import('../debug/mapEditor')
        .then((m) => {
          if (this.sys.isActive()) this.detachEditor = m.attachMapEditor(this.host);
        })
        .catch((err: unknown) => {
          console.error('Debug editor failed to load', err);
        });
    }
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, MAX_FRAME_MS) / 1000;
    const host = this.host;
    this.controls.enabled = host.inputEnabled;
    this.controls.update();
    const s = this.controls.state;

    let mx = s.moveX;
    let my = s.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    if (mx !== 0 || my !== 0) {
      moveAndCollide(
        host.player,
        mx * PLAYER_SPEED * dt,
        my * PLAYER_SPEED * dt,
        host.rects,
        host.mapSize,
      );
      this.placePlayer();
    }

    this.tracker.update(host.player.x, host.player.y, {
      winCount: this.winCount,
      conquered: this.empty,
    });
    if (this.controls.interactPressed) {
      const h = this.tracker.trigger();
      if (h) this.onInteract(h);
    }
    this.updatePrompt();

    if (!host.freeCam) {
      const vw = GAME_WIDTH / host.zoom;
      const vh = GAME_HEIGHT / host.zoom;
      if (this.firstFrame) snapView(host.view, host.player, vw, vh, host.mapSize);
      else followView(host.view, host.player, vw, vh, host.mapSize, dt);
    }
    this.firstFrame = false;
    this.applyView();

    if (TEST_HOOKS) {
      this.hookClock += delta;
      if (this.hookClock >= HOOK_INTERVAL_MS) {
        this.hookClock = 0;
        this.writeHooks();
      }
    }
  }

  private checkTextureSize(map: MapSize): void {
    const renderer = this.game.renderer;
    if (renderer.type !== Phaser.WEBGL) return;
    const gl = (renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl;
    const max = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
    if (map.width > max || map.height > max) {
      throw new UserFacingError(
        `This device cannot show the map (${map.width}x${map.height}, limit ${max}).`,
      );
    }
  }

  private buildMarker(def: HotspotDef, layer: Phaser.GameObjects.Layer): Marker {
    let shape: Phaser.GameObjects.Shape | null = null;
    if (def.kind === 'section') {
      shape = this.add
        .rectangle(def.x, def.y, 14, 14, 0xf2c14e)
        .setStrokeStyle(2, 0x000000)
        .setAngle(45);
    } else if (def.kind === 'npc' || def.kind === 'shop' || def.kind === 'board') {
      shape = this.add.circle(def.x, def.y, 10, colorOf(def)).setStrokeStyle(2, 0x000000);
    }
    const locked = (def.requiresWins ?? 0) > this.winCount;
    const text = def.kind === 'spawn' ? '' : locked ? `${def.label} (locked)` : def.label;
    const label = addText(this, def.x, def.y - LABEL_LIFT, text, {
      fontSize: '15px',
      fontStyle: 'bold',
      color: def.kind === 'landmark' ? '#e8e8e8' : '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5, 1);
    if (shape) layer.add(shape);
    layer.add(label);
    return { def, shape, label };
  }

  private syncMarkers(): void {
    for (const m of this.markers) {
      m.shape?.setPosition(m.def.x, m.def.y);
      m.label.setPosition(m.def.x, m.def.y - LABEL_LIFT);
    }
  }

  private placePlayer(): void {
    const { x, y } = this.host.player;
    const px = roundToDevicePixel(x, RENDER_SCALE);
    const py = roundToDevicePixel(y, RENDER_SCALE);
    this.playerShadow.setPosition(px, py + 3);
    this.playerBody.setPosition(px, py - 8);
  }

  private applyView(): void {
    const { view, zoom } = this.host;
    const z = RENDER_SCALE * zoom;
    setView(this.cameras.main, roundToDevicePixel(view.x, z), roundToDevicePixel(view.y, z), zoom);
  }

  private updatePrompt(): void {
    const h = this.tracker.active;
    if (!h || h.action === undefined) {
      if (this.lastPromptKey !== '') {
        this.lastPromptKey = '';
        this.ctxButton.setVisible(false);
        this.ctxHint.setVisible(false);
      }
      return;
    }
    const status = this.tracker.status;
    const key = `${h.id}:${status}`;
    if (key === this.lastPromptKey) return;
    this.lastPromptKey = key;
    const ready = status === 'ready';
    const keyHint = this.sys.game.device.input.touch ? '' : '  [E]';
    this.ctxButton.setLabel(
      status === 'locked'
        ? 'Locked'
        : status === 'conquered'
          ? 'Conquered'
          : `${h.action}${keyHint}`,
    );
    this.ctxButton.setEnabled(ready);
    this.ctxButton.setVisible(true);
    const hint = status === 'locked' ? (h.lockedHint ?? '') : '';
    this.ctxHint.setText(hint).setVisible(hint !== '');
  }

  private onInteract(h: HotspotDef): void {
    this.actionCount += 1;
    this.lastAction = h.id;
    this.showToast(`${h.action ?? ''}: ${h.label} (coming in a later phase)`);
  }

  private showToast(text: string): void {
    this.toast.setText(text).setVisible(true);
    this.toastTimer?.remove();
    this.toastTimer = this.time.delayedCall(1800, () => {
      this.toast.setVisible(false);
    });
  }

  private writeHooks(): void {
    const d = document.documentElement.dataset;
    d['playerX'] = String(Math.round(this.host.player.x));
    d['playerY'] = String(Math.round(this.host.player.y));
    d['prompt'] = this.lastPromptKey;
    d['actionCount'] = String(this.actionCount);
    d['lastAction'] = this.lastAction;
  }
}

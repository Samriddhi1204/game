import Phaser from 'phaser';
import type { InputState } from '../../core/types';
import { GAME_WIDTH, RENDER_SCALE } from '../config';
import type { HoldAction, TouchButton } from '../ui/TouchButton';
import { Joystick } from './Joystick';

export function createInputState(): InputState {
  return {
    moveX: 0,
    moveY: 0,
    attack: false,
    heavy: false,
    block: false,
    dodge: false,
    special: false,
    interact: false,
    pause: false,
  };
}

const STICK_ZONE_X = GAME_WIDTH * 0.5;

type Key = Phaser.Input.Keyboard.Key;

/**
 * The only thing gameplay reads. Keyboard and touch write into `state`; nothing else looks at keys
 * or pointers (spec section 5).
 */
export class InputManager {
  readonly state: InputState = createInputState();
  /** True for exactly one update after interact goes down. */
  interactPressed = false;
  enabled = true;

  private readonly stick: Joystick;
  private readonly keys: Record<string, Key | undefined> = {};
  private touchInteract = false;
  private prevInteract = false;
  private readonly held: Record<HoldAction, boolean> = {
    attack: false,
    dodge: false,
    special: false,
  };
  private readonly pulse: Record<HoldAction, boolean> = {
    attack: false,
    dodge: false,
    special: false,
  };
  private readonly pointerHold = new Map<number, HoldAction>();

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly buttons: readonly TouchButton[],
    private readonly interactButton: TouchButton | null = null,
  ) {
    this.stick = new Joystick(scene, layer, scene.sys.game.device.input.touch);
    const kb = scene.input.keyboard;
    if (kb) {
      const add = (name: string, code: string): void => {
        this.keys[name] = kb.addKey(code, true);
      };
      add('w', 'W');
      add('a', 'A');
      add('s', 'S');
      add('d', 'D');
      add('up', 'UP');
      add('down', 'DOWN');
      add('left', 'LEFT');
      add('right', 'RIGHT');
      add('attack', 'J');
      add('heavy', 'K');
      add('block', 'L');
      add('dodge', 'SPACE');
      add('special', 'I');
      add('interactE', 'E');
      add('interactEnter', 'ENTER');
      add('pause', 'ESC');
    }
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp);
    scene.game.events.on(Phaser.Core.Events.BLUR, this.releaseAll);
    scene.game.events.on(Phaser.Core.Events.HIDDEN, this.releaseAll);
    scene.game.events.on(Phaser.Core.Events.PAUSE, this.releaseAll);
  }

  /** Call once at the start of each frame (later: each fixed sim step). */
  update(): void {
    const s = this.state;
    if (!this.enabled) {
      s.moveX = 0;
      s.moveY = 0;
      s.interact = false;
      s.pause = this.keys['pause']?.isDown === true;
      this.interactPressed = false;
      this.prevInteract = false;
      this.touchInteract = false;
      return;
    }
    const down = (name: string): boolean => this.keys[name]?.isDown === true;
    let mx = (down('d') || down('right') ? 1 : 0) - (down('a') || down('left') ? 1 : 0);
    let my = (down('s') || down('down') ? 1 : 0) - (down('w') || down('up') ? 1 : 0);
    mx += this.stick.moveX;
    my += this.stick.moveY;
    s.moveX = Math.max(-1, Math.min(1, mx));
    s.moveY = Math.max(-1, Math.min(1, my));
    s.attack = down('attack') || this.held.attack || this.pulse.attack;
    s.heavy = down('heavy');
    s.block = down('block');
    s.dodge = down('dodge') || this.held.dodge || this.pulse.dodge;
    s.special = down('special') || this.held.special || this.pulse.special;
    // A tap shorter than a frame still counts as one frame of "down".
    this.pulse.attack = false;
    this.pulse.dodge = false;
    this.pulse.special = false;
    s.pause = down('pause');
    s.interact = down('interactE') || down('interactEnter') || this.touchInteract;
    this.touchInteract = false;
    this.interactPressed = s.interact && !this.prevInteract;
    this.prevInteract = s.interact;
  }

  destroy(): void {
    const input = this.scene.input;
    input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown);
    input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove);
    input.off(Phaser.Input.Events.POINTER_UP, this.onUp);
    input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp);
    const events = this.scene.game.events;
    events.off(Phaser.Core.Events.BLUR, this.releaseAll);
    events.off(Phaser.Core.Events.HIDDEN, this.releaseAll);
    events.off(Phaser.Core.Events.PAUSE, this.releaseAll);
    const kb = input.keyboard;
    if (kb) {
      for (const key of Object.values(this.keys)) {
        if (key) kb.removeKey(key, true);
      }
    }
    this.stick.destroy();
  }

  private readonly onDown = (p: Phaser.Input.Pointer): void => {
    if (!this.enabled) return;
    const lx = p.x / RENDER_SCALE;
    const ly = p.y / RENDER_SCALE;
    for (let i = 0; i < this.buttons.length; i++) {
      const b = this.buttons[i];
      if (b?.contains(lx, ly)) {
        if (b.hold) {
          if (b.enabled) {
            this.held[b.hold] = true;
            this.pulse[b.hold] = true;
            this.pointerHold.set(p.id, b.hold);
            b.setPressed?.(true);
          }
        } else if (b === this.interactButton) {
          if (b.enabled) this.touchInteract = true;
        } else {
          b.press();
        }
        return;
      }
    }
    if (p.wasTouch && lx < STICK_ZONE_X && !this.stick.active) this.stick.start(p.id, lx, ly);
  };

  private readonly onMove = (p: Phaser.Input.Pointer): void => {
    if (p.id === this.stick.pointerId) this.stick.move(p.x / RENDER_SCALE, p.y / RENDER_SCALE);
  };

  private readonly onUp = (p: Phaser.Input.Pointer): void => {
    if (p.id === this.stick.pointerId) this.stick.end();
    this.release(p.id);
  };

  private release(pointerId: number): void {
    const action = this.pointerHold.get(pointerId);
    if (action === undefined) return;
    this.pointerHold.delete(pointerId);
    this.held[action] = false;
    for (const b of this.buttons) if (b.hold === action) b.setPressed?.(false);
  }

  readonly releaseAll = (): void => {
    this.stick.end();
    this.touchInteract = false;
    for (const id of [...this.pointerHold.keys()]) this.release(id);
  };
}

import type Phaser from 'phaser';
import { GAME_HEIGHT } from '../config';

const RADIUS = 64;
const DEAD_ZONE = 0.12;
const REST_X = 120;
const REST_Y = GAME_HEIGHT - 120;

/** Floating joystick: appears wherever the thumb lands in the left half of the screen. */
export class Joystick {
  pointerId = -1;
  moveX = 0;
  moveY = 0;

  private baseX = REST_X;
  private baseY = REST_Y;
  private readonly rest: Phaser.GameObjects.Arc;
  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly showRestHint: boolean,
  ) {
    this.rest = scene.add
      .circle(REST_X, REST_Y, RADIUS)
      .setStrokeStyle(3, 0xffffff, 0.25)
      .setVisible(showRestHint);
    this.base = scene.add
      .circle(REST_X, REST_Y, RADIUS, 0xffffff, 0.1)
      .setStrokeStyle(3, 0xffffff, 0.55)
      .setVisible(false);
    this.knob = scene.add.circle(REST_X, REST_Y, 28, 0xffffff, 0.4).setVisible(false);
    layer.add([this.rest, this.base, this.knob]);
  }

  get active(): boolean {
    return this.pointerId >= 0;
  }

  start(pointerId: number, x: number, y: number): void {
    this.pointerId = pointerId;
    this.baseX = x;
    this.baseY = y;
    this.base.setPosition(x, y).setVisible(true);
    this.knob.setPosition(x, y).setVisible(true);
    this.rest.setVisible(false);
    this.move(x, y);
  }

  move(x: number, y: number): void {
    const dx = x - this.baseX;
    const dy = y - this.baseY;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      this.moveX = 0;
      this.moveY = 0;
      this.knob.setPosition(this.baseX, this.baseY);
      return;
    }
    const clamped = Math.min(len, RADIUS);
    const mag = Math.min(Math.max((clamped / RADIUS - DEAD_ZONE) / (1 - DEAD_ZONE), 0), 1);
    this.moveX = (dx / len) * mag;
    this.moveY = (dy / len) * mag;
    this.knob.setPosition(this.baseX + (dx / len) * clamped, this.baseY + (dy / len) * clamped);
  }

  end(): void {
    this.pointerId = -1;
    this.moveX = 0;
    this.moveY = 0;
    this.base.setVisible(false);
    this.knob.setVisible(false);
    this.rest.setVisible(this.showRestHint);
  }

  destroy(): void {
    this.rest.destroy();
    this.base.destroy();
    this.knob.destroy();
  }
}

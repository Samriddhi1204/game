import Phaser from 'phaser';
import type { HoldAction, TouchButton } from './TouchButton';

export type IconKind = 'fist' | 'dash' | 'star' | 'pause';

const ICON_COLOR = 0x1a1a1a;

/** Draw an icon centred on (0,0), about 40 units across. Icons, not words (spec section 5). */
export function drawIcon(g: Phaser.GameObjects.Graphics, icon: IconKind, color = ICON_COLOR): void {
  g.fillStyle(color, 1);
  g.lineStyle(3, color, 1);
  switch (icon) {
    case 'fist':
      g.fillRoundedRect(-17, -4, 34, 24, 7);
      for (let i = 0; i < 4; i++) g.fillCircle(-12 + i * 8, -8, 6);
      g.fillRoundedRect(-24, 2, 12, 10, 4);
      break;
    case 'dash':
      g.fillTriangle(22, 0, 4, -16, 4, 16);
      g.fillRect(-10, -5, 16, 10);
      g.lineBetween(-24, -10, -14, -10);
      g.lineBetween(-28, 0, -14, 0);
      g.lineBetween(-24, 10, -14, 10);
      break;
    case 'star': {
      const pts: Phaser.Geom.Point[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 22 : 9;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(new Phaser.Geom.Point(Math.cos(a) * r, Math.sin(a) * r));
      }
      g.fillPoints(pts, true);
      break;
    }
    case 'pause':
      g.fillRoundedRect(-12, -14, 9, 28, 3);
      g.fillRoundedRect(3, -14, 9, 28, 3);
      break;
  }
}

/** A round touch button with a drawn icon. At least 80 px across at 960x540 for the main actions. */
export class ActionButton implements TouchButton {
  readonly container: Phaser.GameObjects.Container;
  enabled = true;
  private readonly bg: Phaser.GameObjects.Graphics;
  private pressed = false;

  constructor(
    scene: Phaser.Scene,
    private readonly cx: number,
    private readonly cy: number,
    private readonly radius: number,
    private readonly icon: IconKind,
    readonly hold?: HoldAction,
    private readonly onPress?: () => void,
  ) {
    this.bg = scene.add.graphics();
    this.container = scene.add.container(cx, cy, [this.bg]);
    this.draw();
  }

  contains(lx: number, ly: number): boolean {
    if (!this.container.visible) return false;
    const r = this.radius + 10; // a forgiving margin: thumbs are not precise
    return (lx - this.cx) ** 2 + (ly - this.cy) ** 2 <= r * r;
  }

  press(): void {
    this.onPress?.();
  }

  setPressed(pressed: boolean): void {
    if (this.pressed === pressed) return;
    this.pressed = pressed;
    this.container.setScale(pressed ? 0.92 : 1);
    this.draw();
  }

  setVisible(visible: boolean): void {
    if (this.container.visible !== visible) {
      this.container.setVisible(visible);
      if (!visible) this.setPressed(false);
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.draw();
  }

  private draw(): void {
    const g = this.bg;
    g.clear();
    const base = this.enabled ? 0xf2c14e : 0x6b7684;
    g.fillStyle(base, this.pressed ? 1 : 0.88);
    g.fillCircle(0, 0, this.radius);
    g.lineStyle(4, 0x000000, 0.5);
    g.strokeCircle(0, 0, this.radius);
    if (this.pressed) {
      g.lineStyle(4, 0xffffff, 0.9);
      g.strokeCircle(0, 0, this.radius - 4);
    }
    drawIcon(g, this.icon, this.enabled ? ICON_COLOR : 0xd6dbe1);
  }
}

import type Phaser from 'phaser';
import type { ActionSet, CombatConfig } from '../../core/sim/config';
import type { Fighter } from '../../core/sim/fighter';
import type { AttackKind } from '../../core/sim/types';
import { addText } from '../gfx';

const BODY_H = 80;

/**
 * A fighter drawn from coloured shapes (placeholder art; real sprites later). All of it is created
 * once; `update` only moves and recolours it, so nothing is allocated while fighting.
 */
export class FighterView {
  private readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Rectangle;
  private readonly head: Phaser.GameObjects.Arc;
  private readonly arm: Phaser.GameObjects.Rectangle;
  private readonly shield: Phaser.GameObjects.Rectangle;
  private readonly mark: Phaser.GameObjects.Text;
  private flashLeft = 0;
  private flashColor = 0xffffff;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly baseColor: number,
    private readonly floorY: number,
  ) {
    const shadow = scene.add.ellipse(0, 3, 64, 14, 0x000000, 0.3);
    this.body = scene.add
      .rectangle(0, 0, 44, BODY_H, baseColor)
      .setOrigin(0.5, 1)
      .setStrokeStyle(3, 0x000000);
    this.head = scene.add.circle(0, -BODY_H - 18, 20, baseColor).setStrokeStyle(3, 0x000000);
    // A small "eye" on the facing side so you can see which way they look.
    const eye = scene.add.circle(10, -BODY_H - 20, 4, 0x000000);
    this.arm = scene.add
      .rectangle(16, -66, 16, 18, baseColor)
      .setOrigin(0, 0.5)
      .setStrokeStyle(3, 0x000000);
    this.shield = scene.add
      .rectangle(34, 0, 10, 76, 0x4fc3f7, 0.85)
      .setOrigin(0.5, 1)
      .setStrokeStyle(2, 0xffffff)
      .setVisible(false);
    this.root = scene.add.container(0, floorY, [
      shadow,
      this.body,
      this.head,
      eye,
      this.arm,
      this.shield,
    ]);
    this.mark = addText(scene, 0, 0, '', {
      fontSize: '34px',
      fontStyle: 'bold',
      color: '#ffeb3b',
      stroke: '#000000',
      strokeThickness: 5,
    })
      .setOrigin(0.5, 1)
      .setVisible(false);
    layer.add([this.root, this.mark]);
  }

  /** Flash white (hit) or cyan (blocked) for a few frames. */
  flash(frames: number, color: number): void {
    this.flashLeft = frames;
    this.flashColor = color;
  }

  /** `telegraph` shows a "!" while an enemy attack is winding up. */
  update(
    f: Fighter,
    actions: ActionSet,
    cfg: CombatConfig,
    alpha: number,
    telegraph: boolean,
  ): void {
    const x = f.prevX + (f.x - f.prevX) * alpha;
    this.root.setPosition(Math.round(x * 2) / 2, this.floorY);
    this.root.scaleX = f.facing;

    let tint = this.baseColor;
    if (this.flashLeft > 0) {
      this.flashLeft--;
      tint = this.flashColor;
    } else if (f.state === 'hurt') tint = 0xff8a80;
    else if (f.state === 'blockstun') tint = 0x90caf9;
    else if (f.state === 'stunned') tint = 0xfff59d;
    this.body.setFillStyle(tint);
    this.head.setFillStyle(tint);
    this.arm.setFillStyle(tint);

    // Pose.
    const down = f.state === 'knockdown' || f.state === 'ko';
    this.root.setAngle(down ? -90 * f.facing : 0);
    this.root.setAlpha(
      f.state === 'dodge' && f.frame >= cfg.dodge.invulnFrom && f.frame <= cfg.dodge.invulnTo
        ? 0.4
        : 1,
    );
    this.shield.setVisible(f.state === 'block' && !f.releasing && f.frame > cfg.block.startup);

    const attacking = f.state === 'punch' || f.state === 'heavy' || f.state === 'special';
    if (attacking) {
      const def = actions[f.state as AttackKind];
      const hb = def.hitbox;
      const reach = hb.x + hb.w - 16;
      const active = f.frame > def.startup && f.frame <= def.startup + def.active;
      const len = active
        ? reach
        : f.frame <= def.startup
          ? 12 + (reach * 0.35 * f.frame) / def.startup
          : reach * 0.4;
      this.arm.width = Math.max(10, len);
      this.arm.height = Math.max(14, hb.h * 0.55);
      this.arm.y = hb.y + hb.h / 2 + 8;
    } else {
      this.arm.width = 16;
      this.arm.height = 18;
      this.arm.y = -66;
    }

    // Marks above the head.
    const winding = telegraph && attacking && f.frame <= actions[f.state as AttackKind].startup;
    const stunned = f.state === 'stunned';
    if (winding || stunned) {
      this.mark.setText(winding ? '!' : '★');
      this.mark.setPosition(Math.round(x), this.floorY - BODY_H - 44);
      this.mark.setVisible(true);
    } else if (this.mark.visible) {
      this.mark.setVisible(false);
    }
  }
}

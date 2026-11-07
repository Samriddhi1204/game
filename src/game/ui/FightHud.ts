import type Phaser from 'phaser';
import type { Fighter } from '../../core/sim/fighter';
import { STATUS_KINDS } from '../../core/sim/types';
import { addText } from '../gfx';

const BAR_W = 280;
const LETTERS = ['S', 'D', '!', 'L', 'M', 'B', 'E'];
const COLORS = [0x4fc3f7, 0xba68c8, 0xffee58, 0xff8a65, 0xf06292, 0x90a4ae, 0xff5252];

interface StatusIcon {
  bg: Phaser.GameObjects.Rectangle;
  letter: Phaser.GameObjects.Text;
}

class Side {
  readonly hp: Phaser.GameObjects.Rectangle;
  readonly stamina: Phaser.GameObjects.Rectangle | null;
  readonly meter: Phaser.GameObjects.Rectangle | null;
  readonly cgpa: Phaser.GameObjects.Text;
  private readonly icons: StatusIcon[] = [];
  private lastCgpa = '';

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly x: number,
    private readonly rightAligned: boolean,
    name: string,
    withResources: boolean,
  ) {
    const left = rightAligned ? x - BAR_W : x;
    const origin = rightAligned ? 1 : 0;
    const anchor = rightAligned ? x : x;
    const bg = (y: number, w: number, h: number): Phaser.GameObjects.Rectangle =>
      scene.add.rectangle(left, y, w, h, 0x000000, 0.55).setOrigin(0, 0);
    const fill = (y: number, w: number, h: number, color: number): Phaser.GameObjects.Rectangle =>
      scene.add.rectangle(anchor, y, w, h, color).setOrigin(origin, 0);
    const objs: Phaser.GameObjects.GameObject[] = [];
    objs.push(bg(46, BAR_W, 16));
    this.hp = fill(46, BAR_W, 16, 0xe53935);
    objs.push(this.hp);
    this.cgpa = addText(scene, anchor, 14, '', {
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(origin, 0);
    const nameText = addText(scene, rightAligned ? left : left + BAR_W, 18, name, {
      fontSize: '16px',
      color: '#cfd8dc',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(rightAligned ? 0 : 1, 0);
    objs.push(this.cgpa, nameText);
    if (withResources) {
      objs.push(bg(66, 200, 8), bg(78, 200, 8));
      this.stamina = fill(66, 200, 8, 0x66bb6a);
      this.meter = fill(78, 200, 8, 0xffca28);
      objs.push(this.stamina, this.meter);
    } else {
      this.stamina = null;
      this.meter = null;
    }
    layer.add(objs);
    for (let i = 0; i < STATUS_KINDS.length; i++) {
      const ibg = scene.add
        .rectangle(0, 0, 26, 26, COLORS[i] ?? 0xffffff)
        .setStrokeStyle(2, 0x000000)
        .setVisible(false);
      const letter = addText(scene, 0, 0, LETTERS[i] ?? '?', {
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#111111',
      })
        .setOrigin(0.5)
        .setVisible(false);
      layer.add([ibg, letter]);
      this.icons.push({ bg: ibg, letter });
    }
  }

  update(f: Fighter, maxStamina: number, maxMeter: number): void {
    this.hp.scaleX = Math.max(0, f.hp / f.maxHp);
    const cgpa = `CGPA ${(f.hp / 10).toFixed(1)}`;
    if (cgpa !== this.lastCgpa) {
      this.lastCgpa = cgpa;
      this.cgpa.setText(cgpa);
    }
    if (this.stamina) this.stamina.scaleX = Math.max(0, f.stamina / maxStamina);
    if (this.meter) {
      this.meter.scaleX = Math.max(0, Math.min(1, f.meter / maxMeter));
      this.meter.setFillStyle(f.meter >= maxMeter ? 0xfff176 : 0xffca28);
    }
    let slot = 0;
    const y = this.stamina ? 100 : 72;
    for (let k = 0; k < STATUS_KINDS.length; k++) {
      const icon = this.icons[k];
      if (!icon) continue;
      const on = (f.statusFrames[k] ?? 0) > 0;
      icon.bg.setVisible(on);
      icon.letter.setVisible(on);
      if (!on) continue;
      const ix = this.rightAligned ? this.x - 13 - slot * 30 : this.x + 13 + slot * 30;
      icon.bg.setPosition(ix, y + 13);
      icon.letter.setPosition(ix, y + 13);
      // Blink in the last second so the player knows it is about to end.
      icon.bg.setAlpha(
        (f.statusFrames[k] ?? 0) < 60 && Math.floor((f.statusFrames[k] ?? 0) / 6) % 2 === 0
          ? 0.45
          : 1,
      );
      slot++;
    }
  }
}

/** CGPA bars, stamina, special meter and status icons for both fighters. */
export class FightHud {
  private readonly player: Side;
  private readonly enemy: Side;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, enemyName: string) {
    this.player = new Side(scene, layer, 24, false, 'You', true);
    this.enemy = new Side(scene, layer, 836, true, enemyName, false);
  }

  update(p: Fighter, e: Fighter, maxStamina: number, maxMeter: number): void {
    this.player.update(p, maxStamina, maxMeter);
    this.enemy.update(e, maxStamina, maxMeter);
  }
}

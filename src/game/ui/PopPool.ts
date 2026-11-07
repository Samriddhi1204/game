import type Phaser from 'phaser';
import { addText } from '../gfx';

interface Pop {
  text: Phaser.GameObjects.Text;
  age: number;
  life: number;
  x: number;
  y: number;
  rise: number;
}

/** Floating damage / callout text from a fixed pool (no allocation while fighting). */
export class PopPool {
  private readonly pops: Pop[] = [];
  private next = 0;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, size = 12) {
    for (let i = 0; i < size; i++) {
      const text = addText(scene, 0, 0, '', {
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 5,
      })
        .setOrigin(0.5)
        .setVisible(false);
      layer.add(text);
      this.pops.push({ text, age: 0, life: 1, x: 0, y: 0, rise: 40 });
    }
  }

  spawn(
    x: number,
    y: number,
    label: string,
    color: string,
    fontPx = 24,
    life = 750,
    rise = 40,
  ): void {
    const pop = this.pops[this.next];
    this.next = (this.next + 1) % this.pops.length;
    if (!pop) return;
    pop.age = 0;
    pop.life = life;
    pop.x = x;
    pop.y = y;
    pop.rise = rise;
    pop.text.setText(label).setColor(color).setFontSize(fontPx).setVisible(true).setAlpha(1);
    pop.text.setPosition(x, y);
  }

  update(deltaMs: number): void {
    for (const pop of this.pops) {
      if (!pop.text.visible) continue;
      pop.age += deltaMs;
      const t = pop.age / pop.life;
      if (t >= 1) {
        pop.text.setVisible(false);
        continue;
      }
      pop.text.setPosition(pop.x, pop.y - pop.rise * t);
      pop.text.setAlpha(t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4);
    }
  }
}

import type Phaser from 'phaser';
import { addText } from '../gfx';

/**
 * A button drawn with Phaser but hit-tested by us in logical coordinates, so the input layer can
 * decide which finger belongs to a button and which to the joystick.
 */
export class HitButton {
  readonly container: Phaser.GameObjects.Container;
  enabled = true;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly w: number,
    private readonly h: number,
    label: string,
    private readonly onPress: () => void,
    fontSize = 30,
  ) {
    this.bg = scene.add.graphics();
    this.text = addText(scene, w / 2, h / 2, label, {
      fontSize: `${fontSize}px`,
      fontStyle: 'bold',
      color: '#1a1a1a',
    }).setOrigin(0.5);
    this.container = scene.add.container(x, y, [this.bg, this.text]);
    this.draw();
  }

  contains(lx: number, ly: number): boolean {
    return (
      this.container.visible &&
      lx >= this.x &&
      lx <= this.x + this.w &&
      ly >= this.y &&
      ly <= this.y + this.h
    );
  }

  press(): void {
    if (this.enabled) this.onPress();
  }

  setLabel(label: string): void {
    if (this.text.text !== label) this.text.setText(label);
  }

  setVisible(visible: boolean): void {
    if (this.container.visible !== visible) this.container.setVisible(visible);
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.draw();
  }

  private draw(): void {
    this.bg.clear();
    this.bg.fillStyle(this.enabled ? 0xf2c14e : 0x6b7684, this.enabled ? 0.92 : 0.8);
    this.bg.fillRoundedRect(0, 0, this.w, this.h, 18);
    this.bg.lineStyle(3, 0x000000, 0.5);
    this.bg.strokeRoundedRect(0, 0, this.w, this.h, 18);
    this.text.setColor(this.enabled ? '#1a1a1a' : '#d6dbe1');
  }
}

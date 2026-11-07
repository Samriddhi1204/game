import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { addText } from '../gfx';

export interface PauseMenuActions {
  resume: () => void;
  toMap: () => void;
}

/** The pause overlay (spec section 14): title "Lite lo", "Bas ho gaya" resumes. */
export class PauseMenu {
  private readonly items: (Phaser.GameObjects.GameObject & { setVisible(v: boolean): unknown })[] =
    [];
  private visible = false;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, actions: PauseMenuActions) {
    const cx = GAME_WIDTH / 2;
    const dim = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7).setOrigin(0, 0);
    dim.setInteractive(); // swallow taps so nothing behind the menu is hit
    const title = addText(scene, cx, 110, 'Lite lo', {
      fontSize: '64px',
      fontStyle: 'bold',
      color: '#f2c14e',
    }).setOrigin(0.5);
    const button = (y: number, label: string, onPress: () => void): Phaser.GameObjects.Text =>
      addText(scene, cx, y, `  ${label}  `, {
        fontSize: '32px',
        fontStyle: 'bold',
        color: '#1a1a1a',
        backgroundColor: '#f2c14e',
        padding: { x: 28, y: 14 },
      })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', onPress);
    const resume = button(220, 'Bas ho gaya', actions.resume);
    this.items.push(dim, title, resume);
    if (scene.scale.fullscreen.available) {
      this.items.push(
        button(310, 'Fullscreen', () => {
          scene.scale.toggleFullscreen();
        }),
      );
    }
    this.items.push(button(400, 'Map pe wapas', actions.toMap));
    layer.add(this.items);
    this.show(false);
  }

  get isOpen(): boolean {
    return this.visible;
  }

  show(on: boolean): void {
    this.visible = on;
    for (const item of this.items) item.setVisible(on);
  }
}

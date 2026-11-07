import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { clearSave, setSceneLabel } from '../dom';
import { addText, setView } from '../gfx';

export interface ErrorSceneData {
  /** Shown to the player. Only pass messages that are safe and useful to read. */
  message?: string;
}

export class ErrorScene extends Phaser.Scene {
  private message = 'Details are in the console.';

  constructor() {
    super('Error');
  }

  init(data: ErrorSceneData): void {
    this.message = data.message ?? 'Details are in the console.';
  }

  create(): void {
    setSceneLabel('Error');
    setView(this.cameras.main, 0, 0);
    const cx = GAME_WIDTH / 2;
    addText(this, cx, GAME_HEIGHT / 2 - 110, 'Kuch gadbad ho gayi.', {
      fontSize: '40px',
      color: '#f2f2f2',
    }).setOrigin(0.5);
    addText(this, cx, GAME_HEIGHT / 2 - 60, this.message, {
      fontSize: '20px',
      color: '#9aa7b5',
      align: 'center',
      wordWrap: { width: 760 },
    }).setOrigin(0.5);

    const reload = this.button(cx, GAME_HEIGHT / 2 + 20, 'Reload', '#f2c14e', '#1a1a1a');
    reload.on('pointerdown', () => {
      location.reload();
    });

    // Two-tap confirm in the canvas instead of window.confirm.
    const reset = this.button(cx, GAME_HEIGHT / 2 + 100, 'Reset progress', '#3a4655', '#f2f2f2');
    let armed = false;
    reset.on('pointerdown', () => {
      if (!armed) {
        armed = true;
        reset.setText('  Pakka? Tap again  ');
        this.time.delayedCall(4000, () => {
          armed = false;
          reset.setText('  Reset progress  ');
        });
        return;
      }
      clearSave();
      location.reload();
    });
  }

  private button(
    x: number,
    y: number,
    label: string,
    bg: string,
    fg: string,
  ): Phaser.GameObjects.Text {
    return addText(this, x, y, `  ${label}  `, {
      fontSize: '28px',
      color: fg,
      backgroundColor: bg,
      padding: { x: 20, y: 12 },
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
  }
}

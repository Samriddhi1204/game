import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { clearSave, setSceneLabel } from '../dom';

export class ErrorScene extends Phaser.Scene {
  constructor() {
    super('Error');
  }

  create(): void {
    setSceneLabel('Error');
    const cx = GAME_WIDTH / 2;
    this.add
      .text(cx, GAME_HEIGHT / 2 - 110, 'Kuch gadbad ho gayi.', {
        fontFamily: FONT,
        fontSize: '40px',
        color: '#f2f2f2',
      })
      .setOrigin(0.5);
    this.add
      .text(cx, GAME_HEIGHT / 2 - 60, 'Details are in the console.', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#9aa7b5',
      })
      .setOrigin(0.5);

    const reload = this.button(cx, GAME_HEIGHT / 2 + 10, 'Reload', '#f2c14e', '#1a1a1a');
    reload.on('pointerdown', () => {
      location.reload();
    });

    // Two-tap confirm in the canvas instead of window.confirm.
    const reset = this.button(cx, GAME_HEIGHT / 2 + 90, 'Reset progress', '#3a4655', '#f2f2f2');
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
    return this.add
      .text(x, y, `  ${label}  `, {
        fontFamily: FONT,
        fontSize: '28px',
        color: fg,
        backgroundColor: bg,
        padding: { x: 20, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
  }
}

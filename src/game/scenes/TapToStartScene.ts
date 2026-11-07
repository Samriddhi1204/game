import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { setSceneLabel } from '../dom';

export class TapToStartScene extends Phaser.Scene {
  private started = false;

  constructor() {
    super('TapToStart');
  }

  create(): void {
    setSceneLabel('TapToStart');
    this.started = false;
    const cx = GAME_WIDTH / 2;
    this.add
      .text(cx, GAME_HEIGHT / 2 - 40, 'MNNIT Conquest', {
        fontFamily: FONT,
        fontSize: '56px',
        fontStyle: 'bold',
        color: '#f2c14e',
      })
      .setOrigin(0.5);
    const prompt = this.add
      .text(cx, GAME_HEIGHT / 2 + 50, 'Tap to start', {
        fontFamily: FONT,
        fontSize: '28px',
        color: '#f2f2f2',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => {
      this.start();
    });
    this.input.keyboard?.once(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, () => {
      this.start();
    });
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.unlockAudio();
    this.scene.start('Map');
  }

  /** Resume the WebAudio context from a user gesture. A failure must never block the game. */
  private unlockAudio(): void {
    try {
      const sound = this.sound;
      if (sound instanceof Phaser.Sound.WebAudioSoundManager) {
        sound.context.resume().catch((err: unknown) => {
          console.warn('Audio unlock failed', err);
        });
      }
    } catch (err) {
      console.warn('Audio unlock failed', err);
    }
  }
}

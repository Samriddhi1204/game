import Phaser from 'phaser';
import mapUrl from '../../../assets/map.webp?url';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { setSceneLabel } from '../dom';

export const MAP_TEXTURE = 'map';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    setSceneLabel('Preload');
    delete document.documentElement.dataset['loadError'];

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const barW = 400;
    this.add
      .text(cx, cy - 40, 'Loading…', { fontFamily: FONT, fontSize: '28px', color: '#f2f2f2' })
      .setOrigin(0.5);
    this.add.rectangle(cx, cy, barW, 16, 0x3a4655);
    const fill = this.add.rectangle(cx - barW / 2, cy, barW, 16, 0xf2c14e).setOrigin(0, 0.5);
    fill.scaleX = 0;

    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      fill.scaleX = value;
    });
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {
      this.showRetry();
    });
    this.load.image(MAP_TEXTURE, mapUrl);
  }

  create(): void {
    this.scene.start('TapToStart');
  }

  private showRetry(): void {
    document.documentElement.dataset['loadError'] = 'true';
    // The loader keeps going and then calls create(); stop that so we stay on this screen.
    this.load.removeAllListeners();
    this.load.reset();

    const cx = GAME_WIDTH / 2;
    this.add
      .text(cx, GAME_HEIGHT / 2 + 50, 'Load nahi hua. Network check karo.', {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#ff8a80',
      })
      .setOrigin(0.5);
    const retry = this.add
      .text(cx, GAME_HEIGHT / 2 + 110, '  Retry  ', {
        fontFamily: FONT,
        fontSize: '28px',
        color: '#1a1a1a',
        backgroundColor: '#f2c14e',
        padding: { x: 20, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    retry.once('pointerdown', () => {
      this.scene.restart();
    });
  }
}

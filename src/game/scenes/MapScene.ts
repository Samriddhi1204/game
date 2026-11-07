import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { setSceneLabel } from '../dom';
import { MAP_TEXTURE } from './PreloadScene';

/** Phase 0 placeholder: shows the map scaled to fit, nothing interactive yet. */
export class MapScene extends Phaser.Scene {
  constructor() {
    super('Map');
  }

  create(): void {
    setSceneLabel('Map');
    const map = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, MAP_TEXTURE);
    map.setScale(Math.min(GAME_WIDTH / map.width, GAME_HEIGHT / map.height));
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 20, 'Map scene (Phase 0 placeholder)', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5, 1);

    // Only create the button when the Fullscreen API exists (hidden on iPhone Safari).
    if (this.scale.fullscreen.available) {
      const btn = this.add
        .text(GAME_WIDTH - 12, 12, '⛶', {
          fontFamily: FONT,
          fontSize: '36px',
          color: '#ffffff',
          backgroundColor: '#000000aa',
          padding: { x: 14, y: 6 },
        })
        .setOrigin(1, 0)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        this.scale.toggleFullscreen();
      });
    }
  }
}

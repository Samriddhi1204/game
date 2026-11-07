import Phaser from 'phaser';
import { setSceneLabel } from '../dom';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    setSceneLabel('Boot');
    this.scene.start('Preload');
  }
}

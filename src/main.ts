import Phaser from 'phaser';
import { BG_COLOR, GAME_HEIGHT, GAME_WIDTH } from './game/config';
import { installErrorHandlers, watchWebGLContext } from './game/errors';
import { watchOrientation } from './game/portrait';
import { BootScene } from './game/scenes/BootScene';
import { ErrorScene } from './game/scenes/ErrorScene';
import { MapScene } from './game/scenes/MapScene';
import { PreloadScene } from './game/scenes/PreloadScene';
import { TapToStartScene } from './game/scenes/TapToStartScene';

let game: Phaser.Game | null = null;
installErrorHandlers(() => game);

game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: BG_COLOR,
  banner: false,
  disableContextMenu: true,
  input: { activePointers: 3 },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  scene: [BootScene, PreloadScene, TapToStartScene, MapScene, ErrorScene],
});

watchWebGLContext(game);
watchOrientation(game);

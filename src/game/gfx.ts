import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from './config';

/**
 * Point a camera at the logical rectangle whose top-left is (viewX, viewY), at `zoom` times the
 * render scale. Phaser zooms around the camera centre, so the scroll has to be offset to match.
 */
export function setView(
  cam: Phaser.Cameras.Scene2D.Camera,
  viewX: number,
  viewY: number,
  zoom = 1,
) {
  const z = RENDER_SCALE * zoom;
  const w = GAME_WIDTH * RENDER_SCALE;
  const h = GAME_HEIGHT * RENDER_SCALE;
  cam.setZoom(z);
  cam.setScroll(viewX - (w - w / z) / 2, viewY - (h - h / z) / 2);
}

/** Text that is rasterised at the backing-canvas resolution, so it stays sharp. */
export function addText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, { fontFamily: FONT, ...style }).setResolution(RENDER_SCALE);
}

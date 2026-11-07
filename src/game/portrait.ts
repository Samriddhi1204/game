import type Phaser from 'phaser';
import { setPausedLabel } from './dom';

/** Pause the game while the phone is held upright; the CSS overlay covers the screen. */
export function watchOrientation(game: Phaser.Game): void {
  const query = window.matchMedia('(orientation: portrait)');
  const apply = (portrait: boolean): void => {
    if (portrait) game.pause();
    else game.resume();
    setPausedLabel(portrait);
  };
  apply(query.matches);
  query.addEventListener('change', (e) => {
    apply(e.matches);
  });
}

import type Phaser from 'phaser';
import { showFatalPanel } from './dom';
import { UserFacingError } from './userError';

let handling = false;

function isBenign(message: string): boolean {
  return message.startsWith('ResizeObserver loop');
}

/** Route a failure to the Phaser ErrorScene, falling back to the plain-DOM panel. */
function fail(game: Phaser.Game | null, err: unknown): void {
  console.error('Fatal error', err);
  if (handling) return;
  handling = true;
  const alreadyInError = document.documentElement.dataset['scene'] === 'Error';
  if (!game || alreadyInError) {
    showFatalPanel();
    return;
  }
  try {
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.scene.key);
    game.scene.start('Error', err instanceof UserFacingError ? { message: err.message } : {});
    // If the scene can't start (renderer gone), the label won't change.
    window.setTimeout(() => {
      if (document.documentElement.dataset['scene'] !== 'Error') showFatalPanel();
    }, 500);
  } catch (inner) {
    console.error('Could not start ErrorScene', inner);
    showFatalPanel();
  }
}

export function installErrorHandlers(getGame: () => Phaser.Game | null): void {
  window.addEventListener('error', (e) => {
    if (isBenign(e.message)) return;
    fail(getGame(), e.error ?? e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    fail(getGame(), e.reason);
  });
}

/** If the WebGL context is lost and doesn't come back within 3 s, show the DOM panel. */
export function watchWebGLContext(game: Phaser.Game): void {
  const canvas = game.canvas;
  let timer: number | undefined;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.warn('WebGL context lost');
    timer = window.setTimeout(() => {
      console.error('WebGL context not restored');
      showFatalPanel();
    }, 3000);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    window.clearTimeout(timer);
    console.warn('WebGL context restored');
  });
}

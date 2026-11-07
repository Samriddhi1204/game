import { SAVE_BACKUP_KEY, SAVE_KEY } from '../core/save/keys';

export type SceneLabel = 'Boot' | 'Preload' | 'TapToStart' | 'Map' | 'Fight' | 'Error' | 'DomError';

/** Mirror the active scene onto <html> so e2e tests can read it. */
export function setSceneLabel(label: SceneLabel): void {
  document.documentElement.dataset['scene'] = label;
}

export function setPausedLabel(paused: boolean): void {
  document.documentElement.dataset['paused'] = String(paused);
}

/** Remove saved progress. Storage can throw (Safari private mode), so never let it escape. */
export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(SAVE_BACKUP_KEY);
  } catch (err) {
    console.error('Could not clear save', err);
  }
}

let fatalWired = false;

/** Plain-DOM error panel. Works even if Phaser is dead. */
export function showFatalPanel(): void {
  const panel = document.getElementById('fatal');
  const reload = document.getElementById('fatal-reload');
  const reset = document.getElementById('fatal-reset');
  if (!panel || !reload || !reset) return;

  if (!fatalWired) {
    fatalWired = true;
    reload.addEventListener('click', () => {
      location.reload();
    });
    let armed = false;
    reset.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        reset.textContent = 'Pakka? Tap again to reset';
        window.setTimeout(() => {
          armed = false;
          reset.textContent = 'Reset progress';
        }, 4000);
        return;
      }
      clearSave();
      location.reload();
    });
  }
  panel.dataset['open'] = 'true';
  setSceneLabel('DomError');
}

/** Logical (layout) size. All game coordinates are in these units. */
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
export const BG_COLOR = '#0b1118';
export const FONT = 'system-ui, sans-serif';

/** Map camera zoom (spec section 12). The UI camera is never affected by it. */
export const MAP_ZOOM = 1.0;
export const PLAYER_SPEED = 220;
/** Longest frame the simulation will believe, in ms. Stops a stall teleporting the player. */
export const MAX_FRAME_MS = 50;

const params = new URLSearchParams(location.search);
export const DEBUG = params.get('debug') === '1';
/** Writes player/prompt state onto <html> for Playwright. Off in normal play. */
export const TEST_HOOKS = DEBUG || params.has('e2e');

function pickRenderScale(): number {
  const override = params.get('rs');
  if (override === '1' || override === '2') return Number(override);
  const dpr = window.devicePixelRatio || 1;
  // Phones and hi-dpi screens get a 2x backing canvas so text and map edges stay crisp.
  return dpr >= 1.5 || window.innerWidth * dpr >= 1500 ? 2 : 1;
}

/**
 * Backing-canvas scale. The canvas is 960*RENDER_SCALE wide but scenes still lay out in 960x540
 * logical units. Add `?rs=1` to the URL to compare performance on a weak phone.
 */
export const RENDER_SCALE = pickRenderScale();

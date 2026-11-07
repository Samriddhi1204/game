import type { MapSize, Vec2 } from './types';

/** Clamp a view's top-left so the view stays inside the map. Centres it if the map is smaller. */
export function clampView(view: Vec2, viewW: number, viewH: number, map: MapSize): void {
  const maxX = map.width - viewW;
  const maxY = map.height - viewH;
  view.x = maxX <= 0 ? maxX / 2 : Math.min(Math.max(view.x, 0), maxX);
  view.y = maxY <= 0 ? maxY / 2 : Math.min(Math.max(view.y, 0), maxY);
}

/** Jump the view straight onto the target. */
export function snapView(
  view: Vec2,
  target: Vec2,
  viewW: number,
  viewH: number,
  map: MapSize,
): void {
  view.x = target.x - viewW / 2;
  view.y = target.y - viewH / 2;
  clampView(view, viewW, viewH, map);
}

/**
 * Ease the view towards the target. Exponential smoothing is frame-rate independent, so 60 Hz and
 * 120 Hz phones follow identically.
 */
export function followView(
  view: Vec2,
  target: Vec2,
  viewW: number,
  viewH: number,
  map: MapSize,
  dtSeconds: number,
  smoothing = 10,
): void {
  const a = 1 - Math.exp(-smoothing * dtSeconds);
  view.x += (target.x - viewW / 2 - view.x) * a;
  view.y += (target.y - viewH / 2 - view.y) * a;
  clampView(view, viewW, viewH, map);
}

/** Snap to the device-pixel grid so the map never shimmers while scrolling. */
export function roundToDevicePixel(value: number, pixelsPerUnit: number): number {
  return Math.round(value * pixelsPerUnit) / pixelsPerUnit;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface MapSize {
  width: number;
  height: number;
}

/** Axis-aligned rectangle in map pixels. x1,y1 is top-left, x2,y2 is bottom-right. */
export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface NamedRect extends Rect {
  name: string;
}

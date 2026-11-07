/** Small runtime type guards for parsing JSON content. Each throws a message naming the bad path. */

export function rec(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`${path}: expected an object`);
  }
  return v as Record<string, unknown>;
}

export function num(o: Record<string, unknown>, key: string, path: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`${path}.${key}: expected a number`);
  }
  return v;
}

export function str(o: Record<string, unknown>, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') throw new Error(`${path}.${key}: expected a string`);
  return v;
}

export function optStr(o: Record<string, unknown>, key: string, path: string): string | undefined {
  return o[key] === undefined ? undefined : str(o, key, path);
}

export function optNum(o: Record<string, unknown>, key: string, path: string): number | undefined {
  return o[key] === undefined ? undefined : num(o, key, path);
}

export function list(o: Record<string, unknown>, key: string, path: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`${path}.${key}: expected an array`);
  return v as unknown[];
}

export function bool(o: Record<string, unknown>, key: string, path: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new Error(`${path}.${key}: expected true or false`);
  return v;
}

/** A number that must lie in [min, max]. */
export function numIn(
  o: Record<string, unknown>,
  key: string,
  path: string,
  min: number,
  max: number,
): number {
  const v = num(o, key, path);
  if (v < min || v > max) throw new Error(`${path}.${key}: ${v} is outside ${min}..${max}`);
  return v;
}

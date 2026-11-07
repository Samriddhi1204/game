let firstFightHintsTaken = false;

/**
 * True exactly once per page load: the first fight shows the icon hints (spec section 5).
 * Phase 4 moves this into the save file's flags.
 */
export function takeFirstFightHints(): boolean {
  const first = !firstFightHintsTaken;
  firstFightHintsTaken = true;
  return first;
}

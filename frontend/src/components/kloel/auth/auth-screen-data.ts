/**
 * Static grid line and corner mark data for the auth screen's "machine" panel.
 * Pure positional data — no colours.
 */

export const HORIZONTAL_GRID_LINES = Array.from({ length: 12 }, (_, i) => ({
  id: `h-${i + 1}`,
  top: ((i + 1) / 13) * 100,
}));

export const VERTICAL_GRID_LINES = Array.from({ length: 8 }, (_, i) => ({
  id: `v-${i + 1}`,
  left: ((i + 1) / 9) * 100,
}));

/** Character-aware delay for typewriter effects. */
export function typingDelayFor(character: string) {
  if (character === ' ') return 52 + Math.floor(Math.random() * 28);
  if (character === ',') return 220 + Math.floor(Math.random() * 60);
  if (character === '.') return 320 + Math.floor(Math.random() * 110);
  return 64 + Math.floor(Math.random() * 38);
}

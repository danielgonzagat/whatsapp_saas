import { secureRandomFloat } from '@/lib/secure-random';
/**
 * Static grid line and corner mark data for the auth screen's "machine" panel.
 * Pure positional data — no colours.
 */

export const HORIZONTAL_GRID_LINES = Array.from({ length: 12 }, (_, i) => ({
  id: `h-${i + 1}`,
  top: ((i + 1) / 13) * 100,
}));

/** Vertical_grid_lines. */
export const VERTICAL_GRID_LINES = Array.from({ length: 8 }, (_, i) => ({
  id: `v-${i + 1}`,
  left: ((i + 1) / 9) * 100,
}));

/** Character-aware delay for typewriter effects. */
export function typingDelayFor(character: string) {
  if (character === ' ') {
    return 52 + Math.floor(secureRandomFloat() * 28);
  }
  if (character === ',') {
    return 220 + Math.floor(secureRandomFloat() * 60);
  }
  if (character === '.') {
    return 320 + Math.floor(secureRandomFloat() * 110);
  }
  return 64 + Math.floor(secureRandomFloat() * 38);
}

/**
 * Canvas Palette Tokens
 *
 * Typed token catalog for canvas format preset colors not covered by
 * the Monitor design system (`colors.*`) or external brand tokens.
 * These are decorative gradient-pair variants used in format cards,
 * editor tools, and element categories.
 */

export const canvasPalette = {
  amberLight: '#FBBF24',
  amberDeep: '#78350F',

  cyanLight: '#22D3EE',
  cyanMid: '#0891B2',
  cyanDeep: '#164E63',

  emeraldLight: '#34D399',
  emeraldDeep: '#065F46',

  pinkLight: '#F472B6',
  pinkDeep: '#831843',

  violetMid: '#7C3AED',
  violetDeep: '#6D28D9',
  violetIntense: '#4C1D95',

  blueLight: '#60A5FA',
  blueDeep: '#1E3A5F',

  indigo: '#6366F1',
  indigoLight: '#818CF8',

  gray: '#9CA3AF',

  redDark: '#8B0000',

  gradientWarm: '#FF6B6B',
  gradientTeal: '#4ECDC4',
  gradientBlue: '#45B7D1',
} as const;

export default canvasPalette;

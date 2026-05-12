/**
 * Canvas Palette Tokens
 *
 * Typed token catalog for canvas format preset colors not covered by
 * the Monitor design system (`colors.*`) or external brand tokens.
 * These are decorative gradient-pair variants used in format cards,
 * editor tools, and element categories.
 */

export const canvasPalette = {
  amberLight: 'rgb(251, 191, 36)',
  amberDeep: 'rgb(120, 53, 15)',

  cyanLight: 'rgb(34, 211, 238)',
  cyanMid: 'rgb(8, 145, 178)',
  cyanDeep: 'rgb(22, 78, 99)',

  emeraldLight: 'rgb(52, 211, 153)',
  emeraldDeep: 'rgb(6, 95, 70)',

  pinkLight: 'rgb(244, 114, 182)',
  pinkDeep: 'rgb(131, 24, 67)',

  violetMid: 'rgb(124, 58, 237)',
  violetDeep: 'rgb(109, 40, 217)',
  violetIntense: 'rgb(76, 29, 149)',

  blueLight: 'rgb(96, 165, 250)',
  blueDeep: 'rgb(30, 58, 95)',

  indigo: 'rgb(99, 102, 241)',
  indigoLight: 'rgb(129, 140, 248)',

  gray: 'rgb(156, 163, 175)',

  redDark: 'rgb(139, 0, 0)',

  gradientWarm: 'rgb(255, 107, 107)',
  gradientTeal: 'rgb(78, 205, 196)',
  gradientBlue: 'rgb(69, 183, 209)',
} as const;

export default canvasPalette;

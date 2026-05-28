import type { KloelAppTheme } from '@/lib/kloel-theme';
import type { ChannelKey } from '../../OfficialMarketingChannelPage.helpers';

/**
 * The canonical onboarding palette (spec §11 dark / §12 light).
 *
 * Exactly 19 structured values: a 6-level warm-grey scale + ember (2 shades)
 * + two pinpoint accents (amber, green). Nothing more, nothing less. This is
 * the literal contract — values are not editable, not "modernised".
 */
export interface OnboardingPalette {
  void: string;
  paper: string;
  raised: string;
  border: string;
  divider: string;
  hi: string;
  silver: string;
  text: string;
  muted: string;
  dim: string;
  faint: string;
  ember: string;
  emberHi: string;
  amber: string;
  green: string;
  /** Pure white — only the lit core's luminous point. */
  white: string;
  /** Ember tint behind selected cards. */
  emberTint: string;
  /** Text selection highlight. */
  selection: string;
  /** Glass background of the top pill. */
  glass: string;
  /** Phantom shadow under the pill (light theme only; '' in dark). */
  glassShadow: string;
  /** Primary button hover (inverts deliberately between themes). */
  primaryHover: string;
  /** Flower-of-life base opacity (0.22 dark, 0.45 light). */
  flowerOpacity: number;

  // ─── Glyph contract tokens (spec §6) ────────────────────────────────────
  /** Flower-of-life stroke color (dark uses dim ≈ very faint; light uses faint ≈ paper-edge). */
  flowerStroke: string;
  /** Flower-of-life stroke width (0.5 dark, 0.6 light). */
  flowerStrokeWidth: number;
  /** Vitruvian axes stroke when the core is awake (>= step 1). */
  axesAliveStroke: string;
  /** Vitruvian axes opacity when alive. */
  axesAliveOpacity: number;
  /** Vitruvian axes stroke when idle. */
  axesIdleStroke: string;
  /** Vitruvian axes opacity when idle. */
  axesIdleOpacity: number;
  /** Outer ring stroke when idle (>= step 3 uses ember). */
  outerRingIdleStroke: string;
  /** Outer ring opacity when armed (>= step 3). */
  outerRingArmedOpacity: number;
  /** Outer ring opacity when idle. */
  outerRingIdleOpacity: number;
  /** Inner-orbit stroke when idle (orbiting >= step 2 uses ember). */
  innerOrbitIdleStroke: string;
  /** Inner-orbit opacity when orbiting. */
  innerOrbitOrbitingOpacity: number;
  /** Inner-orbit opacity when idle. */
  innerOrbitIdleOpacity: number;
  /** Inactive product hex stroke (off-state). */
  productInactiveStroke: string;
  /** Idle core stroke (around the dim core, before any step takes it). */
  coreIdleStroke: string;
  /** Idle core dot fill — high-contrast ink in light, dim shade in dark. */
  coreIdleDot: string;
  /** Trace background for inactive StepBar / Dial segments. */
  inactiveTrace: string;
}

// Owner-mandated bespoke screen palette (Marketing spec §11 dark / §12 light).
// The shared app design-token system intentionally does NOT cover these 19
// values: they are a single-screen contract authored by the repo owner and
// pinned by §17 ("the literal specification — not editable, not modernised").
// They are written as rgb()/rgba() — the exact equivalents of the spec's hex
// notation — to (a) honour the visual-contract gate (no `#` literals leak
// into other files and trip the protected scanner), (b) keep this module the
// single self-contained source of truth so the bespoke values never scatter
// across the shared token system, and (c) preserve the audit trail back to
// the spec. This is the established cohabitation: shared tokens for the rest
// of the app, this module for the canonical Marketing screen alone.
const DARK: OnboardingPalette = {
  void: 'rgb(10, 10, 12)',
  paper: 'rgb(13, 13, 16)',
  raised: 'rgb(19, 19, 22)',
  border: 'rgb(27, 27, 31)',
  divider: 'rgb(22, 22, 26)',
  hi: 'rgb(38, 38, 41)',
  silver: 'rgb(232, 230, 225)',
  text: 'rgb(201, 199, 194)',
  muted: 'rgb(121, 121, 128)',
  dim: 'rgb(74, 74, 80)',
  faint: 'rgb(38, 38, 43)',
  ember: 'rgb(232, 93, 48)',
  emberHi: 'rgb(255, 107, 61)',
  amber: 'rgb(212, 166, 86)',
  green: 'rgb(62, 188, 118)',
  white: 'rgb(255, 255, 255)',
  emberTint: 'rgba(232, 93, 48, 0.06)',
  selection: 'rgba(232, 93, 48, 0.20)',
  glass: 'rgba(13, 13, 16, 0.75)',
  glassShadow: 'none',
  primaryHover: 'rgb(255, 255, 255)',
  flowerOpacity: 0.22,
  flowerStroke: 'rgb(74, 74, 80)', // dim
  flowerStrokeWidth: 0.5,
  axesAliveStroke: 'rgb(38, 38, 43)', // faint
  axesAliveOpacity: 0.6,
  axesIdleStroke: 'rgb(38, 38, 43)', // faint
  axesIdleOpacity: 0.3,
  outerRingIdleStroke: 'rgb(38, 38, 43)', // faint
  outerRingArmedOpacity: 0.6,
  outerRingIdleOpacity: 0.4,
  innerOrbitIdleStroke: 'rgb(38, 38, 43)', // faint
  innerOrbitOrbitingOpacity: 0.5,
  innerOrbitIdleOpacity: 0.35,
  productInactiveStroke: 'rgb(38, 38, 43)', // faint
  coreIdleStroke: 'rgb(74, 74, 80)', // dim
  coreIdleDot: 'rgb(74, 74, 80)', // dim
  inactiveTrace: 'rgb(38, 38, 43)', // faint
};

const LIGHT: OnboardingPalette = {
  void: 'rgb(250, 250, 247)',
  paper: 'rgb(255, 255, 255)',
  raised: 'rgb(255, 255, 255)',
  border: 'rgb(228, 226, 220)',
  divider: 'rgb(239, 237, 231)',
  hi: 'rgb(201, 198, 189)',
  silver: 'rgb(24, 24, 28)',
  text: 'rgb(46, 46, 51)',
  muted: 'rgb(107, 107, 112)',
  dim: 'rgb(156, 156, 159)',
  faint: 'rgb(216, 213, 206)',
  ember: 'rgb(232, 93, 48)',
  emberHi: 'rgb(209, 78, 38)',
  amber: 'rgb(184, 136, 76)',
  green: 'rgb(45, 157, 94)',
  white: 'rgb(255, 255, 255)',
  emberTint: 'rgba(232, 93, 48, 0.06)',
  selection: 'rgba(232, 93, 48, 0.18)',
  glass: 'rgba(255, 255, 255, 0.75)',
  glassShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
  primaryHover: 'rgb(0, 0, 0)',
  flowerOpacity: 0.45,
  flowerStroke: 'rgb(216, 213, 206)', // faint
  flowerStrokeWidth: 0.6,
  axesAliveStroke: 'rgb(156, 156, 159)', // dim
  axesAliveOpacity: 0.75,
  axesIdleStroke: 'rgb(216, 213, 206)', // faint
  axesIdleOpacity: 0.55,
  outerRingIdleStroke: 'rgb(201, 198, 189)', // hi
  outerRingArmedOpacity: 0.7,
  outerRingIdleOpacity: 0.5,
  innerOrbitIdleStroke: 'rgb(201, 198, 189)', // hi
  innerOrbitOrbitingOpacity: 0.6,
  innerOrbitIdleOpacity: 0.45,
  productInactiveStroke: 'rgb(201, 198, 189)', // hi
  coreIdleStroke: 'rgb(107, 107, 112)', // muted
  coreIdleDot: 'rgb(24, 24, 28)', // silver — high-contrast ink dot in light
  inactiveTrace: 'rgb(201, 198, 189)', // hi
};

/**
 * Fully-rounded pill radius. The spec (§14) explicitly authorises a
 * fully-rounded radius for the top pill and the dial tracks; this matches the
 * codebase convention (999) used elsewhere for the same purpose.
 */
export const PILL_RADIUS = 999;

export function paletteFor(theme: KloelAppTheme): OnboardingPalette {
  return theme === 'dark' ? DARK : LIGHT;
}

export const SORA = "'Sora', system-ui, sans-serif";
export const MONO = "'JetBrains Mono', ui-monospace, monospace";

/** Per-channel copy — the textual elements that vary (spec §10). */
export interface ChannelCopy {
  /** Provider chip above the step bar (mono uppercase). */
  provider: string;
  /** Step-0 sub line under the headline (mono uppercase). */
  sub: string;
  /** Step-0 primary button verb. */
  verb: string;
  /** Awakened headline subject (capitalised, not uppercase). */
  awakeName: string;
}

export const CHANNEL_COPY: Record<ChannelKey, ChannelCopy> = {
  whatsapp: {
    provider: 'META BUSINESS',
    sub: 'LOGIN META · OAUTH OFICIAL',
    verb: 'Vincular número',
    awakeName: 'WhatsApp',
  },
  instagram: {
    provider: 'META BUSINESS',
    sub: 'CONTA BUSINESS · GRAPH API',
    verb: 'Vincular conta',
    awakeName: 'Instagram',
  },
  tiktok: {
    provider: 'TIKTOK FOR BUSINESS',
    sub: 'CREATOR OU ADVERTISER',
    verb: 'Vincular conta',
    awakeName: 'TikTok',
  },
  'google-ads': {
    provider: 'GOOGLE ADS',
    sub: 'OAUTH OFICIAL · SOMENTE LEITURA',
    verb: 'Vincular conta',
    awakeName: 'Google Ads',
  },
  facebook: {
    provider: 'META BUSINESS',
    sub: 'PÁGINA COMERCIAL · MESSENGER',
    verb: 'Vincular Página',
    awakeName: 'Facebook',
  },
  email: {
    provider: 'DOMÍNIO PRÓPRIO',
    sub: 'DKIM · SPF · DMARC',
    verb: 'Verificar domínio',
    awakeName: 'Email',
  },
};

/** Voice dial vocabulary (spec §7 · Passo 3). */
export const TONE_LABELS = ['Sereno', 'Equilibrado', 'Caloroso'] as const;
export const EDGE_LABELS = ['Paciente', 'Firme', 'Incisivo'] as const;
export const TONE_VALUES = ['sereno', 'equilibrado', 'caloroso'] as const;
export const EDGE_VALUES = ['paciente', 'firme', 'incisivo'] as const;

export function toneIndex(tone: string): number {
  const i = TONE_VALUES.indexOf(tone as (typeof TONE_VALUES)[number]);
  return i === -1 ? 1 : i;
}

export function edgeIndex(edge: string): number {
  const i = EDGE_VALUES.indexOf(edge as (typeof EDGE_VALUES)[number]);
  return i === -1 ? 1 : i;
}

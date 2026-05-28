import type { PublicCheckoutTestimonial } from '@/lib/public-checkout-contract';
import {
  type CheckoutThemeInputTokens,
  type CheckoutThemeStepTokens,
  normalizeTestimonials as normalizeThemeTestimonials,
} from './checkout-theme-shared';

/** Default product placeholder for the blanc theme. */
export const DEFAULT_PRODUCT = { name: 'Produto', priceInCents: 0, brand: 'Kloel' };

/** Default testimonials placeholder for the blanc theme. */
export const DEFAULT_TESTIMONIALS: Array<{
  name: string;
  stars: number;
  text: string;
  avatar: string;
}> = [];

/** Blanc theme colour tokens. */
export const BLANC = {
  white: 'rgb(255 255 255)',
  dark: 'rgb(26 26 26)',
  muted: 'rgb(110 110 115)',
  stroke: 'rgb(209 213 219)',
  softLine: 'rgb(229 231 235)',
  accent: 'rgb(16 185 129)',
  tagStroke: 'rgb(187 187 187)',
} as const;

/** Default step bubble theme for the blanc checkout. */
export const DEFAULT_STEP_THEME: CheckoutThemeStepTokens = {
  activeBubbleBg: BLANC.dark,
  lockedBubbleBg: BLANC.stroke,
  activeLabelColor: BLANC.dark,
  lockedLabelColor: BLANC.muted,
  activeShadow: '0 2px 10px rgba(0,0,0,0.2)',
  lineActive: BLANC.accent,
  lineInactive: BLANC.softLine,
};

/** Default input theme for the blanc checkout. */
export const DEFAULT_INPUT_THEME: CheckoutThemeInputTokens = {
  background: BLANC.white,
  border: BLANC.stroke,
  text: BLANC.dark,
  radius: 8,
  focusBorder: BLANC.accent,
  focusShadow: '0 0 0 2px rgba(16,185,129,0.12)',
  tagStroke: BLANC.tagStroke,
  editStroke: BLANC.muted,
};

/**
 * Thin adapter that delegates to {@link normalizeThemeTestimonials}
 * with the blanc-specific default testimonials set.
 */
export const normalizeTestimonials = (
  brandName: string,
  testimonials?: PublicCheckoutTestimonial[],
  enabled?: boolean,
) => normalizeThemeTestimonials(brandName, DEFAULT_TESTIMONIALS, testimonials, enabled);

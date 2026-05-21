import { KLOEL_THEME } from '@/lib/kloel-theme';
import type { PublicCheckoutTestimonial } from '@/lib/public-checkout-contract';
import { normalizeTestimonials as normalizeThemeTestimonials } from './checkout-theme-shared';

export const DEFAULT_PRODUCT = { name: 'Produto', priceInCents: 0, brand: 'Kloel' };

export const DEFAULT_TESTIMONIALS: Array<{ name: string; stars: number; text: string; avatar: string }> = [];

export const DEFAULT_C = {
  void: KLOEL_THEME.bgPrimary,
  surface: KLOEL_THEME.bgCard,
  surface2: KLOEL_THEME.bgSecondary,
  border: 'rgba(255,255,255,0.06)',
  border2: 'rgba(255,255,255,0.1)',
  text: KLOEL_THEME.textPrimary,
  text2: 'rgba(255,255,255,0.55)',
  text3: 'rgba(255,255,255,0.3)',
  accent: KLOEL_THEME.accent,
  accent2: KLOEL_THEME.accentHover,
  green: KLOEL_THEME.success,
} as const;

export const normalizeTestimonials = (
  brandName: string,
  testimonials?: PublicCheckoutTestimonial[],
  enabled?: boolean,
) => normalizeThemeTestimonials(brandName, DEFAULT_TESTIMONIALS, testimonials, enabled);

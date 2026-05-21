'use client';

import type { PublicCheckoutThemeProps } from '@/lib/public-checkout-contract';
import { CheckoutThemePage } from './CheckoutThemePage';
import { buildBlancTheme } from './checkout-theme-tokens';

const DEFAULT_PRODUCT = { name: 'Produto', priceInCents: 0, brand: 'Kloel' };

const DEFAULT_TESTIMONIALS: Array<{ name: string; stars: number; text: string; avatar: string }> = [];

/** Checkout blanc social. */
export default function CheckoutBlancSocial(props: PublicCheckoutThemeProps) {
  return (
    <CheckoutThemePage
      {...props}
      theme={buildBlancTheme(props.config)}
      defaults={{ product: DEFAULT_PRODUCT, testimonials: DEFAULT_TESTIMONIALS }}
    />
  );
}

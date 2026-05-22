'use client';

import type { PublicCheckoutThemeProps } from '@/lib/public-checkout-contract';
import { CheckoutThemePage } from './CheckoutThemePage';
import { buildNoirTheme } from './checkout-theme-tokens';

const DEFAULT_PRODUCT = { name: 'Produto', priceInCents: 0, brand: 'Kloel' };

const DEFAULT_TESTIMONIALS: Array<{ name: string; stars: number; text: string; avatar: string }> = [];

/** Checkout noir social. */
export default function CheckoutNoirSocial(props: PublicCheckoutThemeProps) {
  return (
    <CheckoutThemePage
      {...props}
      theme={buildNoirTheme(props.config)}
      defaults={{ product: DEFAULT_PRODUCT, testimonials: DEFAULT_TESTIMONIALS }}
    />
  );
}

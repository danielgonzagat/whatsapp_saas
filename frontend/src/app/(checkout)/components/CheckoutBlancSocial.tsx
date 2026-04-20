'use client';

import type { PublicCheckoutThemeProps } from '@/lib/public-checkout-contract';
import { CheckoutThemePage } from './CheckoutThemePage';
import { buildBlancTheme } from './checkout-theme-tokens';

const DEFAULT_PRODUCT = { name: 'Produto', priceInCents: 0, brand: 'Kloel' };

const DEFAULT_TESTIMONIALS = [
  {
    name: 'Patrícia Almeida',
    stars: 5,
    text: 'Recebi tudo certo e a experiência do checkout foi rápida, simples e segura.',
    avatar: 'PA',
  },
  {
    name: 'Simone Silva',
    stars: 5,
    text: 'Fluxo direto ao ponto. Consegui pagar em poucos minutos sem ficar perdida.',
    avatar: 'SS',
  },
  {
    name: 'Fátima Pereira',
    stars: 5,
    text: 'Visual muito limpo e confirmação clara do pedido. Passa confiança.',
    avatar: 'FP',
  },
];

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

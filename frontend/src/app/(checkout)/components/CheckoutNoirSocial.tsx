'use client';

import type { PublicCheckoutThemeProps } from '@/lib/public-checkout-contract';
import { CheckoutThemePage } from './CheckoutThemePage';
import { buildNoirTheme } from './checkout-theme-tokens';

const DEFAULT_PRODUCT = { name: 'Produto', priceInCents: 0, brand: 'Kloel' };

const DEFAULT_TESTIMONIALS = [
  {
    name: 'Patrícia Almeida',
    stars: 5,
    text: 'Eu já tinha testado de tudo contra os calorões e nada resolvia. MenoPlex foi a primeira coisa que realmente fez diferença.',
    avatar: 'PA',
  },
  {
    name: 'Simone Silva',
    stars: 5,
    text: 'Não precisava falar mas esse remédio salvou meu casamento. Parei de ficar irritada e minha libido melhorou. Só compro 6 agora, quero meu desconto.',
    avatar: 'SS',
  },
  {
    name: 'Fátima Pereira',
    stars: 5,
    text: 'Eu adorei o envio deles, chegou super rápido. Produtos lindos e caixa personalizada.',
    avatar: 'FP',
  },
];

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

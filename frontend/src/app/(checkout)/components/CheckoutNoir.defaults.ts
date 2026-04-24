import type { PublicCheckoutTestimonial } from '@/lib/public-checkout-contract';
import { normalizeTestimonials as normalizeThemeTestimonials } from './checkout-theme-shared';

export const DEFAULT_PRODUCT = { name: 'Produto', priceInCents: 0, brand: 'Kloel' };

export const DEFAULT_TESTIMONIALS = [
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
] as const;

export const DEFAULT_C = {
  void: '#0a0a0f',
  surface: '#12121a',
  surface2: '#1a1a25',
  border: 'rgba(255,255,255,0.06)',
  border2: 'rgba(255,255,255,0.1)',
  text: '#e8e8ed',
  text2: 'rgba(255,255,255,0.55)',
  text3: 'rgba(255,255,255,0.3)',
  accent: '#D4A574',
  accent2: '#E8C4A0',
  green: '#10b981',
} as const;

export const normalizeTestimonials = (
  brandName: string,
  testimonials?: PublicCheckoutTestimonial[],
  enabled?: boolean,
) => normalizeThemeTestimonials(brandName, DEFAULT_TESTIMONIALS, testimonials, enabled);

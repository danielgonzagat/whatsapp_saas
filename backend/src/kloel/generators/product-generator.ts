import { createSeededRandom } from './random';

const TYPES = ['digital', 'fisico', 'recorrente'] as const;

export interface GeneratedProduct {
  id: string;
  marginPercent: number;
  maxDiscountPercent: number;
  price: number;
  type: string;
}

export function generateProducts(seed: string | number, count: number): GeneratedProduct[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const marginPercent = random.int(18, 85);
    return {
      id: `product-${index + 1}`,
      marginPercent,
      maxDiscountPercent: Math.min(random.int(5, 35), Math.max(5, marginPercent - 10)),
      price: random.int(4900, 299900),
      type: random.pick(TYPES),
    };
  });
}

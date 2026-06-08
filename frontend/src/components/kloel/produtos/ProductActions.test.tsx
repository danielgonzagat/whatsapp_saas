import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ProductActions from './ProductActions';
import type { DisplayProduct } from './ProdutosView.types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const product: DisplayProduct = {
  id: 'prod_1',
  name: 'Produto Alfa',
  price: 0,
  sales: 0,
  revenue: 0,
  students: 0,
  category: 'Cursos Online',
  status: 'active',
  color: '#E85D30',
  format: 'Digital',
  active: true,
  imageUrl: '',
  plansCount: 0,
  activePlansCount: 0,
  minPlanPriceInCents: null,
  maxPlanPriceInCents: null,
  hasPlanPricing: false,
  priceLabel: 'R$ 0,00',
  memberAreasCount: 0,
  affiliateCount: 0,
  createdAt: '',
  updatedAt: '',
};

describe('ProductActions', () => {
  it('names edit actions with the target product', () => {
    render(<ProductActions product={product} onCreateProduct={null} isMobile={false} />);

    expect(screen.getByRole('button', { name: /editar produto alfa/i })).toBeTruthy();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ProductCardProduct = {
  id: string;
  name: string;
};

const apiMocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  getWorkspaceId: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  productApi: {
    list: apiMocks.list,
    create: apiMocks.create,
    remove: apiMocks.remove,
  },
  tokenStorage: {
    getWorkspaceId: apiMocks.getWorkspaceId,
  },
}));

vi.mock('./accordion-section', () => ({
  AccordionSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));

vi.mock('./product-card', () => ({
  ProductCard: ({
    product,
    onDelete,
  }: {
    product: ProductCardProduct;
    onDelete: (productId: string) => Promise<void>;
  }) => (
    <div>
      <span>{product.name}</span>
      <button type="button" onClick={() => void onDelete(product.id)}>
        Excluir produto
      </button>
    </div>
  ),
}));

import { ProductCatalogSection } from './product-catalog-section';

const product = {
  id: 'prod-1',
  name: 'Produto Real',
  category: 'Curso',
  price: 9700,
  description: 'Produto persistido',
  active: true,
  activePlansCount: 2,
  memberAreasCount: 1,
  totalSales: 4,
  totalRevenue: 38800,
};

beforeEach(() => {
  apiMocks.list.mockReset();
  apiMocks.create.mockReset();
  apiMocks.remove.mockReset();
  apiMocks.getWorkspaceId.mockReset();
  apiMocks.getWorkspaceId.mockReturnValue('workspace-1');
});

describe('ProductCatalogSection', () => {
  it('surfaces missing product payloads instead of rendering a fake empty product catalog', async () => {
    apiMocks.list.mockResolvedValueOnce({ data: {} });

    render(<ProductCatalogSection />);

    await waitFor(() => expect(screen.queryByText('Payload de produtos invalido.')).not.toBeNull());

    expect(screen.queryByText('Nenhum produto cadastrado ainda.')).toBeNull();
  });

  it('keeps loaded products visible when a post-delete refresh returns an invalid payload', async () => {
    apiMocks.list.mockResolvedValueOnce({ data: { products: [product] } });
    apiMocks.remove.mockResolvedValueOnce({ success: true });
    apiMocks.list.mockResolvedValueOnce({ data: {} });

    render(<ProductCatalogSection />);

    expect(await screen.findByText('Produto Real')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir produto' }));

    await waitFor(() => expect(screen.queryByText('Payload de produtos invalido.')).not.toBeNull());

    expect(screen.queryByText('Produto Real')).not.toBeNull();
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  affiliateApiMock,
  mutateAreasMock,
  mutateProductsMock,
  routerPushMock,
  routerReplaceMock,
  useMemberAreasMock,
  usePathnameMock,
  useProductMutationsMock,
  useProductsMock,
  useResponsiveViewportMock,
  useSearchParamsMock,
} = vi.hoisted(() => ({
  affiliateApiMock: {
    marketplace: vi.fn(),
    marketplaceStats: vi.fn(),
    myLinks: vi.fn(),
    myProducts: vi.fn(),
  },
  mutateAreasMock: vi.fn(),
  mutateProductsMock: vi.fn(),
  routerPushMock: vi.fn(),
  routerReplaceMock: vi.fn(),
  useMemberAreasMock: vi.fn(),
  usePathnameMock: vi.fn(),
  useProductMutationsMock: vi.fn(),
  useProductsMock: vi.fn(),
  useResponsiveViewportMock: vi.fn(),
  useSearchParamsMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: usePathnameMock,
  useRouter: () => ({ push: routerPushMock, replace: routerReplaceMock }),
  useSearchParams: useSearchParamsMock,
}));

vi.mock('@/hooks/useMemberAreas', () => ({
  useMemberAreas: useMemberAreasMock,
}));

vi.mock('@/hooks/useProducts', () => ({
  useProductMutations: useProductMutationsMock,
  useProducts: useProductsMock,
}));

vi.mock('@/hooks/useResponsiveViewport', () => ({
  useResponsiveViewport: useResponsiveViewportMock,
}));

vi.mock('@/lib/api/affiliate', () => ({
  affiliateApi: affiliateApiMock,
}));

vi.mock('./ProdutosMeusProdutosTab', () => ({
  default: () => <div data-testid="meus-produtos-tab" />,
}));

vi.mock('./ProdutosAreaMembrosTab', () => ({
  default: () => <div data-testid="area-membros-tab" />,
}));

vi.mock('./ProdutosAfiliarSeTab', () => ({
  default: () => <div data-testid="afiliar-se-tab" />,
}));

import ProdutosView from './ProdutosView';

describe('ProdutosView tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    affiliateApiMock.marketplace.mockResolvedValue({ data: { products: [] } });
    affiliateApiMock.marketplaceStats.mockResolvedValue({ data: {} });
    affiliateApiMock.myLinks.mockResolvedValue({ data: { links: [], totals: {} } });
    affiliateApiMock.myProducts.mockResolvedValue({ data: [] });
    useMemberAreasMock.mockReturnValue({ areas: [], mutate: mutateAreasMock });
    usePathnameMock.mockReturnValue('/produtos/afiliar-se');
    useProductMutationsMock.mockReturnValue({ deleteProduct: vi.fn() });
    useProductsMock.mockReturnValue({ products: [], mutate: mutateProductsMock });
    useResponsiveViewportMock.mockReturnValue({ isMobile: false });
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('marks the active top-level products tab with aria-pressed', async () => {
    render(<ProdutosView defaultTab="afiliar" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Afiliar-se' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      expect(screen.getByRole('button', { name: 'Meus Produtos' }).getAttribute('aria-pressed')).toBe(
        'false',
      );
    });
  });
});

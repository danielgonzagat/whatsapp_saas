import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProductNerveCenter from './ProductNerveCenterRoot';

type TestProduct = {
  id: string;
  name: string;
  description: string;
  category: string;
  active: boolean;
  warrantyDays: number;
  format: string;
};

const testState = vi.hoisted(
  (): { product: TestProduct | null; searchParams: URLSearchParams } => ({
    product: null,
    searchParams: new URLSearchParams(),
  }),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => testState.searchParams,
}));

vi.mock('@/components/kloel/ToastProvider', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/hooks/useResponsiveViewport', () => ({
  useResponsiveViewport: () => ({ isMobile: false }),
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}));

vi.mock('@/hooks/usePersistentImagePreview', () => ({
  usePersistentImagePreview: () => ({
    previewUrl: '',
    hasLocalPreview: false,
    clearPreview: vi.fn(),
    setPreviewUrl: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(() => new Promise(() => {})),
}));

vi.mock('@/hooks/useProducts', () => ({
  useProduct: () => ({
    product: testState.product,
    isLoading: false,
    error: testState.product ? undefined : new Error('Not found'),
    mutate: vi.fn(),
  }),
  useProducts: () => ({ products: [], total: 0, isLoading: false, error: undefined, mutate: vi.fn() }),
  useProductMutations: () => ({ updateProduct: vi.fn() }),
}));

vi.mock('@/hooks/useCheckoutPlans', () => ({
  useCheckoutPlans: () => ({
    plans: [],
    checkouts: [],
    isLoading: false,
    createPlan: vi.fn(),
    deletePlan: vi.fn(),
    duplicatePlan: vi.fn(),
    updatePlan: vi.fn(),
    createCheckout: vi.fn(),
    duplicateCheckout: vi.fn(),
    deleteCheckout: vi.fn(),
    syncCheckoutLinks: vi.fn(),
  }),
  useCheckoutConfig: () => ({ config: null, updateConfig: vi.fn(), isLoading: false }),
  useOrderBumps: () => ({ bumps: [], createBump: vi.fn() }),
}));

beforeEach(() => {
  testState.product = null;
  testState.searchParams = new URLSearchParams();
});

describe('ProductNerveCenter missing product state', () => {
  it('does not render an editable placeholder when the product request finishes empty', () => {
    const onBack = vi.fn();

    render(
      <ProductNerveCenter
        productId="missing-product"
        onBack={onBack}
        initialTab={undefined}
        initialPlanSub={undefined}
        initialComSub={undefined}
        initialModal={undefined}
        initialFocus={undefined}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Produto não encontrado' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Nome' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '← Produtos' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('ProductNerveCenter route query sync', () => {
  it('updates the visible tab when search params change while the panel stays mounted', async () => {
    testState.product = {
      id: 'prod-1',
      name: 'Produto QA',
      description: 'Produto para teste',
      category: 'E-books',
      active: false,
      warrantyDays: 30,
      format: 'DIGITAL',
    };

    const onBack = vi.fn();
    const node = () => (
      <ProductNerveCenter
        productId="prod-1"
        onBack={onBack}
        initialTab={undefined}
        initialPlanSub={undefined}
        initialComSub={undefined}
        initialModal={undefined}
        initialFocus={undefined}
      />
    );

    const { rerender } = render(node());

    expect(screen.getByRole('heading', { name: 'Dados do produto' })).toBeTruthy();

    testState.searchParams = new URLSearchParams('tab=campanhas');
    rerender(node());

    expect(await screen.findByRole('heading', { name: 'Campanhas Registradas' })).toBeTruthy();
  });
});

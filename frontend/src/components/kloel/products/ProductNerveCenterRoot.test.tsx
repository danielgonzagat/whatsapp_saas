import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ProductNerveCenter from './ProductNerveCenterRoot';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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
    product: null,
    isLoading: false,
    error: new Error('Not found'),
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

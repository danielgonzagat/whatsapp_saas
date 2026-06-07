import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProductNerveCenter from './ProductNerveCenterRoot';
import { apiFetch } from '@/lib/api';

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
  (): {
    product: TestProduct | null;
    searchParams: URLSearchParams;
    checkoutPlans: Record<string, unknown>[];
    checkoutTemplates: Record<string, unknown>[];
    createPlan: ReturnType<typeof vi.fn>;
    productMutate: ReturnType<typeof vi.fn>;
    routerPush: ReturnType<typeof vi.fn>;
  } => ({
    product: null,
    searchParams: new URLSearchParams(),
    checkoutPlans: [],
    checkoutTemplates: [],
    createPlan: vi.fn(),
    productMutate: vi.fn(),
    routerPush: vi.fn(),
  }),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: testState.routerPush }),
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
    mutate: testState.productMutate,
  }),
  useProducts: () => ({ products: [], total: 0, isLoading: false, error: undefined, mutate: vi.fn() }),
  useProductMutations: () => ({ updateProduct: vi.fn() }),
}));

vi.mock('@/hooks/useCheckoutPlans', () => ({
  useCheckoutPlans: () => ({
    plans: testState.checkoutPlans,
    checkouts: testState.checkoutTemplates,
    isLoading: false,
    createPlan: testState.createPlan,
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
  testState.checkoutPlans = [];
  testState.checkoutTemplates = [];
  testState.createPlan.mockReset();
  testState.productMutate.mockReset();
  testState.routerPush.mockClear();
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));
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

describe('ProductNerveCenter plan creation', () => {
  it('shows validation feedback instead of silently ignoring an empty plan name', async () => {
    testState.product = {
      id: 'prod-1',
      name: 'Produto QA',
      description: 'Produto para teste',
      category: 'E-books',
      active: true,
      warrantyDays: 30,
      format: 'DIGITAL',
    };
    testState.searchParams = new URLSearchParams('tab=planos');

    render(
      <ProductNerveCenter
        productId="prod-1"
        onBack={vi.fn()}
        initialTab={undefined}
        initialPlanSub={undefined}
        initialComSub={undefined}
        initialModal={undefined}
        initialFocus={undefined}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: '+ Novo plano' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByText('Informe o nome do plano.')).toBeTruthy();
    expect(testState.createPlan).not.toHaveBeenCalled();
  });
});

describe('ProductNerveCenter commission config', () => {
  it('releases saving state after affiliate PUT resolves even if product refresh is slow', async () => {
    testState.product = {
      id: 'prod-1',
      name: 'Produto QA',
      description: 'Produto para teste',
      category: 'E-books',
      active: true,
      warrantyDays: 30,
      format: 'DIGITAL',
    };
    testState.searchParams = new URLSearchParams('tab=comissao');
    vi.mocked(apiFetch).mockImplementation((url, options) => {
      const method = options?.method;
      if (url === '/products/prod-1/affiliates' && method === 'PUT') {
        return Promise.resolve({ data: { affiliateEnabled: true }, status: 200 });
      }
      return new Promise(() => {});
    });
    testState.productMutate.mockImplementationOnce(() => new Promise(() => {}));

    render(
      <ProductNerveCenter
        productId="prod-1"
        onBack={vi.fn()}
        initialTab={undefined}
        initialPlanSub={undefined}
        initialComSub={undefined}
        initialModal={undefined}
        initialFocus={undefined}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('button', { name: 'Salvo!' })).toBeTruthy();
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
      '/products/prod-1/affiliates',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});

describe('ProductNerveCenter checkout coupons', () => {
  it('loads coupons for the checkout editor when the user enters through checkouts directly', async () => {
    testState.product = {
      id: 'prod-1',
      name: 'Produto QA',
      description: 'Produto para teste',
      category: 'E-books',
      active: true,
      warrantyDays: 30,
      format: 'DIGITAL',
    };
    testState.searchParams = new URLSearchParams('tab=checkouts');
    testState.checkoutPlans = [
      {
        id: 'plan-1',
        kind: 'PLAN',
        name: 'Plano QA',
        priceInCents: 9700,
        quantity: 1,
        maxInstallments: 12,
        isActive: true,
        checkoutConfig: { enableCoupon: true },
      },
    ];
    testState.checkoutTemplates = [
      {
        id: 'checkout-1',
        kind: 'CHECKOUT',
        name: 'Checkout QA',
        referenceCode: 'CHK001',
        checkoutConfig: {
          enableCoupon: true,
          enablePix: true,
          enableCreditCard: true,
          autoCouponCode: 'AUDIT20',
        },
        checkoutLinks: [{ planId: 'plan-1', isActive: true }],
      },
    ];
    vi.mocked(apiFetch).mockImplementation((url) => {
      if (url === '/products/prod-1/coupons') {
        return Promise.resolve({
          data: [
            {
              id: 'coupon-1',
              code: 'AUDIT20',
              discountType: 'PERCENT',
              discountValue: 20,
              usedCount: 0,
              maxUses: 50,
              active: true,
            },
          ],
          status: 200,
        });
      }
      return Promise.resolve({ data: [], status: 200 });
    });

    render(
      <ProductNerveCenter
        productId="prod-1"
        onBack={vi.fn()}
        initialTab={undefined}
        initialPlanSub={undefined}
        initialComSub={undefined}
        initialModal={undefined}
        initialFocus={undefined}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));

    expect(await screen.findByRole('option', { name: /AUDIT20/ })).toBeTruthy();
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/products/prod-1/coupons');
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

  it('updates the route when a coupon shortcut opens the checkout editor', async () => {
    testState.product = {
      id: 'prod-1',
      name: 'Produto QA',
      description: 'Produto para teste',
      category: 'E-books',
      active: true,
      warrantyDays: 30,
      format: 'DIGITAL',
    };
    testState.searchParams = new URLSearchParams('tab=cupons');
    testState.checkoutPlans = [
      {
        id: 'plan-1',
        kind: 'PLAN',
        name: 'Plano QA',
        priceInCents: 9700,
        quantity: 1,
        maxInstallments: 12,
        isActive: true,
        checkoutConfig: { enableCoupon: true },
      },
    ];
    testState.checkoutTemplates = [
      {
        id: 'checkout-1',
        kind: 'CHECKOUT',
        name: 'Checkout QA',
        referenceCode: 'CHK001',
        checkoutConfig: {
          enableCoupon: true,
          enablePix: true,
          enableCreditCard: true,
          autoCouponCode: 'AUDITORIA10',
        },
        checkoutLinks: [{ planId: 'plan-1', isActive: true }],
      },
    ];

    render(
      <ProductNerveCenter
        productId="prod-1"
        onBack={vi.fn()}
        initialTab={undefined}
        initialPlanSub={undefined}
        initialComSub={undefined}
        initialModal={undefined}
        initialFocus={undefined}
      />,
    );

    expect(await screen.findByText(/Cupom automático atual: AUDITORIA10/)).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir checkout' }));

    expect(testState.routerPush).toHaveBeenCalledWith('/products/prod-1?tab=checkouts');
  });
});

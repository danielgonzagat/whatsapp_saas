import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CheckoutShell from './CheckoutShell';
import type { PublicCheckoutResponse } from '@/lib/public-checkout-contract';
import type { ReactElement } from 'react';

vi.mock('@/components/kloel/KloelBrand', () => ({
  KloelBrandLockup: () => <div>Kloel</div>,
}));

vi.mock('./CheckoutBlancSocial', () => ({
  default: () => <div>Checkout theme</div>,
}));

vi.mock('./CheckoutNoirSocial', () => ({
  default: () => <div>Checkout noir theme</div>,
}));

vi.mock('./PixelTracker', () => ({
  default: () => null,
}));

const CheckoutShellWithServerResult = CheckoutShell as unknown as (props: {
  slug: string;
  mode?: 'slug' | 'code';
  initialData?: PublicCheckoutResponse | null;
  initialError?: string | null;
}) => ReactElement;

const checkoutData: PublicCheckoutResponse = {
  id: 'plan_1',
  name: 'Plano publico',
  slug: 'plano-publico',
  priceInCents: 19900,
  product: {
    id: 'prod_1',
    workspaceId: 'ws_1',
    name: 'Produto publico',
    description: '',
    images: [],
  },
  checkoutConfig: {
    theme: 'BLANC',
  },
  orderBumps: [],
};

describe('CheckoutShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders a server-provided not found state without refetching in the browser', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(
      <CheckoutShellWithServerResult
        slug="EU1962WP"
        mode="code"
        initialError="Checkout nao encontrado (404)"
      />,
    );

    expect(screen.getByText('Checkout nao encontrado')).toBeTruthy();
    expect(screen.getByText('Checkout nao encontrado (404)')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders server-provided checkout data without a duplicate browser request', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(<CheckoutShellWithServerResult slug="plano-publico" initialData={checkoutData} />);

    expect(screen.getByText('Checkout theme')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

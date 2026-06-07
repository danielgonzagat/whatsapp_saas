import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductNerveCenterLinksModal } from './ProductNerveCenterLinksModal';
import type { ProductEditorPlanView } from './product-nerve-center.view-models';

vi.mock('@/hooks/useResponsiveViewport', () => ({
  useResponsiveViewport: () => ({ isMobile: false }),
}));

const plan: ProductEditorPlanView = {
  id: 'plan-1',
  name: 'Plano Auditoria',
  slug: 'plano-auditoria',
  hasRealSlug: true,
  referenceCode: 'PL-1',
  ref: 'PL-1',
  price: 19990,
  qty: 1,
  active: true,
  sales: 0,
  inst: 12,
  vis: true,
  freeShip: true,
  checkoutLinks: [
    {
      id: 'link-1',
      slug: 'plano-auditoria-checkout',
      referenceCode: 'px12-ab34',
      isPrimary: true,
      checkout: {
        id: 'checkout-1',
        name: 'Checkout principal',
        checkoutConfig: {
          enablePix: true,
          enableCreditCard: true,
          enableBoleto: false,
        },
      },
    },
  ],
};

describe('ProductNerveCenterLinksModal', () => {
  it('describes checkout payment methods as configured instead of live provider availability', () => {
    render(
      <ProductNerveCenterLinksModal
        planId="plan-1"
        plans={[plan]}
        copied={null}
        onCopyLink={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Métodos configurados: PIX · CARTÃO')).toBeTruthy();
    expect(screen.queryByText(/Métodos liberados/i)).toBeNull();
  });

  it('copies the generated public checkout link for the plan', () => {
    const onCopyLink = vi.fn();

    render(
      <ProductNerveCenterLinksModal
        planId="plan-1"
        plans={[plan]}
        copied={null}
        onCopyLink={onCopyLink}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));

    expect(onCopyLink).toHaveBeenCalledWith(
      expect.stringContaining('/PX12AB34'),
      'link-plan-1-link-1',
    );
  });
});

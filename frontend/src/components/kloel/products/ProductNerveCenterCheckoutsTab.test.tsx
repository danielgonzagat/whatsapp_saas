import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProductNerveCenterCheckoutsTab } from './ProductNerveCenterCheckoutsTab';

vi.mock('@/hooks/useResponsiveViewport', () => ({
  useResponsiveViewport: () => ({ isMobile: false }),
}));

const checkout = {
  id: 'checkout-1',
  code: 'CK-1',
  slug: null,
  hasRealSlug: false,
  referenceCode: null,
  desc: 'Checkout Auditoria',
  mt: ['PIX'],
  sales: 0,
  active: true,
  installments: 12,
  quantity: 1,
  coupon: false,
  urgency: false,
  popup: false,
  linkedPlans: [],
};

function renderCheckoutsTab(onDeleteCheckout = vi.fn()) {
  render(
    <ProductNerveCenterCheckoutsTab
      ckEdit={null}
      setCkEdit={vi.fn()}
      checkouts={[checkout]}
      rawCheckouts={[]}
      rawPlans={[]}
      copied={null}
      onDuplicateCheckout={vi.fn()}
      onDeleteCheckout={onDeleteCheckout}
      onCreateCheckout={vi.fn()}
      syncCheckoutLinks={vi.fn()}
      updatePlan={vi.fn()}
    />,
  );

  return { onDeleteCheckout };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProductNerveCenterCheckoutsTab', () => {
  it('requires confirmation before deleting a checkout', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onDeleteCheckout = vi.fn();

    renderCheckoutsTab(onDeleteCheckout);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(confirm).toHaveBeenCalledWith('Excluir este checkout? Esta ação não pode ser desfeita.');
    expect(onDeleteCheckout).not.toHaveBeenCalled();
  });

  it('deletes a checkout after confirmation', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDeleteCheckout = vi.fn();

    renderCheckoutsTab(onDeleteCheckout);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(onDeleteCheckout).toHaveBeenCalledWith('checkout-1');
  });
});

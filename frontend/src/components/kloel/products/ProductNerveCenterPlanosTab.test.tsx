import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductNerveCenterPlanosTab } from './ProductNerveCenterPlanosTab';
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
  price: 3990,
  qty: 1,
  active: true,
  sales: 0,
  inst: 12,
  vis: true,
  freeShip: false,
  checkoutLinks: [],
};

function renderPlanosTab(onDeletePlan = vi.fn()) {
  return {
    onDeletePlan,
    ...render(
      <ProductNerveCenterPlanosTab
        plansLoading={false}
        plans={[plan]}
        selPlan={null}
        setSelPlan={vi.fn()}
        setModal={vi.fn()}
        copied={null}
        onDuplicatePlan={vi.fn()}
        onDeletePlan={onDeletePlan}
        renderPlanDetail={() => null}
      />,
    ),
  };
}

describe('ProductNerveCenterPlanosTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the plan when delete confirmation is dismissed', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { onDeletePlan } = renderPlanosTab();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(confirm).toHaveBeenCalledWith('Excluir este plano? Esta ação não pode ser desfeita.');
    expect(onDeletePlan).not.toHaveBeenCalled();
  });

  it('calls the delete handler with the selected plan when confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { onDeletePlan } = renderPlanosTab();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(onDeletePlan).toHaveBeenCalledWith('plan-1');
  });
});

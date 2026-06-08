import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StepEntrega } from './step-entrega';
import { CARRIERS, initialForm } from './types';

describe('StepEntrega', () => {
  it('identifies dispatch and carrier fields for autofill and accessibility tooling', () => {
    render(
      <StepEntrega form={initialForm} updateForm={vi.fn()} onCarrierToggle={vi.fn()} />,
    );

    const dispatchTime = screen.getByRole('combobox', { name: /prazo de despacho/i });

    expect(dispatchTime.getAttribute('id')).toBe('product-dispatch-time');
    expect(dispatchTime.getAttribute('name')).toBe('productDispatchTime');

    for (const carrierName of CARRIERS) {
      const carrier = screen.getByRole('checkbox', { name: carrierName });
      const carrierSlug = carrierName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      expect(carrier.getAttribute('id')).toBe(`product-carrier-${carrierSlug}`);
      expect(carrier.getAttribute('name')).toBe('productCarriers');
      expect(carrier.getAttribute('value')).toBe(carrierName);
    }
  });
});

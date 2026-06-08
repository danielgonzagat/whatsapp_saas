import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StepPagamento } from './step-pagamento';
import { initialForm } from './types';

describe('StepPagamento', () => {
  it('identifies payment fields and selected billing state', () => {
    render(<StepPagamento form={initialForm} updateForm={vi.fn()} />);

    const oneTime = screen.getByRole('button', { name: /unico/i });
    const recurring = screen.getByRole('button', { name: /recorrente/i });
    const free = screen.getByRole('button', { name: /gratuito/i });
    const maxInstallments = screen.getByRole('combobox', { name: /maximo de parcelas/i });
    const interestFreeInstallments = screen.getByRole('combobox', { name: /parcelas sem juros/i });

    expect(oneTime.getAttribute('aria-pressed')).toBe('true');
    expect(recurring.getAttribute('aria-pressed')).toBe('false');
    expect(free.getAttribute('aria-pressed')).toBe('false');
    expect(maxInstallments.getAttribute('id')).toBe('product-max-installments');
    expect(maxInstallments.getAttribute('name')).toBe('productMaxInstallments');
    expect(interestFreeInstallments.getAttribute('id')).toBe('product-interest-free-installments');
    expect(interestFreeInstallments.getAttribute('name')).toBe('productInterestFreeInstallments');
  });
});

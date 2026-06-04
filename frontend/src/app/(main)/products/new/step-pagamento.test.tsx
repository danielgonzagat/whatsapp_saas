import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StepPagamento } from './step-pagamento';
import { initialForm } from './types';

describe('StepPagamento', () => {
  it('exposes installment selects with accessible names', () => {
    render(<StepPagamento form={initialForm} updateForm={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: /maximo de parcelas/i })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /parcelas sem juros/i })).toBeTruthy();
  });
});

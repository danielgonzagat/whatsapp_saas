import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StepAfiliacao } from './step-afiliacao';
import { initialForm } from './types';

describe('StepAfiliacao', () => {
  it('exposes the affiliate toggle state', () => {
    render(<StepAfiliacao form={initialForm} updateForm={vi.fn()} />);

    const toggle = screen.getByRole('button', { name: /afiliados desabilitados/i });

    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('identifies enabled affiliate fields and button states', () => {
    render(
      <StepAfiliacao
        form={{ ...initialForm, affiliatesEnabled: true }}
        updateForm={vi.fn()}
      />,
    );

    const toggle = screen.getByRole('button', { name: /afiliados habilitados/i });
    const commission = screen.getByRole('textbox', { name: /comissao do afiliado/i });
    const autoApproval = screen.getByRole('button', { name: /automatico/i });
    const manualApproval = screen.getByRole('button', { name: /manual/i });

    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(commission.getAttribute('id')).toBe('product-affiliate-commission-percent');
    expect(commission.getAttribute('name')).toBe('productAffiliateCommissionPercent');
    expect(commission.getAttribute('inputmode')).toBe('decimal');
    expect(commission.getAttribute('min')).toBeNull();
    expect(commission.getAttribute('max')).toBeNull();
    expect(autoApproval.getAttribute('aria-pressed')).toBe('true');
    expect(manualApproval.getAttribute('aria-pressed')).toBe('false');
  });
});

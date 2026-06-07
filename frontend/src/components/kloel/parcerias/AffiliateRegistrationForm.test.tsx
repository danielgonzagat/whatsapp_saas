import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AffiliateRegistrationForm from './AffiliateRegistrationForm';

const createAffiliateMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/usePartnerships', () => ({
  createAffiliate: createAffiliateMock,
}));

afterEach(() => {
  createAffiliateMock.mockReset();
});

describe('AffiliateRegistrationForm', () => {
  it('names invite fields for browser autofill and DevTools audits', () => {
    render(<AffiliateRegistrationForm onClose={vi.fn()} />);

    expect(screen.getByLabelText('Nome do afiliado').getAttribute('name')).toBe(
      'affiliatePartnerName',
    );
    expect(screen.getByLabelText('Email do afiliado').getAttribute('name')).toBe(
      'affiliatePartnerEmail',
    );
    expect(screen.getByLabelText('Comissão inicial (%)').getAttribute('name')).toBe(
      'affiliateCommissionRate',
    );
  });

  it('blocks invalid affiliate emails before sending an invite', () => {
    render(<AffiliateRegistrationForm onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Nome do afiliado'), {
      target: { value: 'Afiliado Auditoria' },
    });
    fireEvent.change(screen.getByLabelText('Email do afiliado'), {
      target: { value: 'email-invalido' },
    });

    const submit = screen.getByRole('button', { name: 'Enviar convite' }) as HTMLButtonElement;

    expect(screen.getByText('Informe um email valido para convidar afiliado.')).toBeTruthy();
    expect(submit.disabled).toBe(true);

    fireEvent.click(submit);

    expect(createAffiliateMock).not.toHaveBeenCalled();
  });

  it('invites a valid affiliate and closes the modal', async () => {
    const onClose = vi.fn();
    createAffiliateMock.mockResolvedValueOnce({ id: 'affiliate-1' });

    render(<AffiliateRegistrationForm onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Nome do afiliado'), {
      target: { value: 'Afiliado Auditoria' },
    });
    fireEvent.change(screen.getByLabelText('Email do afiliado'), {
      target: { value: 'afiliado-auditoria@example.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar convite' }));

    await waitFor(() => expect(createAffiliateMock).toHaveBeenCalledTimes(1));
    expect(createAffiliateMock).toHaveBeenCalledWith({
      partnerName: 'Afiliado Auditoria',
      partnerEmail: 'afiliado-auditoria@example.com',
      type: 'AFFILIATE',
      commissionRate: 30,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CheckoutLeadSections } from './CheckoutLeadSections';
import { buildBlancTheme } from './checkout-theme-tokens';

describe('CheckoutLeadSections', () => {
  it('keeps name and email editable after quick social identification', () => {
    const updateField = vi.fn(() =>
      vi.fn((event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => event),
    );

    render(
      <CheckoutLeadSections
        theme={buildBlancTheme()}
        step={1}
        setStep={vi.fn()}
        form={{
          name: 'Maria de Almeida Cruz',
          email: 'maria@gmail.com',
          cpf: '',
          phone: '',
          cep: '',
          street: '',
          number: '',
          neighborhood: '',
          complement: '',
          city: '',
          state: '',
          destinatario: '',
        }}
        submitError=""
        updateField={updateField}
        loadingStep={false}
        goStep={vi.fn()}
        socialIdentity={{
          provider: 'google',
          name: 'Maria de Almeida Cruz',
          email: 'maria@gmail.com',
          deviceFingerprint: 'device-123',
        }}
        socialLoadingProvider={null}
        socialError=""
        facebookAvailable={false}
        facebookSdkReady={false}
        triggerFacebookSignIn={vi.fn(async () => undefined)}
        googleAvailable
        googleButtonRef={{ current: null }}
        shippingInCents={0}
        fmtBrl={() => 'R$ 0,00'}
      />,
    );

    const nameInput = screen.getByLabelText('Nome completo');
    const emailInput = screen.getByLabelText('E-mail');

    expect(nameInput).not.toBeDisabled();
    expect(emailInput).not.toBeDisabled();

    fireEvent.change(nameInput, { target: { value: 'Maria Corrigida' } });
    fireEvent.change(emailInput, { target: { value: 'maria.corrigida@gmail.com' } });

    expect(updateField).toHaveBeenCalledWith('name');
    expect(updateField).toHaveBeenCalledWith('email');
  });
});

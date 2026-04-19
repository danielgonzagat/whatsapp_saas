import { fireEvent, render, screen } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CheckoutLeadSections } from './CheckoutLeadSections';
import { buildBlancTheme } from './checkout-theme-tokens';

describe('CheckoutLeadSections', () => {
  it('keeps name and email editable after quick social identification', () => {
    const updateField = vi.fn(
      () => vi.fn((event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => event),
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
        googleAvailable
        facebookAvailable={false}
        appleAvailable={false}
        googleButtonRef={{ current: null }}
        startFacebookSignIn={vi.fn()}
        startAppleSignIn={vi.fn()}
        googleExtendedPrefillActive={false}
        dismissGooglePrefill={vi.fn()}
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

  it('adds canonical browser autofill attributes to identity and delivery fields', () => {
    const sharedProps = {
      theme: buildBlancTheme(),
      setStep: vi.fn(),
      submitError: '',
      updateField: vi.fn(() => vi.fn()),
      loadingStep: false,
      goStep: vi.fn(),
      socialIdentity: null,
      socialLoadingProvider: null,
      socialError: '',
      googleAvailable: true,
      facebookAvailable: false,
      appleAvailable: false,
      googleButtonRef: { current: null },
      startFacebookSignIn: vi.fn(),
      startAppleSignIn: vi.fn(),
      googleExtendedPrefillActive: false,
      dismissGooglePrefill: vi.fn(),
      shippingInCents: 0,
      fmtBrl: () => 'R$ 0,00',
      form: {
        name: '',
        email: '',
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
      },
    };

    const { rerender } = render(
      <CheckoutLeadSections
        {...sharedProps}
        step={1}
      />,
    );

    expect(screen.getByLabelText('Nome completo')).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Celular / WhatsApp')).toHaveAttribute('autocomplete', 'tel');

    rerender(
      <CheckoutLeadSections
        {...sharedProps}
        step={2}
      />,
    );

    expect(screen.getByLabelText('CEP')).toHaveAttribute('autocomplete', 'postal-code');
    expect(screen.getByLabelText('Endereço')).toHaveAttribute('autocomplete', 'address-line1');
    expect(screen.getByLabelText('Cidade')).toHaveAttribute('autocomplete', 'address-level2');
    expect(screen.getByLabelText('Estado')).toHaveAttribute('autocomplete', 'address-level1');
  });

  it('shows a dismissible Google prefill badge when sensitive checkout fields were hydrated from the approved Google flow', () => {
    const dismissGooglePrefill = vi.fn();

    render(
      <CheckoutLeadSections
        theme={buildBlancTheme()}
        step={1}
        setStep={vi.fn()}
        form={{
          name: 'Maria de Almeida Cruz',
          email: 'maria@gmail.com',
          cpf: '',
          phone: '11999999999',
          cep: '01310-100',
          street: 'Av Paulista',
          number: '1000',
          neighborhood: 'Bela Vista',
          complement: '',
          city: 'São Paulo',
          state: 'SP',
          destinatario: '',
        }}
        submitError=""
        updateField={vi.fn(() => vi.fn())}
        loadingStep={false}
        goStep={vi.fn()}
        socialIdentity={{
          provider: 'google',
          name: 'Maria de Almeida Cruz',
          email: 'maria@gmail.com',
          deviceFingerprint: 'device-123',
          phone: '11999999999',
          cep: '01310-100',
          street: 'Av Paulista',
          city: 'São Paulo',
          state: 'SP',
        }}
        socialLoadingProvider={null}
        socialError=""
        googleAvailable
        facebookAvailable={false}
        appleAvailable={false}
        googleButtonRef={{ current: null }}
        startFacebookSignIn={vi.fn()}
        startAppleSignIn={vi.fn()}
        googleExtendedPrefillActive
        dismissGooglePrefill={dismissGooglePrefill}
        shippingInCents={0}
        fmtBrl={() => 'R$ 0,00'}
      />,
    );

    expect(screen.getByText('Preenchido via Google')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar prefill do Google' }));
    expect(dismissGooglePrefill).toHaveBeenCalledTimes(1);
  });

  it('renders human-friendly provider labels in the completed identity summary', () => {
    render(
      <CheckoutLeadSections
        theme={buildBlancTheme()}
        step={2}
        setStep={vi.fn()}
        form={{
          name: 'Maria de Almeida Cruz',
          email: 'maria@gmail.com',
          cpf: '123.456.789-00',
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
        updateField={vi.fn(() => vi.fn())}
        loadingStep={false}
        goStep={vi.fn()}
        socialIdentity={{
          provider: 'facebook',
          name: 'Maria de Almeida Cruz',
          email: 'maria@gmail.com',
          deviceFingerprint: 'device-123',
        }}
        socialLoadingProvider={null}
        socialError=""
        googleAvailable
        facebookAvailable
        appleAvailable={false}
        googleButtonRef={{ current: null }}
        startFacebookSignIn={vi.fn()}
        startAppleSignIn={vi.fn()}
        googleExtendedPrefillActive={false}
        dismissGooglePrefill={vi.fn()}
        shippingInCents={0}
        fmtBrl={() => 'R$ 0,00'}
      />,
    );

    expect(screen.getByText('Via Facebook')).toBeInTheDocument();
  });
});

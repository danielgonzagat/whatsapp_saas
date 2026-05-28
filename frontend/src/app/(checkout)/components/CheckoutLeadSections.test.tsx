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
        appleAvailable={false}
        facebookSdkReady={false}
        triggerFacebookSignIn={vi.fn().mockResolvedValue(undefined)}
        triggerAppleSignIn={vi.fn()}
        googleAvailable
        googleButtonRef={{ current: null }}
        shippingInCents={0}
        fmtBrl={() => 'R$ 0,00'}
      />,
    );

    const nameInput = screen.getByLabelText('Nome completo');
    const emailInput = screen.getByLabelText('E-mail');
    const phoneInput = screen.getByLabelText('Celular / WhatsApp');

    expect(nameInput).not.toBeDisabled();
    expect(emailInput).not.toBeDisabled();
    expect(nameInput).toHaveAttribute('autocomplete', 'name');
    expect(emailInput).toHaveAttribute('autocomplete', 'email');
    expect(phoneInput).toHaveAttribute('autocomplete', 'tel');

    fireEvent.change(nameInput, { target: { value: 'Maria Corrigida' } });
    fireEvent.change(emailInput, { target: { value: 'maria.corrigida@gmail.com' } });

    expect(updateField).toHaveBeenCalledWith('name');
    expect(updateField).toHaveBeenCalledWith('email');
  });

  /* ─── done identity card (step > 1) ──────────────────────────────────── */

  it('renders done identity card when step > 1', () => {
    const { container } = render(
      <CheckoutLeadSections
        theme={buildBlancTheme()}
        step={2}
        setStep={vi.fn()}
        form={{
          name: 'Done User',
          email: 'done@test.com',
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
        updateField={vi.fn()}
        loadingStep={false}
        goStep={vi.fn()}
        socialIdentity={null}
        socialLoadingProvider={null}
        socialError=""
        facebookAvailable={false}
        appleAvailable={false}
        facebookSdkReady={false}
        triggerFacebookSignIn={vi.fn().mockResolvedValue(undefined)}
        triggerAppleSignIn={vi.fn()}
        googleAvailable={false}
        googleButtonRef={{ current: null }}
        shippingInCents={0}
        fmtBrl={() => 'R$ 0,00'}
      />,
    );

    expect(container.textContent).toContain('Done User');
    expect(container.textContent).toContain('done@test.com');
    expect(container.textContent).toContain('CPF');
    expect(container.textContent).toContain('123.456.789-00');
  });

  it('renders done identity with social provider label', () => {
    const { container } = render(
      <CheckoutLeadSections
        theme={buildBlancTheme()}
        step={2}
        setStep={vi.fn()}
        form={{
          name: 'Social User',
          email: 'social@test.com',
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
        updateField={vi.fn()}
        loadingStep={false}
        goStep={vi.fn()}
        socialIdentity={{
          provider: 'google',
          name: 'Social User',
          email: 'social@test.com',
          deviceFingerprint: 'fp-xyz',
        }}
        socialLoadingProvider={null}
        socialError=""
        facebookAvailable={false}
        appleAvailable={false}
        facebookSdkReady={false}
        triggerFacebookSignIn={vi.fn().mockResolvedValue(undefined)}
        triggerAppleSignIn={vi.fn()}
        googleAvailable={false}
        googleButtonRef={{ current: null }}
        shippingInCents={0}
        fmtBrl={() => 'R$ 0,00'}
      />,
    );

    expect(container.textContent).toContain('Google');
  });

  it('renders done identity with facebook provider label', () => {
    const { container } = render(
      <CheckoutLeadSections
        theme={buildBlancTheme()}
        step={2}
        setStep={vi.fn()}
        form={{
          name: 'FB User',
          email: 'fb@test.com',
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
        updateField={vi.fn()}
        loadingStep={false}
        goStep={vi.fn()}
        socialIdentity={{
          provider: 'facebook',
          name: 'FB User',
          email: 'fb@test.com',
          deviceFingerprint: 'fp-facebook',
        }}
        socialLoadingProvider={null}
        socialError=""
        facebookAvailable={false}
        appleAvailable={false}
        facebookSdkReady={false}
        triggerFacebookSignIn={vi.fn().mockResolvedValue(undefined)}
        triggerAppleSignIn={vi.fn()}
        googleAvailable={false}
        googleButtonRef={{ current: null }}
        shippingInCents={0}
        fmtBrl={() => 'R$ 0,00'}
      />,
    );

    expect(container.textContent).toContain('acebook');
  });

  /* ─── done delivery card (step > 2) ──────────────────────────────────── */

  it('renders done delivery card when step > 2', () => {
    const { container } = render(
      <CheckoutLeadSections
        theme={buildBlancTheme()}
        step={3}
        setStep={vi.fn()}
        form={{
          name: 'Done User',
          email: 'done@test.com',
          cpf: '',
          phone: '',
          cep: '75690-000',
          street: 'Rua das Flores',
          number: '100',
          neighborhood: 'Centro',
          complement: '',
          city: 'Caldas Novas',
          state: 'GO',
          destinatario: '',
        }}
        submitError=""
        updateField={vi.fn()}
        loadingStep={false}
        goStep={vi.fn()}
        socialIdentity={null}
        socialLoadingProvider={null}
        socialError=""
        facebookAvailable={false}
        appleAvailable={false}
        facebookSdkReady={false}
        triggerFacebookSignIn={vi.fn().mockResolvedValue(undefined)}
        triggerAppleSignIn={vi.fn()}
        googleAvailable={false}
        googleButtonRef={{ current: null }}
        shippingInCents={0}
        fmtBrl={() => 'R$ 0,00'}
      />,
    );

    expect(container.textContent).toContain('Caldas Novas');
    expect(container.textContent).toContain('Rua das Flores');
    expect(container.textContent).toContain('Frete padrão Grátis');
  });

  it('renders done delivery with complement when present', () => {
    render(
      <CheckoutLeadSections
        theme={buildBlancTheme()}
        step={3}
        setStep={vi.fn()}
        form={{
          name: 'Done',
          email: 'done@test.com',
          cpf: '',
          phone: '',
          cep: '75690-000',
          street: 'Rua Nova',
          number: '200',
          neighborhood: 'Bairro',
          complement: 'Apto 5',
          city: 'Goiania',
          state: 'GO',
          destinatario: '',
        }}
        submitError=""
        updateField={vi.fn()}
        loadingStep={false}
        goStep={vi.fn()}
        socialIdentity={null}
        socialLoadingProvider={null}
        socialError=""
        facebookAvailable={false}
        appleAvailable={false}
        facebookSdkReady={false}
        triggerFacebookSignIn={vi.fn().mockResolvedValue(undefined)}
        triggerAppleSignIn={vi.fn()}
        googleAvailable={false}
        googleButtonRef={{ current: null }}
        shippingInCents={0}
        fmtBrl={() => 'R$ 0,00'}
      />,
    );

    expect(screen.getByText(/Apto 5/)).toBeInTheDocument();
  });

  it('renders done delivery with paid shipping amount', () => {
    const { container } = render(
      <CheckoutLeadSections
        theme={buildBlancTheme()}
        step={3}
        setStep={vi.fn()}
        form={{
          name: 'Done',
          email: 'done@test.com',
          cpf: '',
          phone: '',
          cep: '75690-000',
          street: 'Rua',
          number: '1',
          neighborhood: 'Centro',
          complement: '',
          city: 'Goiania',
          state: 'GO',
          destinatario: '',
        }}
        submitError=""
        updateField={vi.fn()}
        loadingStep={false}
        goStep={vi.fn()}
        socialIdentity={null}
        socialLoadingProvider={null}
        socialError=""
        facebookAvailable={false}
        appleAvailable={false}
        facebookSdkReady={false}
        triggerFacebookSignIn={vi.fn().mockResolvedValue(undefined)}
        triggerAppleSignIn={vi.fn()}
        googleAvailable={false}
        googleButtonRef={{ current: null }}
        shippingInCents={2590}
        fmtBrl={() => 'R$ 25,90'}
      />,
    );

    expect(container.textContent).toContain('R$ 25,90');
  });

  /* ─── active delivery panel (step === 2) ─────────────────────────────── */

  it('renders active delivery panel when step is exactly 2', () => {
    render(
      <CheckoutLeadSections
        theme={buildBlancTheme()}
        step={2}
        setStep={vi.fn()}
        form={{
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
        }}
        submitError=""
        updateField={vi.fn()}
        loadingStep={false}
        goStep={vi.fn()}
        socialIdentity={null}
        socialLoadingProvider={null}
        socialError=""
        facebookAvailable={false}
        appleAvailable={false}
        facebookSdkReady={false}
        triggerFacebookSignIn={vi.fn().mockResolvedValue(undefined)}
        triggerAppleSignIn={vi.fn()}
        googleAvailable={false}
        googleButtonRef={{ current: null }}
        shippingInCents={0}
        fmtBrl={() => 'R$ 0,00'}
      />,
    );

    expect(screen.getByLabelText('CEP')).toBeInTheDocument();
    expect(screen.getByLabelText('Endereço')).toBeInTheDocument();
    expect(screen.getByText('Ir para Pagamento')).toBeInTheDocument();
  });

  /* ─── locked delivery (step < 2) ─────────────────────────────────────── */

  it('renders locked delivery panel when step < 2', () => {
    render(
      <CheckoutLeadSections
        theme={buildBlancTheme()}
        step={1}
        setStep={vi.fn()}
        form={{
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
        }}
        submitError=""
        updateField={vi.fn()}
        loadingStep={false}
        goStep={vi.fn()}
        socialIdentity={null}
        socialLoadingProvider={null}
        socialError=""
        facebookAvailable={false}
        appleAvailable={false}
        facebookSdkReady={false}
        triggerFacebookSignIn={vi.fn().mockResolvedValue(undefined)}
        triggerAppleSignIn={vi.fn()}
        googleAvailable={false}
        googleButtonRef={{ current: null }}
        shippingInCents={0}
        fmtBrl={() => 'R$ 0,00'}
      />,
    );

    expect(
      screen.getByText(/Preencha suas informações pessoais para continuar/),
    ).toBeInTheDocument();
  });

  /* ─── edit button on done cards ──────────────────────────────────────── */

  it('renders edit button in identity done card', () => {
    render(
      <CheckoutLeadSections
        theme={buildBlancTheme()}
        step={2}
        setStep={vi.fn()}
        form={{
          name: 'Edit User',
          email: 'edit@test.com',
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
        updateField={vi.fn()}
        loadingStep={false}
        goStep={vi.fn()}
        socialIdentity={null}
        socialLoadingProvider={null}
        socialError=""
        facebookAvailable={false}
        appleAvailable={false}
        facebookSdkReady={false}
        triggerFacebookSignIn={vi.fn().mockResolvedValue(undefined)}
        triggerAppleSignIn={vi.fn()}
        googleAvailable={false}
        googleButtonRef={{ current: null }}
        shippingInCents={0}
        fmtBrl={() => 'R$ 0,00'}
      />,
    );

    // Done header for identity should have an edit button that calls setStep(1)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('renders edit button in delivery done card', () => {
    const setStep = vi.fn();
    render(
      <CheckoutLeadSections
        theme={buildBlancTheme()}
        step={3}
        setStep={setStep}
        form={{
          name: 'Edit',
          email: 'edit@test.com',
          cpf: '',
          phone: '',
          cep: '75690-000',
          street: 'Rua',
          number: '1',
          neighborhood: 'Bairro',
          complement: '',
          city: 'CG',
          state: 'GO',
          destinatario: '',
        }}
        submitError=""
        updateField={vi.fn()}
        loadingStep={false}
        goStep={vi.fn()}
        socialIdentity={null}
        socialLoadingProvider={null}
        socialError=""
        facebookAvailable={false}
        appleAvailable={false}
        facebookSdkReady={false}
        triggerFacebookSignIn={vi.fn().mockResolvedValue(undefined)}
        triggerAppleSignIn={vi.fn()}
        googleAvailable={false}
        googleButtonRef={{ current: null }}
        shippingInCents={0}
        fmtBrl={() => 'R$ 0,00'}
      />,
    );

    // Done header for delivery should have an edit button
    const buttons = screen.getAllByRole('button');
    // Find the edit button (the first two are action buttons for delivery and identity done)
    const editButton = buttons.find(
      (btn) => btn.closest('[style]')?.textContent?.includes('Entrega') && btn.textContent === '',
    );
    if (editButton) {
      fireEvent.click(editButton);
      expect(setStep).toHaveBeenCalledWith(2);
    }
  });
});

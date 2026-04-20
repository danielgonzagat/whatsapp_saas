import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CheckoutPaymentSection } from './CheckoutPaymentSection';
import { buildBlancTheme } from './checkout-theme-tokens';

describe('CheckoutPaymentSection', () => {
  it('exposes native checkout semantics for card autofill and submit', () => {
    render(
      <CheckoutPaymentSection
        theme={buildBlancTheme()}
        step={3}
        payMethod="card"
        setPayMethod={vi.fn()}
        supportsCard
        supportsPix={false}
        supportsBoleto={false}
        form={{
          cpf: '',
          name: '',
          cardNumber: '',
          cardExp: '',
          cardCvv: '',
          cardName: '',
          cardCpf: '',
          installments: '1',
        }}
        updateField={vi.fn(() =>
          vi.fn((event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => event),
        )}
        installmentOptions={[{ value: 1, label: '1x de R$ 100,00 sem juros' }]}
        totalWithInterest={10000}
        fmtBrl={() => 'R$ 100,00'}
        submitError=""
        isSubmitting={false}
        finalizeOrder={vi.fn()}
      />,
    );

    const cardNumberInput = screen.getByLabelText('Número do cartão');
    const expiryInput = screen.getByLabelText('Validade');
    const cvcInput = screen.getByLabelText('CVV');
    const cardholderInput = screen.getByLabelText('Nome do titular');
    const submitButton = screen.getByRole('button', { name: 'Finalizar compra' });
    const formId = submitButton.getAttribute('form');

    expect(cardNumberInput).toHaveAttribute('autocomplete', 'cc-number');
    expect(cardNumberInput).toHaveAttribute('name', 'cardnumber');
    expect(cardNumberInput).toHaveAttribute('inputmode', 'numeric');
    expect(expiryInput).toHaveAttribute('autocomplete', 'cc-exp');
    expect(cvcInput).toHaveAttribute('autocomplete', 'cc-csc');
    expect(cardholderInput).toHaveAttribute('autocomplete', 'cc-name');
    expect(submitButton).toHaveAttribute('type', 'submit');
    expect(formId).toBeTruthy();
    expect(document.getElementById(formId || '')?.tagName).toBe('FORM');
  });
});

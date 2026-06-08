import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MonitorStepper } from './monitor-stepper';
import { StepVendas } from './step-vendas';
import { initialForm } from './types';

describe('StepVendas', () => {
  it('identifies sales fields for autofill and accessibility tooling', () => {
    render(<StepVendas form={initialForm} updateForm={vi.fn()} />);

    const price = screen.getByRole('textbox', { name: /preco em reais/i });
    const commission = screen.getByRole('textbox', { name: /comissao de afiliado/i });
    const salesPage = screen.getByRole('textbox', { name: /url da pagina de vendas/i });
    const guarantee = screen.getByRole('combobox', { name: /periodo de garantia/i });
    const facebookPixel = screen.getByRole('textbox', { name: /facebook pixel id/i });
    const gtm = screen.getByRole('textbox', { name: /google tag manager id/i });
    const oneTimePayment = screen.getByRole('button', { name: /avista/i });
    const subscriptionPayment = screen.getByRole('button', { name: /assinatura/i });
    const standardCheckout = screen.getByRole('button', { name: /standard/i });
    const conversationalCheckout = screen.getByRole('button', { name: /conversacional/i });

    expect(price.getAttribute('id')).toBe('product-price');
    expect(price.getAttribute('name')).toBe('productPrice');
    expect(price.getAttribute('inputmode')).toBe('decimal');
    expect(oneTimePayment.getAttribute('aria-pressed')).toBe('true');
    expect(subscriptionPayment.getAttribute('aria-pressed')).toBe('false');
    expect(standardCheckout.getAttribute('aria-pressed')).toBe('true');
    expect(conversationalCheckout.getAttribute('aria-pressed')).toBe('false');
    expect(commission.getAttribute('id')).toBe('product-affiliate-commission');
    expect(commission.getAttribute('name')).toBe('productAffiliateCommission');
    expect(commission.getAttribute('inputmode')).toBe('decimal');
    expect(commission.getAttribute('min')).toBeNull();
    expect(commission.getAttribute('max')).toBeNull();
    expect(salesPage.getAttribute('id')).toBe('product-sales-page-url');
    expect(salesPage.getAttribute('name')).toBe('productSalesPageUrl');
    expect(guarantee.getAttribute('id')).toBe('product-guarantee-days');
    expect(guarantee.getAttribute('name')).toBe('productGuaranteeDays');
    expect(facebookPixel.getAttribute('id')).toBe('product-facebook-pixel-id');
    expect(facebookPixel.getAttribute('name')).toBe('productFacebookPixelId');
    expect(gtm.getAttribute('id')).toBe('product-google-tag-manager-id');
    expect(gtm.getAttribute('name')).toBe('productGoogleTagManagerId');
  });
});

describe('MonitorStepper', () => {
  it('announces compact visible step positions when physical-only steps are hidden', () => {
    render(<MonitorStepper currentStep={5} visibleSteps={[1, 2, 5, 6, 7]} />);

    expect(screen.getByLabelText('Etapa 3 de 5: Afiliacao')).toBeTruthy();
  });
});

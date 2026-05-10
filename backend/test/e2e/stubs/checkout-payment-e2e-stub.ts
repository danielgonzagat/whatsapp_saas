import { Injectable } from '@nestjs/common';
import {
  CheckoutPaymentE2EGuard,
  CheckoutPaymentE2EStubResult,
} from '../../src/checkout/checkout-payment-e2e-guard';

export function isCheckoutPaymentE2EStubEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  if (process.env.JEST_WORKER_ID) {
    return false;
  }
  if (process.env.E2E_TEST_MODE === 'true') {
    return true;
  }
  if (process.env.CHECKOUT_PAYMENT_STUB === 'true') {
    return true;
  }
  if (process.env.OPENAI_API_KEY === 'e2e-dummy-key' && !process.env.STRIPE_SECRET_KEY) {
    return true;
  }
  return false;
}

export function buildCheckoutPaymentE2EStubResult(input: {
  orderId: string;
  paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
}): CheckoutPaymentE2EStubResult {
  const intentSuffix = input.orderId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  return {
    payment: null,
    type: input.paymentMethod,
    approved: input.paymentMethod !== 'CREDIT_CARD',
    clientSecret: `pi_e2e_stub_${intentSuffix}_secret_stub`,
    paymentIntentId: `pi_e2e_stub_${intentSuffix}`,
    pixQrCode: input.paymentMethod === 'PIX' ? 'data:image/png;base64,e2e-stub' : null,
    pixCopyPaste:
      input.paymentMethod === 'PIX' ? '00020126360014BR.GOV.BCB.PIX0114E2E_STUB_COPY_PASTE' : null,
    pixExpiresAt:
      input.paymentMethod === 'PIX' ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null,
    boletoUrl: null,
    boletoBarcode: null,
    boletoExpiresAt: null,
    stub: true,
  };
}

@Injectable()
export class CheckoutPaymentE2EStubGuard implements CheckoutPaymentE2EGuard {
  isEnabled(): boolean {
    return isCheckoutPaymentE2EStubEnabled();
  }

  buildResult(input: {
    orderId: string;
    paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
  }): CheckoutPaymentE2EStubResult {
    return buildCheckoutPaymentE2EStubResult(input);
  }
}

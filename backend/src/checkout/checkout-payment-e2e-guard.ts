import { Injectable } from '@nestjs/common';

export const CHECKOUT_PAYMENT_E2E_GUARD = Symbol('CHECKOUT_PAYMENT_E2E_GUARD');

export interface CheckoutPaymentE2EStubResult {
  payment: null;
  type: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
  approved: boolean;
  clientSecret: string;
  paymentIntentId: string;
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  pixExpiresAt: string | null;
  boletoUrl: null;
  boletoBarcode: null;
  boletoExpiresAt: null;
  stub: true;
}

export interface CheckoutPaymentE2EGuard {
  isEnabled(): boolean;
  buildResult(input: {
    orderId: string;
    paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
  }): CheckoutPaymentE2EStubResult;
}

function isCheckoutPaymentE2EHarnessEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.CI === 'true' &&
    !process.env.STRIPE_SECRET_KEY
  );
}

@Injectable()
export class NoopCheckoutPaymentE2EGuard implements CheckoutPaymentE2EGuard {
  isEnabled(): boolean {
    return isCheckoutPaymentE2EHarnessEnabled();
  }

  buildResult(input: {
    orderId: string;
    paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
  }): CheckoutPaymentE2EStubResult {
    if (!this.isEnabled()) {
      throw new Error('NoopCheckoutPaymentE2EGuard.buildResult called outside e2e harness');
    }

    const pixExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    return {
      payment: null,
      type: input.paymentMethod,
      approved: false,
      clientSecret: `pi_e2e_${input.orderId}_secret_e2e`,
      paymentIntentId: `pi_e2e_${input.orderId}`,
      pixQrCode: input.paymentMethod === 'PIX' ? 'data:image/png;base64,iVBORw0KGgo=' : null,
      pixCopyPaste: input.paymentMethod === 'PIX' ? `pix-e2e-${input.orderId}` : null,
      pixExpiresAt: input.paymentMethod === 'PIX' ? pixExpiresAt : null,
      boletoUrl: null,
      boletoBarcode: null,
      boletoExpiresAt: null,
      stub: true,
    };
  }
}

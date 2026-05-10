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

@Injectable()
export class NoopCheckoutPaymentE2EGuard implements CheckoutPaymentE2EGuard {
  isEnabled(): boolean {
    return false;
  }

  buildResult(): CheckoutPaymentE2EStubResult {
    throw new Error('NoopCheckoutPaymentE2EGuard.buildResult called in production');
  }
}

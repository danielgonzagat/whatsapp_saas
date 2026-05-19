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

function isTruthyEnv(name: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').toLowerCase());
}

function hasStripeSecret(): boolean {
  return String(process.env.STRIPE_SECRET_KEY || '').trim().length > 0;
}

function isCheckoutPaymentE2EHarnessEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  if (isTruthyEnv('CHECKOUT_PAYMENT_E2E_STUB') || isTruthyEnv('E2E_CHECKOUT_PAYMENT_STUB')) {
    return true;
  }

  return process.env.CI === 'true' && !hasStripeSecret();
}

function buildCheckoutPaymentE2EStubResult(input: {
  orderId: string;
  paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
}): CheckoutPaymentE2EStubResult {
  const isPix = input.paymentMethod === 'PIX';
  const paymentIntentId = `pi_e2e_${input.orderId}`;

  return {
    payment: null,
    type: input.paymentMethod,
    approved: false,
    clientSecret: `${paymentIntentId}_secret`,
    paymentIntentId,
    pixQrCode: isPix ? 'data:image/png;base64,e2e-pix-qr' : null,
    pixCopyPaste: isPix ? `000201E2EPIX${input.orderId}` : null,
    pixExpiresAt: isPix ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null,
    boletoUrl: null,
    boletoBarcode: null,
    boletoExpiresAt: null,
    stub: true,
  };
}

@Injectable()
export class EnvCheckoutPaymentE2EGuard implements CheckoutPaymentE2EGuard {
  isEnabled(): boolean {
    return isCheckoutPaymentE2EHarnessEnabled();
  }

  buildResult(input: {
    orderId: string;
    paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
  }): CheckoutPaymentE2EStubResult {
    return buildCheckoutPaymentE2EStubResult(input);
  }
}

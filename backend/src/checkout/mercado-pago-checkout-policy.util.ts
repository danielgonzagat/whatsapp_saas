type MercadoPagoPublicCheckoutConfig = {
  provider?: string | null;
  connected?: boolean | null;
  checkoutEnabled?: boolean | null;
  unavailableReason?: string | null;
  [key: string]: unknown;
};

export const MERCADO_PAGO_AFFILIATE_UNAVAILABLE_REASON =
  'Checkout via afiliado ainda não está disponível no Mercado Pago da Kloel. Use o link direto do produtor.';

export function applyMercadoPagoPublicCheckoutRestrictions(
  paymentProvider: MercadoPagoPublicCheckoutConfig,
  options?: { hasAffiliateContext?: boolean },
) {
  if (paymentProvider?.provider !== 'mercado_pago' || !options?.hasAffiliateContext) {
    return paymentProvider;
  }

  return {
    ...paymentProvider,
    checkoutEnabled: false,
    unavailableReason: MERCADO_PAGO_AFFILIATE_UNAVAILABLE_REASON,
  };
}

export function getMercadoPagoAffiliateBlockReason(options?: { hasAffiliateContext?: boolean }) {
  return options?.hasAffiliateContext ? MERCADO_PAGO_AFFILIATE_UNAVAILABLE_REASON : null;
}

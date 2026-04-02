 
/** Stub — Mercado Pago card tokenization (not yet implemented) */
export type MercadoPagoTokenResult = {
  token: string;
  paymentMethodId: string;
  paymentType: string;
  last4: string;
};

export async function tokenizeMercadoPagoCard(
  ..._args: any[]
): Promise<MercadoPagoTokenResult | null> {
  console.warn('[mercado-pago] tokenizeMercadoPagoCard not yet implemented');
  return null;
}

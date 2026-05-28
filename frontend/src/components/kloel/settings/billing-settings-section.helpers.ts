// Pure helpers extracted from billing-settings-section.tsx to reduce the host
// component's surface area. Behaviour is identical to the original inline
// logic; no visual delta is introduced.

export type SubscriptionStatus = 'none' | 'trial' | 'active' | 'expired' | 'suspended';

export type SubscriptionTone = 'success' | 'warning' | 'danger' | 'neutral';

/** Display card shape consumed by the PaymentMethodsCard child. */
export interface BillingCard {
  id: string;
  last4?: string | undefined;
  brand?: string | undefined;
  expiry?: string | undefined;
  isDefault?: boolean | undefined;
}

/** Raw payment-method shape returned by `billingApi.getPaymentMethods()`. */
export interface RawPaymentMethod {
  id: string;
  last4?: string;
  brand?: string;
  expMonth?: number | string;
  expYear?: number | string;
  isDefault?: boolean;
}

/** Format BRL currency. Mirrors crm-settings-section.helpers `formatMoney`. */
export function formatMoney(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'R$ 0,00';
  }
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Map subscription status onto the visual pill tone. */
export function subscriptionTone(status: SubscriptionStatus): SubscriptionTone {
  if (status === 'active') {
    return 'success';
  }
  if (status === 'trial') {
    return 'warning';
  }
  if (status === 'expired' || status === 'suspended') {
    return 'danger';
  }
  return 'neutral';
}

/** PT-BR label for the subscription pill. */
export function subscriptionLabel(status: SubscriptionStatus): string {
  if (status === 'active') {
    return 'Ativo';
  }
  if (status === 'trial') {
    return 'Teste ativo';
  }
  if (status === 'expired') {
    return 'Expirado';
  }
  if (status === 'suspended') {
    return 'Suspenso';
  }
  return 'Inativo';
}

/**
 * Estimate number of messages a balance can buy (cents-to-credits ratio is
 * 100 messages per US$1 credit, matching the inline calc the section used).
 */
export function computeEstimatedMessages(creditsBalance: number): number {
  if (!Number.isFinite(creditsBalance) || creditsBalance <= 0) {
    return 0;
  }
  return Math.max(0, Math.floor(creditsBalance * 100));
}

/**
 * Compute the credits progress bar percentage (0-100, clamped). Mirrors the
 * inline `Math.max(0, Math.min(100, (creditsBalance / 5) * 100))` formula.
 */
export function computeCreditPercent(creditsBalance: number): number {
  if (!Number.isFinite(creditsBalance) || creditsBalance <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (creditsBalance / 5) * 100));
}

/** Format an exp month/year pair into the `MM/YY` form rendered on the card. */
export function formatCardExpiry(
  expMonth: RawPaymentMethod['expMonth'],
  expYear: RawPaymentMethod['expYear'],
): string {
  if (expMonth === undefined || expMonth === null || expMonth === '') {
    return '';
  }
  if (expYear === undefined || expYear === null || expYear === '') {
    return '';
  }
  return `${String(expMonth).padStart(2, '0')}/${String(expYear).slice(-2)}`;
}

/** Normalize the raw billing API response into the display card shape. */
export function mapPaymentMethods(rawMethods: ReadonlyArray<RawPaymentMethod>): BillingCard[] {
  return rawMethods.map((pm) => ({
    id: pm.id,
    last4: pm.last4,
    brand: pm.brand ? String(pm.brand).toUpperCase() : 'CARD',
    expiry: formatCardExpiry(pm.expMonth, pm.expYear),
    isDefault: !!pm.isDefault,
  }));
}

/**
 * Extract the `paymentMethods` array out of the billing API envelope without
 * trusting the wire type.
 */
export function extractRawPaymentMethods(
  envelope: { paymentMethods?: RawPaymentMethod[] } | undefined,
): RawPaymentMethod[] {
  return envelope?.paymentMethods ?? [];
}

/**
 * Mirror the original `setShowCardsFirst(scrollToCreditCard && !hasCard)`
 * derivation so the host component can stay declarative.
 */
export function shouldShowCardsFirst(scrollToCreditCard: boolean, hasCard: boolean): boolean {
  return scrollToCreditCard && !hasCard;
}

/** Window for the dashboard sales-report toggle. */
export type SalesPeriod = 'week' | 'month';

/**
 * Human-readable PT-BR label for the sales period window. The component used
 * to inline `salesPeriod === 'week' ? '7 dias' : '30 dias'`.
 */
export function salesPeriodLabel(period: SalesPeriod): string {
  return period === 'week' ? '7 dias' : '30 dias';
}

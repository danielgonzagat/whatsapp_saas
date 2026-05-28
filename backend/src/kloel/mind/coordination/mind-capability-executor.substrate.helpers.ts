/** Substrate helpers for BrainCapabilityExecutorService. */

const PCI_B17_SURFACES: ReadonlyArray<{
  readonly surface: string;
  readonly domains: readonly string[];
  /** Substrate kinds that count as REAL (non-canonical) activity today. */
  readonly partialKinds: readonly string[];
}> = [
  {
    surface: 'checkout_wallet_billing',
    domains: ['commerce.cart', 'commerce.payment'],
    partialKinds: ['sale', 'order', 'checkout', 'payment'],
  },
  {
    surface: 'crm',
    domains: ['commerce.crm', 'commerce.lead'],
    partialKinds: ['lead', 'deal', 'stage'],
  },
  {
    surface: 'whatsapp_inbox',
    domains: ['commerce.whatsapp'],
    partialKinds: ['message.received', 'message.sent', 'autopilot'],
  },
  {
    surface: 'campaigns_ads',
    domains: ['commerce.campaign'],
    partialKinds: ['campaign', 'click', 'conversion'],
  },
  {
    surface: 'member_affiliate',
    domains: ['commerce.member_area', 'commerce.affiliate'],
    partialKinds: ['member', 'affiliate', 'enroll'],
  },
  { surface: 'kyc_auth', domains: ['commerce.kyc'], partialKinds: ['kyc', 'document'] },
  {
    surface: 'post_sale',
    domains: ['commerce.post_sale'],
    partialKinds: ['delivery', 'activation', 'churn', 'testimonial', 'repurchase'],
  },
];

/** A dissolution gap derived from REAL substrate counts vs the PCI.6 contract. */
export interface DissolutionGap {
  readonly surface: string;
  readonly canonicalDomains: readonly string[];
  readonly canonicalEvents: number;
  readonly partialActivity: number;
  readonly status: 'dissolved' | 'partial' | 'silent';
}

/**
 * The PCI-grounded work queue: for each frozen B17 surface, how many
 * CANONICAL cognitive events vs raw partial activity exist in the live
 * substrate. `silent` = surface emits nothing (not dissolved); `partial`
 * = it is active but not yet emitting canonical PCI events (EVENT-EMIT
 * pending); `dissolved` = canonical cognitive events flowing. 100% real
 * counts from the workspace substrate — zero hardcode, zero synthetic.
 */
export function computeDissolutionGaps(substrateKinds: readonly string[]): DissolutionGap[] {
  const lower = substrateKinds.map((k) => k.toLowerCase());
  return PCI_B17_SURFACES.map((s) => {
    const canonicalEvents = lower.filter((k) => s.domains.some((d) => k.startsWith(d))).length;
    const partialActivity = lower.filter((k) => s.partialKinds.some((p) => k.includes(p))).length;
    const status: DissolutionGap['status'] =
      canonicalEvents > 0 ? 'dissolved' : partialActivity > 0 ? 'partial' : 'silent';
    return {
      surface: s.surface,
      canonicalDomains: s.domains,
      canonicalEvents,
      partialActivity,
      status,
    };
  });
}

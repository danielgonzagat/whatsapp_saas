export const BRAIN_EVENT_TAXONOMY = [
  'brain.decide',
  'brain.observe',
  'brain.autonomy.propose',
  'brain.capability.invoked',
  'capability.executed',
  'capability.failed',
  'sale.created',
  'sale.completed',
  'sale.refunded',
  'sale.cancelled',
  'checkout.created',
  'checkout.updated',
  'checkout.paid',
  'checkout.cancelled',
  'checkout.viewed',
  'checkout.abandoned',
  'checkout.generated',
  'message.received',
  'message.sent',
  'message.delivered',
  'message.read',
  'message.failed',
  'message.converted',
  'lead.created',
  'lead.qualified',
  'lead.transferred',
  'lead.abandoned',
  'contact.segmented',
  'product.created',
  'product.updated',
  'product.published',
  'product.deleted',
  'coupon.created',
  'coupon.updated',
  'coupon.deleted',
  'plan.created',
  'plan.updated',
  'campaign.scheduled',
  'campaign.sent',
  'campaign.clicked',
  'campaign.converted',
  'mind.decision.created',
  'mind.decision.resolved',
  'mind.prediction.created',
  'mind.prediction.resolved',
  'mind.surprise.recorded',
  'concept.detected',
  'case_memory.consulted',
  'predecided_actions.built',
  'channel.connected',
  'channel.disconnected',
  'channel.externally_blocked',
  'pipeline.state.changed',
  'pipeline.auto_fallback',
  'pipeline.shadow_recorded',
  'identity.contact.merged',
  'identity.contact.resolved',
  'identity.merge_candidate.created',
  // --- mind.* canonical aliases (ADR-0013 §4 / Wave M6) -------------------
  // These are the canonical names for the legacy event strings listed in
  // `MIND_EVENT_ALIASES` below. They are added to the taxonomy *first*, ahead
  // of emit-site migration, so SQL aggregators / decision-catalog branches /
  // mind-runtime listeners can be safely widened to accept either name
  // during the cutover window (see DEPRECATION_MAP.md rows #29–#32 and
  // docs/architecture/EVENT_TAXONOMY_KLOEL_TO_MIND_MIGRATION.md §E).
  'mind.message.received',
  'mind.action.executed',
  'mind.product.observed',
  'mind.plan.observed',
] as const;

export type BrainEventName = (typeof BRAIN_EVENT_TAXONOMY)[number];

/**
 * Legacy → canonical event-name map for the ADR-0013 §4 mind.* taxonomy
 * migration. Each key is the *legacy* event string currently emitted by the
 * backend (e.g. via `brainSpine.recordCommercial({ eventType: ... })` or
 * `eventEmitter.emit(...)`); the value is the canonical `mind.*` name that
 * will progressively replace it.
 *
 * **Alias pattern (migration strategy: "Aliased canonical")**
 *
 * 1. This file extends `BRAIN_EVENT_TAXONOMY` with the canonical names so the
 *    type system already accepts them — but **no emit call site is changed
 *    yet**. See `EVENT_TAXONOMY_KLOEL_TO_MIND_MIGRATION.md` §E for the full
 *    multi-step rollout.
 * 2. Readers that filter on event strings (SQL aggregators, NestJS
 *    `@OnEvent()` listeners, mind-runtime branches, decision-catalog
 *    matchers) should be widened to accept BOTH the legacy key and the
 *    canonical value during the transition window.
 * 3. Emit sites are migrated one file at a time in subsequent commits. Once
 *    every emit call has flipped to the canonical name and the 4-week
 *    cutover window has elapsed, the legacy strings are dropped from the
 *    taxonomy and this alias map is deleted.
 *
 * **Do not** add the inverse `canonical → legacy` direction here — alias
 * resolution is one-way (legacy → canonical) by design, so that new code
 * can be written exclusively against the canonical surface.
 *
 * @see docs/architecture/DEPRECATION_MAP.md rows #29–#32
 * @see docs/architecture/EVENT_TAXONOMY_KLOEL_TO_MIND_MIGRATION.md
 */
export const MIND_EVENT_ALIASES = {
  'message.received': 'mind.message.received',
  'capability.executed': 'mind.action.executed',
  'product.created': 'mind.product.observed',
  'plan.created': 'mind.plan.observed',
} as const satisfies Record<string, BrainEventName>;

export type MindEventLegacyName = keyof typeof MIND_EVENT_ALIASES;
export type MindEventCanonicalName = (typeof MIND_EVENT_ALIASES)[MindEventLegacyName];

export interface CommercialEventPayload {
  occurredAt: Date;
  workspaceId: string;
  subject: string;
  eventType: BrainEventName;
  contactId?: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface MessageEventPayload extends CommercialEventPayload {
  eventType: 'message.received' | 'message.sent';
  payload: {
    contentPreview: string;
    direction: 'INBOUND' | 'OUTBOUND';
    messageId: string;
    messageType: string;
    channel?: string;
  };
}

export interface SaleEventPayload extends CommercialEventPayload {
  eventType: 'sale.created' | 'sale.completed' | 'sale.refunded' | 'sale.cancelled';
  payload: {
    amount: number;
    externalPaymentId?: string;
    leadId?: string;
    paymentMethod?: string;
    productName?: string;
    status: string;
  };
}

export interface CheckoutEventPayload extends CommercialEventPayload {
  eventType:
    | 'checkout.created'
    | 'checkout.updated'
    | 'checkout.paid'
    | 'checkout.cancelled'
    | 'checkout.viewed'
    | 'checkout.abandoned'
    | 'checkout.generated';
  payload: {
    customerEmail?: string;
    orderId: string;
    paymentMethod: string;
    priceBand: string;
    status: string;
    totalInCents: number;
    utmSource?: string;
  };
}

export interface LeadEventPayload extends CommercialEventPayload {
  eventType: 'lead.created' | 'lead.qualified' | 'lead.transferred' | 'lead.abandoned';
  payload: {
    leadId: string;
    previousStatus?: string;
    source?: string;
    assignedTo?: string;
    campaignId?: string;
  };
}

export interface CampaignEventPayload extends CommercialEventPayload {
  eventType: 'campaign.scheduled' | 'campaign.sent' | 'campaign.clicked' | 'campaign.converted';
  payload: {
    campaignId: string;
    channel?: string;
    recipientCount?: number;
    templateId?: string;
  };
}

export interface ProductEventPayload extends CommercialEventPayload {
  eventType: 'product.created' | 'product.updated' | 'product.published' | 'product.deleted';
  payload: {
    productId: string;
    name: string;
    priceInCents?: number;
    format?: string;
    status?: string;
    active?: boolean;
    imageUrl?: string | null;
    changes?: string[];
  };
}

export interface CouponEventPayload extends CommercialEventPayload {
  eventType: 'coupon.created' | 'coupon.updated' | 'coupon.deleted';
  payload: {
    couponId?: string;
    productId?: string;
    code?: string;
    discountType?: string;
    discountValue?: number;
    usageLimit?: number | null;
    expiresAt?: string | null;
    changes?: string[];
  };
}

export interface ConceptEventPayload extends CommercialEventPayload {
  eventType: 'concept.detected';
  payload: {
    concept: string;
    confidence: number;
    evidence?: string;
  };
}

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
  'plan.deleted',
  'campaign.scheduled',
  'campaign.sent',
  'campaign.clicked',
  'campaign.converted',
  'inbound.received',
  'concept.detected',
  'mind.decision.created',
  'mind.decision.resolved',
  'mind.prediction.created',
  'mind.prediction.resolved',
  'mind.surprise.recorded',
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
  // --- commerce.* canonical names (ADR-0013 / Wave K58–K85) ---------------
  // Canonical domain-prefixed event names following the commerce.* taxonomy
  // defined in protocol_hub_asyncapi. Added ahead of emit-site migration so
  // listeners can be widened to accept either legacy or canonical spelling
  // during the dual-emit cutover window.
  'commerce.product.created',
  'commerce.product.updated',
  'commerce.product.published',
  'commerce.product.deleted',
  'commerce.coupon.created',
  'commerce.coupon.updated',
  'commerce.coupon.deleted',
  'commerce.plan.updated',
  'commerce.plan.deleted',
  'commerce.lead.created',
  'commerce.whatsapp.message_received',
  'commerce.campaign.scheduled',
  'commerce.sale.created',
  'commerce.concept.detected',
  'commerce.inbound.received',
  // --- cognition.* canonical names for pipeline/identity routing events ----
  // Wrong-domain 3-segment events corrected to cognition.* prefix
  // (ADR-0013 / Wave K58–K85). Legacy names kept in taxonomy during the
  // dual-emit window; see MIND_EVENT_ALIASES below.
  'cognition.pipeline.state_changed',
  'cognition.pipeline.shadow_recorded',
  'cognition.pipeline.auto_fallback',
  'cognition.identity.contact_resolved',
  'cognition.case_memory.consulted',
  'cognition.predecided.actions_built',
] as const;

export type MindEventName = (typeof BRAIN_EVENT_TAXONOMY)[number];

/**
 * @deprecated Use {@link MindEventName} instead. Retained as a backwards-compat
 * alias during the ADR-0013 Brain → Mind naming sweep.
 */
export type BrainEventName = MindEventName;

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
  // --- mind.* aliases (ADR-0013 §4 / Wave M6) — original 4 entries ---------
  'message.received': 'mind.message.received',
  'capability.executed': 'mind.action.executed',
  'product.created': 'mind.product.observed',
  'plan.created': 'mind.plan.observed',
  // --- commerce.* aliases (ADR-0013 / Wave K58–K85) — 15 legacy → canonical -
  // Bare event names (no domain prefix) emitted by product.service.ts,
  // plan.service.ts, and various emitters are aliased to their canonical
  // commerce.* counterparts. During the dual-emit window BOTH names fire so
  // downstream readers (SQL aggregators, @OnEvent listeners, decision-catalog
  // branches) can migrate at their own pace. Once all emit sites have been
  // flipped to the canonical name these entries are removed.
  'product.updated': 'commerce.product.updated',
  'product.published': 'commerce.product.published',
  'product.deleted': 'commerce.product.deleted',
  'plan.updated': 'commerce.plan.updated',
  'plan.deleted': 'commerce.plan.deleted',
  'sale.created': 'commerce.sale.created',
  'coupon.created': 'commerce.coupon.created',
  'lead.created': 'commerce.lead.created',
  'campaign.scheduled': 'commerce.campaign.scheduled',
  'inbound.received': 'commerce.inbound.received',
  'concept.detected': 'commerce.concept.detected',
  // --- cognition.* aliases — wrong-domain 3-segment events -----------------
  // These events were emitted under a bare `pipeline.*` or `identity.*`
  // prefix without a true domain qualifier. The correct domain is
  // `cognition.*` (they are orchestrator/routing internal events, not
  // commerce events). Dual-emit window: old string fires first, canonical
  // fires alongside. MindEventSpine.recordCommercial call sites in
  // admin-pipeline.service.ts are updated to emit the canonical name.
  'pipeline.state.changed': 'cognition.pipeline.state_changed',
  'pipeline.shadow_recorded': 'cognition.pipeline.shadow_recorded',
  'pipeline.auto_fallback': 'cognition.pipeline.auto_fallback',
  'identity.contact.resolved': 'cognition.identity.contact_resolved',
  // Snake_case orchestrator telemetry events emitted by
  // commercial-decision-orchestrator/telemetry.ts. Corrected to the cognition.*
  // domain prefix (they are decision-pipeline internal events). Dual-emit
  // window: telemetry.ts flips to the canonical name; the mind-observability
  // AutopilotEvent `action` WHERE-filters are widened via expandEventNameAliases
  // so historical rows tagged with the legacy snake_case action still match.
  'case_memory.consulted': 'cognition.case_memory.consulted',
  'predecided_actions.built': 'cognition.predecided.actions_built',
} as const satisfies Record<string, MindEventName>;

export type MindEventLegacyName = keyof typeof MIND_EVENT_ALIASES;
export type MindEventCanonicalName = (typeof MIND_EVENT_ALIASES)[MindEventLegacyName];

/**
 * Reverse lookup table: canonical `mind.*` name → legacy event string. Computed
 * once at module-load so consumer code (SQL aggregators, decision-catalog
 * branches, `readReplayEvents` filters) can expand a canonical filter into the
 * union of both spellings during the cutover window without recomputing the
 * inverse on every call.
 *
 * Direction is canonical → legacy by design. `MIND_EVENT_ALIASES` itself stays
 * legacy → canonical (the only direction emit-site migration needs).
 *
 * @internal — exported for `expandEventNameAliases` only.
 */
const MIND_EVENT_LEGACY_BY_CANONICAL: Readonly<
  Record<MindEventCanonicalName, MindEventLegacyName>
> = Object.freeze(
  Object.entries(MIND_EVENT_ALIASES).reduce<Record<string, string>>((acc, [legacy, canonical]) => {
    acc[canonical] = legacy;
    return acc;
  }, {}) as Record<MindEventCanonicalName, MindEventLegacyName>,
);

/**
 * Resolve a (possibly legacy) event name to its canonical `mind.*` form. Returns
 * the input unchanged when the name has no alias mapping (canonical name itself,
 * or an unrelated event).
 *
 * **One-way only**: `'product.created' → 'mind.product.observed'`. The inverse
 * direction is intentionally not exposed at the public API surface — consumers
 * that need to match both spellings should use {@link expandEventNameAliases}
 * instead, which returns the union as an array suitable for SQL `IN (...)` /
 * `Prisma.in` filters.
 *
 * @example
 * ```ts
 * resolveCanonicalEventName('product.created') // 'mind.product.observed'
 * resolveCanonicalEventName('mind.product.observed') // 'mind.product.observed'
 * resolveCanonicalEventName('sale.created') // 'sale.created' (untouched)
 * ```
 */
export function resolveCanonicalEventName(name: MindEventName): MindEventName {
  if (Object.prototype.hasOwnProperty.call(MIND_EVENT_ALIASES, name)) {
    return MIND_EVENT_ALIASES[name as MindEventLegacyName];
  }
  return name;
}

/**
 * Expand a single event name into the dual-name array required to match both
 * the legacy and canonical spellings during the ADR-0013 §4 cutover window.
 * Used by consumer-side filters (e.g. `readReplayEvents` Prisma `in` clauses)
 * so a caller asking for canonical `mind.product.observed` automatically also
 * receives historical rows still tagged with the legacy `product.created`.
 *
 * - Legacy input: returns `[legacy, canonical]` (length 2).
 * - Canonical input: returns `[canonical, legacy]` (length 2).
 * - Unrelated input: returns `[name]` (length 1, identity).
 *
 * Order is `[input, alias]` so the caller's original intent is preserved at
 * index 0 — useful for logs / debug ordering.
 *
 * @example
 * ```ts
 * expandEventNameAliases('product.created')        // ['product.created', 'mind.product.observed']
 * expandEventNameAliases('mind.product.observed')  // ['mind.product.observed', 'product.created']
 * expandEventNameAliases('sale.created')           // ['sale.created']
 * ```
 */
export function expandEventNameAliases(name: MindEventName): MindEventName[] {
  if (Object.prototype.hasOwnProperty.call(MIND_EVENT_ALIASES, name)) {
    return [name, MIND_EVENT_ALIASES[name as MindEventLegacyName]];
  }
  if (Object.prototype.hasOwnProperty.call(MIND_EVENT_LEGACY_BY_CANONICAL, name)) {
    return [name, MIND_EVENT_LEGACY_BY_CANONICAL[name as MindEventCanonicalName]];
  }
  return [name];
}

/**
 * Expand an array of event names so every legacy/canonical alias pair is
 * represented in the output. De-duplicates so the result is safe to use as a
 * Prisma `in: [...]` filter. Stable order: the first occurrence of each name
 * wins (input ordering is preserved for primary entries; aliases append in
 * iteration order).
 *
 * @example
 * ```ts
 * expandEventNameAliasesAll(['product.created', 'plan.created'])
 * // → ['product.created', 'mind.product.observed', 'plan.created', 'mind.plan.observed']
 * ```
 */
export function expandEventNameAliasesAll(names: readonly MindEventName[]): MindEventName[] {
  const seen = new Set<MindEventName>();
  const out: MindEventName[] = [];
  for (const name of names) {
    for (const expanded of expandEventNameAliases(name)) {
      if (!seen.has(expanded)) {
        seen.add(expanded);
        out.push(expanded);
      }
    }
  }
  return out;
}

export interface CommercialEventPayload {
  occurredAt: Date;
  workspaceId: string;
  subject: string;
  eventType: MindEventName;
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

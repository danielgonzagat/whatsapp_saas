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
  'identity.merge_candidate.created',
] as const;

export type BrainEventName = (typeof BRAIN_EVENT_TAXONOMY)[number];

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
  eventType: 'product.created';
  payload: {
    productId: string;
    name: string;
    priceInCents?: number;
  };
}

export interface BrainEventPayload extends CommercialEventPayload {
  eventType: 'brain.decide' | 'brain.observe' | 'brain.autonomy.propose';
  payload: Record<string, unknown>;
}

export interface MindEventPayload extends CommercialEventPayload {
  eventType:
    | 'mind.decision.created'
    | 'mind.decision.resolved'
    | 'mind.prediction.created'
    | 'mind.prediction.resolved'
    | 'mind.surprise.recorded';
  payload: {
    decisionId?: string;
    predictionId?: string;
    confidence?: number;
    domain?: string;
  };
}

export interface CapabilityEventPayload extends CommercialEventPayload {
  eventType: 'capability.executed' | 'capability.failed';
  payload: {
    capabilityId: string;
    errorMessage?: string;
    durationMs?: number;
  };
}

export interface ContactEventPayload extends CommercialEventPayload {
  eventType: 'contact.segmented';
  payload: {
    contactId: string;
    segmentKey: string;
    segmentValue: string;
  };
}

export interface ChannelEventPayload extends CommercialEventPayload {
  eventType: 'channel.connected' | 'channel.disconnected' | 'channel.externally_blocked';
  payload: {
    channelId: string;
    channelType: string;
    reason?: string;
  };
}

export interface IdentityEventPayload extends CommercialEventPayload {
  eventType: 'identity.contact.merged' | 'identity.merge_candidate.created';
  payload: {
    sourceContactId: string;
    targetContactId: string;
    confidence?: number;
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

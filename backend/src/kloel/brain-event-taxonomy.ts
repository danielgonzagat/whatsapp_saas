export const BRAIN_EVENT_TAXONOMY = [
  'brain.decide',
  'brain.observe',
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
  'channel.connected',
  'channel.disconnected',
  'channel.externally_blocked',
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
    | 'checkout.abandoned';
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

import type { MindEventName } from './mind-event-taxonomy';

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
    couponId: string;
    code?: string;
    productId?: string;
    discountType?: string;
    discountValue?: number;
    status?: string;
    active?: boolean;
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

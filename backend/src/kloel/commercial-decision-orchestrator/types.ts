import type { PredecidedAction } from '../unified-agent.types';

export type ConceptRow = { concept: string; confidence?: number };

export type InboundOrchestrationInput = {
  channel: string;
  contactId?: string;
  conversationId?: string;
  message: string;
  workspaceId: string;
};

export type InboundDecision = {
  actions: PredecidedAction[];
  concepts: string[];
  trace: Record<string, unknown>;
};

export type InternalReplyPlan = {
  aggressiveness: string;
  concept: string;
  couponAction?: string;
  productOffer?: string;
  setup?: { arsenalCount: number; productCount: number; tone?: string | null };
  tone: string;
};

export function normalizeChannel(channel: string): string {
  return String(channel || 'whatsapp').trim().toLowerCase();
}

export function primaryConcept(rows: ConceptRow[]): string {
  return rows[0]?.concept || 'general';
}

export function hasConcept(rows: ConceptRow[], concept: string): boolean {
  return rows.some((row) => row.concept === concept);
}

export function priceBandFor(text: string): string {
  const normalized = text.toLowerCase();
  if (/\b(1000|mil|premium|alto valor)\b/.test(normalized)) return 'over_500';
  if (/\b(300|500|caro|pre[cç]o)\b/.test(normalized)) return 'over_300';
  return 'unknown';
}

export function discountPercentFromCoupon(action?: string): number | undefined {
  if (action === 'coupon_5') return 5;
  if (action === 'coupon_10') return 10;
  if (action === 'coupon_15') return 15;
  if (action === 'coupon_20') return 20;
  return undefined;
}

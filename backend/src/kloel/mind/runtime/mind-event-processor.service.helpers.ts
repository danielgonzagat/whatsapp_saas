import { messageTemplate, toStableString } from '../policy/mind-decision-baselines';
import type { MindPerceptEvent } from '../../mind.types';

/**
 * Pure helpers extracted from MindEventProcessorService.
 *
 * Every function here is side-effect free, has no NestJS dependencies, and is
 * unit-testable in isolation. The service composes these helpers; behavior
 * must remain byte-identical to the inlined logic.
 */

export interface MindEventProcessResult {
  beliefsUpdated: number;
  predicted: number;
  resolved: number;
  surpriseTotal: number;
}

export type MindEventProcessAccumulator = MindEventProcessResult;

export const CONVERSION_CLOSED_STATUSES = new Set([
  'CANCELED',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
  'REFUNDED',
]);

export const AUTOPILOT_SUCCESS_INTENTS = new Set([
  'lead_qualified',
  'meeting_booked',
  'purchase_intent',
]);

export function createEmptyResult(): MindEventProcessAccumulator {
  return {
    predicted: 0,
    resolved: 0,
    surpriseTotal: 0,
    beliefsUpdated: 0,
  };
}

/**
 * Apply a surprise scalar to an accumulator using the canonical semantics:
 * only positive surprises bump `resolved`, `beliefsUpdated`, and `surpriseTotal`.
 */
export function applySurprise(result: MindEventProcessAccumulator, surprise: number): void {
  if (surprise > 0) {
    result.resolved += 1;
    result.beliefsUpdated += 1;
    result.surpriseTotal += surprise;
  }
}

/**
 * Build the feature payload for `predictReply` from a `message.sent` event.
 */
export function buildMessageSentFeatures(event: MindPerceptEvent): {
  channel: string;
  hour: number;
  template: string;
} {
  return {
    channel: toStableString(event.payload.channel) || 'unknown',
    hour: event.occurredAt.getHours(),
    template: messageTemplate(event.payload),
  };
}

/**
 * Build the feature payload for `predictConversion` from a checkout-start event.
 */
export function buildCheckoutStartFeatures(event: MindPerceptEvent): {
  channel: string;
  hour: number;
  price_band: string;
  segment: string;
} {
  return {
    channel: 'checkout',
    hour: event.occurredAt.getHours(),
    price_band: toStableString(event.payload.priceBand) || 'under_100',
    segment: toStableString(event.payload.utmSource) || 'direct',
  };
}

/**
 * Extract the inbound message text from a `message.received` / `message.replied`
 * event payload, normalising `content` / `message` keys and string conversion.
 */
export function extractMessageReceivedText(event: MindPerceptEvent): string {
  return toStableString(event.payload.content ?? event.payload.message ?? '');
}

/**
 * Determine if a non-paid `checkout.*` event represents a closed/failed funnel.
 * Returns true for `checkout.expired` or when the payload status maps to a
 * canonical closed status.
 */
export function isCheckoutClosedFailure(event: MindPerceptEvent): boolean {
  if (!event.kind.startsWith('checkout.') || event.kind === 'checkout.paid') {
    return false;
  }
  const status = toStableString(event.payload.status).toUpperCase();
  return event.kind === 'checkout.expired' || CONVERSION_CLOSED_STATUSES.has(status);
}

/**
 * Derive `outcome` (0|1) and the surprise predicate for autopilot success
 * intents. Returns `null` when the intent is not recognised as success.
 */
export function autopilotSuccessOutcome(
  intent: string,
): { outcome: 0 | 1; predicate: string } | null {
  if (!AUTOPILOT_SUCCESS_INTENTS.has(intent)) {
    return null;
  }
  return intent === 'purchase_intent'
    ? { outcome: 1, predicate: 'P(conversion|segment,price_band,channel,hour)' }
    : { outcome: 0, predicate: 'P(reply|template,hour,channel)' };
}

/**
 * Map a MIND-internal tool intent to a high-level category for belief upserts.
 * Returns `'generic'` for unknown tools so the caller always records a belief.
 */
export function classifyToolCategory(toolName: string): string {
  if (
    toolName.startsWith('create_product') ||
    toolName.startsWith('update_product') ||
    toolName.startsWith('delete_product')
  ) {
    return 'product';
  }
  if (
    toolName.startsWith('create_plan') ||
    toolName.startsWith('update_plan') ||
    toolName.startsWith('delete_plan')
  ) {
    return 'plan';
  }
  if (
    toolName.startsWith('create_checkout') ||
    toolName.startsWith('update_checkout') ||
    toolName.startsWith('delete_checkout')
  ) {
    return 'checkout';
  }
  if (
    toolName.startsWith('create_coupon') ||
    toolName.startsWith('update_coupon') ||
    toolName.startsWith('delete_coupon')
  ) {
    return 'coupon';
  }
  if (
    toolName.startsWith('create_payment') ||
    toolName.startsWith('generate_pix') ||
    toolName.startsWith('generate_boleto')
  ) {
    return 'payment';
  }
  if (toolName.startsWith('create_order') || toolName.startsWith('list_orders')) {
    return 'sale';
  }
  if (
    toolName.startsWith('get_wallet') ||
    toolName.startsWith('request_withdrawal') ||
    toolName.startsWith('request_anticipation')
  ) {
    return 'wallet';
  }
  if (toolName.startsWith('search_agent') || toolName.startsWith('list_leads')) {
    return 'crm';
  }
  if (
    toolName.startsWith('git_') ||
    toolName.startsWith('code_') ||
    toolName.startsWith('codegraph_') ||
    toolName.startsWith('search_codebase')
  ) {
    return 'code';
  }
  if (
    toolName.startsWith('get_settings') ||
    toolName.startsWith('update_fiscal') ||
    toolName.startsWith('toggle_theme')
  ) {
    return 'config';
  }
  if (
    toolName.startsWith('configure_') ||
    toolName.startsWith('update_affiliate') ||
    toolName.startsWith('browse_marketplace')
  ) {
    return 'marketing';
  }
  if (
    toolName.startsWith('get_sales') ||
    toolName.startsWith('get_analytics') ||
    toolName.startsWith('get_nps') ||
    toolName.startsWith('get_churn') ||
    toolName.startsWith('get_abandon')
  ) {
    return 'analytics';
  }
  if (
    toolName.startsWith('add_url') ||
    toolName.startsWith('update_url') ||
    toolName.startsWith('delete_url') ||
    toolName.startsWith('get_product_urls')
  ) {
    return 'url';
  }
  if (toolName.startsWith('list_subscriptions') || toolName.startsWith('get_product_reviews')) {
    return 'operations';
  }
  return 'generic';
}

/**
 * Resolve a binary outcome (0|1) from a commercial event payload. Honours
 * explicit `outcome` flags (boolean or `0`) and falls back to a status-based
 * negative list. Defaults to success (`1`).
 */
export function outcomeFromPayload(event: MindPerceptEvent): 0 | 1 {
  if (event.payload.outcome === 0 || event.payload.outcome === false) {
    return 0;
  }
  const status = toStableString(event.payload.status).toLowerCase();
  if (['failed', 'cancelled', 'canceled', 'lost', 'unresolved'].includes(status)) {
    return 0;
  }
  return 1;
}

/**
 * Shared types for the MIND family (UTP-MIND-*).
 *
 * Implements the in-process cognitive substrate that consumes spine events
 * and produces derived state for the ABI builder.
 *
 * Wired to the spine via repositories — in-memory implementations live in
 * each service's own file; Prisma-backed implementations land in later
 * UTPs as needed.
 */

import type { AbiValence } from '../abi/abi-schema';

/**
 * A canonical-shape spine event reference (subset of the universal envelope
 * defined by PCI.1 §4) — sufficient for in-process MIND services.
 */
export interface SpineEventRef {
  readonly eventId: string;
  readonly eventName: string;
  readonly workspaceId?: string;
  readonly entityRef?: { readonly entityType: string; readonly entityId: string };
  readonly occurredAt: string;
  readonly truthMode: 'observed' | 'inferred' | 'projected';
  readonly valence?: AbiValence;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
}

/**
 * Whether an event is terminal — terminal events MUST carry a valence per
 * PCI.5 §3 / B7. The terminal classification lives here as a single source
 * of truth; every MIND service that cares uses this function.
 */
const TERMINAL_EVENT_NAMES: ReadonlySet<string> = new Set([
  // commerce.payment.*
  'commerce.payment.approved',
  'commerce.payment.declined',
  'commerce.payment.refunded',
  'commerce.payment.charged_back',
  // commerce.crm.*
  'commerce.crm.deal_won',
  'commerce.crm.deal_lost',
  // commerce.lead.*
  'commerce.lead.qualified',
  'commerce.lead.lost',
  'commerce.lead.converted',
  // commerce.kyc.*
  'commerce.kyc.approved',
  'commerce.kyc.rejected',
  // commerce.member_area.*
  'commerce.member_area.enrolled',
  'commerce.member_area.dropped_out',
  // commerce.post_sale.*
  'commerce.post_sale.first_value_obtained',
  'commerce.post_sale.churn_risk_detected',
  'commerce.post_sale.win_back_window_opened',
]);

export function isTerminalEvent(eventName: string): boolean {
  return TERMINAL_EVENT_NAMES.has(eventName);
}

/**
 * Default valence map for terminal events — used by the auto-tagger when an
 * upstream emitter forgot to declare valence on a terminal event.
 */
const DEFAULT_TERMINAL_VALENCE: ReadonlyMap<string, AbiValence> = new Map([
  ['commerce.payment.approved', 'positive'],
  ['commerce.payment.declined', 'negative'],
  ['commerce.payment.refunded', 'negative'],
  ['commerce.payment.charged_back', 'negative'],
  ['commerce.crm.deal_won', 'positive'],
  ['commerce.crm.deal_lost', 'negative'],
  ['commerce.lead.qualified', 'positive'],
  ['commerce.lead.lost', 'negative'],
  ['commerce.lead.converted', 'positive'],
  ['commerce.kyc.approved', 'positive'],
  ['commerce.kyc.rejected', 'negative'],
  ['commerce.member_area.enrolled', 'positive'],
  ['commerce.member_area.dropped_out', 'negative'],
  ['commerce.post_sale.first_value_obtained', 'positive'],
  ['commerce.post_sale.churn_risk_detected', 'negative'],
  ['commerce.post_sale.win_back_window_opened', 'neutral'],
]);

export function defaultValenceFor(eventName: string): AbiValence | undefined {
  return DEFAULT_TERMINAL_VALENCE.get(eventName);
}

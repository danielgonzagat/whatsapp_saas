/**
 * UTP-HEALTHYMONEY-004 — Support Cost Projector.
 *
 * Projects support cost burden from handoff frequency, objection
 * patterns, and churn risk signals. Estimates ticket count and
 * handle time to produce per-sale cost projection.
 *
 * Implements B0.7: custo de suporte projetado como redutor de
 * qualidade de receita.
 */
import type { SpineEventRef } from '../mind/mind.types';
import type { SupportCostProjection } from './healthy-money.types';
import { countEvents } from './healthy-money.types';

export interface SupportCostInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly approvedCount: number;
  readonly nowMs: number;
}

const ESTIMATED_COST_PER_TICKET_CENTS = 500;
const ESTIMATED_MINUTES_PER_TICKET = 8;
const ESTIMATED_MINUTES_PER_HANDOFF = 3;

export function projectSupportCost(input: SupportCostInput): SupportCostProjection {
  const handoffs = countEvents(input.events, 'commerce.whatsapp.handoff_to_human');
  const objections = countEvents(input.events, 'commerce.lead.objection_raised');
  const refunded = countEvents(input.events, 'commerce.payment.refunded');
  const chargedBack = countEvents(input.events, 'commerce.payment.charged_back');

  const expectedTicketCount = handoffs + Math.ceil(objections * 0.4) + refunded + chargedBack;

  const estimatedHandleTimeMinutes =
    handoffs * ESTIMATED_MINUTES_PER_HANDOFF + expectedTicketCount * ESTIMATED_MINUTES_PER_TICKET;

  const estimatedSupportCostCents = expectedTicketCount * ESTIMATED_COST_PER_TICKET_CENTS;

  const supportCostPerSaleCents =
    input.approvedCount > 0
      ? Math.round(estimatedSupportCostCents / input.approvedCount)
      : estimatedSupportCostCents;

  const costDrivers: string[] = [];
  if (handoffs > 0) {
    costDrivers.push('handoff_frequency');
  }
  if (objections > 5) {
    costDrivers.push('objection_volume');
  }
  if (refunded > 0) {
    costDrivers.push('refund_processing');
  }
  if (chargedBack > 0) {
    costDrivers.push('chargeback_disputes');
  }

  return {
    workspaceId: input.workspaceId,
    estimatedSupportCostCents,
    supportCostPerSaleCents,
    expectedTicketCount,
    estimatedHandleTimeMinutes,
    costDrivers,
    projectedAt: new Date(input.nowMs).toISOString(),
  };
}

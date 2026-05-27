/**
 * UTP-MATURITY-001 — Commercial Maturity Signals Collector.
 *
 * Pure function over spine events that produces a SignalSummary.
 * Extracts aggregated commercial metrics from the event stream
 * within an observation window (default 30 days).
 *
 * This is Camada VIII's input layer — it distills raw events into
 * structured signals that the classifier consumes.
 */
import type { SpineEventRef } from '../mind/mind.types';
import type { SignalSummary } from './maturity.types';

const DEFAULT_WINDOW_DAYS = 30;
const MS_PER_DAY = 86_400_000;

interface WorkspaceCounters {
  uniqueLeadIds: Set<string>;
  paymentApproved: number;
  paymentRefunded: number;
  dealWon: number;
  dealLost: number;
  churnDetected: number;
  handoffToHuman: number;
  campaignEvents: number;
  productIds: Set<string>;
  uniquePayerIds: Set<string>;
  repeatPayerIds: Set<string>;
}

export function collectMaturitySignals(input: {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly nowMs: number;
  readonly windowDays?: number;
}): SignalSummary {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const cutoffMs = input.nowMs - windowDays * MS_PER_DAY;

  const counters: WorkspaceCounters = {
    uniqueLeadIds: new Set(),
    paymentApproved: 0,
    paymentRefunded: 0,
    dealWon: 0,
    dealLost: 0,
    churnDetected: 0,
    handoffToHuman: 0,
    campaignEvents: 0,
    productIds: new Set(),
    uniquePayerIds: new Set(),
    repeatPayerIds: new Set(),
  };

  const payerPaymentCounts = new Map<string, number>();

  for (const e of input.events) {
    if (!isInWindow(e.occurredAt, cutoffMs)) {continue;}

    switch (e.eventName) {
      case 'commerce.lead.created': {
        const id = e.entityRef?.entityId;
        if (id) {counters.uniqueLeadIds.add(id);}
        break;
      }
      case 'commerce.payment.approved': {
        counters.paymentApproved++;
        const payerId = payloadString(e.payload, 'payerId') ??
          payloadString(e.payload, 'customerId');
        if (payerId) {
          counters.uniquePayerIds.add(payerId);
          const prev = payerPaymentCounts.get(payerId) ?? 0;
          payerPaymentCounts.set(payerId, prev + 1);
          if (prev >= 1) {counters.repeatPayerIds.add(payerId);}
        }
        break;
      }
      case 'commerce.payment.refunded': {
        counters.paymentRefunded++;
        break;
      }
      case 'commerce.crm.deal_won': {
        counters.dealWon++;
        break;
      }
      case 'commerce.crm.deal_lost': {
        counters.dealLost++;
        break;
      }
      case 'commerce.post_sale.churn_risk_detected': {
        counters.churnDetected++;
        break;
      }
      case 'commerce.whatsapp.handoff_to_human': {
        counters.handoffToHuman++;
        break;
      }
      case 'commerce.campaign.clicked':
      case 'commerce.campaign.conversion_associated':
      case 'commerce.campaign.audience_reached': {
        counters.campaignEvents++;
        break;
      }
      default:
        break;
    }

    const pid = payloadString(e.payload, 'productId');
    if (pid) {counters.productIds.add(pid);}
  }

  const totalPayerIds = counters.uniquePayerIds.size;
  const repeatPaymentRate =
    totalPayerIds > 0 ? counters.repeatPayerIds.size / totalPayerIds : 0;

  const churnRate =
    counters.paymentApproved > 0
      ? counters.churnDetected / counters.paymentApproved
      : 0;

  const refundRate =
    counters.paymentApproved > 0
      ? counters.paymentRefunded / counters.paymentApproved
      : 0;

  const totalDeals = counters.dealWon + counters.dealLost;
  const dealsClosedRate = totalDeals > 0 ? counters.dealWon / totalDeals : 0;

  const supportToSalesRatio =
    counters.paymentApproved > 0
      ? counters.handoffToHuman / counters.paymentApproved
      : 0;

  const productCount = Math.min(counters.productIds.size, 1);

  const conversionsPerMonth =
    windowDays > 0
      ? Math.round((counters.paymentApproved / windowDays) * 30)
      : counters.paymentApproved;

  return {
    conversionsPerMonth,
    uniqueLeads: counters.uniqueLeadIds.size,
    repeatPaymentRate: round2(repeatPaymentRate),
    churnRate: round2(churnRate),
    productCount,
    campaignCount: counters.campaignEvents,
    refundRate: round2(refundRate),
    dealsClosedRate: round2(dealsClosedRate),
    supportToSalesRatio: round2(supportToSalesRatio),
    observationWindowDays: windowDays,
    workspaceId: input.workspaceId,
  };
}

function isInWindow(occurredAt: string, cutoffMs: number): boolean {
  if (!occurredAt) {return false;}
  const ms = Date.parse(occurredAt);
  return !Number.isNaN(ms) && ms >= cutoffMs;
}

function payloadString(
  payload: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  if (!payload) {return undefined;}
  const v = payload[key];
  return typeof v === 'string' ? v : undefined;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

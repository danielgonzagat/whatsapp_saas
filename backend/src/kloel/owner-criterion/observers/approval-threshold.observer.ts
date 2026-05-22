/**
 * UTP-OWNER-CRIT-006 — Approval Threshold Observer.
 *
 * Observes owner approval thresholds: when does the owner let the
 * system act autonomously vs when does the owner step in? Measures
 * auto-approval rate, manual override rate, and infers threshold
 * levels per domain (autopilot, CRM, campaigns, etc.).
 *
 * Pure function — takes SpineEventRef[] and returns
 * ApprovalThresholdObservation[].
 */

import { randomUUID } from 'node:crypto';
import type { SpineEventRef } from '../../mind/mind.types';
import type {
  ApprovalThresholdObservation,
  ObserverInput,
  ThresholdDomain,
  ThresholdLevel,
} from '../owner-criterion.types';

const MIN_EVENTS = 3;

interface DomainStats {
  readonly domain: ThresholdDomain;
  readonly autoApprovals: number;
  readonly manualOverrides: number;
  readonly evidenceEventIds: string[];
}

function extractAutopilotStats(events: readonly SpineEventRef[]): DomainStats {
  let autoApprovals = 0;
  let manualOverrides = 0;
  const ids: string[] = [];

  for (const e of events) {
    if (e.eventName === 'commerce.whatsapp.message_replied') {
      const payload = e.payload as Record<string, unknown> | undefined;
      if (payload?.['sender'] === 'autopilot') {
        autoApprovals++;
      } else {
        manualOverrides++;
      }
      ids.push(e.eventId);
    }
    if (e.eventName === 'commerce.whatsapp.handoff_to_human') {
      manualOverrides++;
      ids.push(e.eventId);
    }
  }

  return {
    domain: 'autopilot_auto_reply',
    autoApprovals,
    manualOverrides,
    evidenceEventIds: ids,
  };
}

function extractCRMStats(events: readonly SpineEventRef[]): DomainStats {
  let autoApprovals = 0;
  let manualOverrides = 0;
  const ids: string[] = [];

  for (const e of events) {
    if (e.eventName === 'commerce.crm.stage_changed') {
      const payload = e.payload as Record<string, unknown> | undefined;
      if (payload?.['triggeredBy'] === 'autopilot') {
        autoApprovals++;
      } else {
        manualOverrides++;
      }
      ids.push(e.eventId);
    }
    if (e.eventName === 'commerce.crm.deal_won') {
      autoApprovals++;
      ids.push(e.eventId);
    }
    if (e.eventName === 'commerce.crm.deal_lost') {
      manualOverrides++;
      ids.push(e.eventId);
    }
  }

  return {
    domain: 'deal_advancement',
    autoApprovals,
    manualOverrides,
    evidenceEventIds: ids,
  };
}

function extractPaymentStats(events: readonly SpineEventRef[]): DomainStats {
  let autoApprovals = 0;
  let manualOverrides = 0;
  const ids: string[] = [];

  for (const e of events) {
    if (e.eventName === 'commerce.payment.approved') {
      autoApprovals++;
      ids.push(e.eventId);
    }
    if (e.eventName === 'commerce.payment.declined') {
      manualOverrides++;
      ids.push(e.eventId);
    }
    if (e.eventName === 'commerce.payment.refunded') {
      manualOverrides++;
      ids.push(e.eventId);
    }
  }

  return {
    domain: 'payment_processing',
    autoApprovals,
    manualOverrides,
    evidenceEventIds: ids,
  };
}

function extractCampaignStats(events: readonly SpineEventRef[]): DomainStats {
  let autoApprovals = 0;
  let manualOverrides = 0;
  const ids: string[] = [];

  for (const e of events) {
    if (e.eventName === 'commerce.campaign.audience_reached') {
      autoApprovals++;
      ids.push(e.eventId);
    }
    if (e.eventName === 'commerce.campaign.creative_swapped') {
      const payload = e.payload as Record<string, unknown> | undefined;
      if (payload?.['swappedBy'] === 'owner') {
        manualOverrides++;
      } else {
        autoApprovals++;
      }
      ids.push(e.eventId);
    }
    if (e.eventName === 'commerce.campaign.performance_drop_detected') {
      autoApprovals++;
      ids.push(e.eventId);
    }
  }

  return {
    domain: 'campaign_launch',
    autoApprovals,
    manualOverrides,
    evidenceEventIds: ids,
  };
}

function inferThresholdLevel(
  autoRate: number,
  overrideRate: number,
): ThresholdLevel {
  if (autoRate >= 0.8 && overrideRate <= 0.2) return 'low';
  if (autoRate >= 0.5 && overrideRate <= 0.5) return 'medium';
  if (autoRate >= 0.2) return 'high';
  return 'manual_only';
}

function computeConfidence(totalActions: number): number {
  if (totalActions >= 20) return 0.9;
  if (totalActions >= 10) return 0.7;
  if (totalActions >= 5) return 0.5;
  return 0.35;
}

function buildObservation(
  workspaceId: string,
  stats: DomainStats,
  nowMs: number,
): ApprovalThresholdObservation {
  const total = stats.autoApprovals + stats.manualOverrides;
  const autoRate = total > 0 ? stats.autoApprovals / total : 0;
  const overrideRate = total > 0 ? stats.manualOverrides / total : 0;

  return {
    observationId: `app_${randomUUID()}`,
    workspaceId,
    thresholdDomain: stats.domain,
    thresholdLevel: inferThresholdLevel(autoRate, overrideRate),
    confidence: computeConfidence(total),
    autoApprovalRate: Math.round(autoRate * 100) / 100,
    manualOverrideRate: Math.round(overrideRate * 100) / 100,
    observedAt: new Date(nowMs).toISOString(),
    evidenceEventIds: stats.evidenceEventIds,
  };
}

/**
 * Observe owner approval thresholds from spine events.
 *
 * Input: ObserverInput
 * Output: ApprovalThresholdObservation[] — one per domain with sufficient data
 */
export function observeApprovalThresholds(
  input: ObserverInput,
): ApprovalThresholdObservation[] {
  const observations: ApprovalThresholdObservation[] = [];

  const domains: DomainStats[] = [
    extractAutopilotStats(input.events),
    extractCRMStats(input.events),
    extractPaymentStats(input.events),
    extractCampaignStats(input.events),
  ];

  for (const stats of domains) {
    const total = stats.autoApprovals + stats.manualOverrides;
    if (total >= MIN_EVENTS) {
      observations.push(
        buildObservation(input.workspaceId, stats, input.nowMs),
      );
    }
  }

  return observations;
}

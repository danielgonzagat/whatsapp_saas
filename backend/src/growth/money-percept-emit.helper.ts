import type { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isMoneyPerceptEmitEnabled } from './money-percept-emit.flag';
import {
  emitPerceptToMindSpine,
  type OutboxPrismaDelegate,
} from '../kloel/mind/coordination/percept-emit.factory';

/**
 * Canonical cognition event type for a Money Machine *lead scan* — a workspace's
 * money engine sweeping its contacts for reactivation opportunities. Mirrors the
 * `cognition.*` taxonomy used across the spine (see `flows-percept-emit.helper`
 * / `voice-percept-emit.helper`).
 */
export const MONEY_LEAD_SCAN_EVENT_TYPE = 'cognition.money.lead_scan';

/**
 * Canonical cognition event type for a Money Machine *campaign generation* — the
 * money engine deciding to auto-generate a reactivation campaign (+ flow). This
 * IS the campaign-generation-as-decision record: `MindEventSpine.recordCommercial`
 * maps the outbox event into a commercial decision row the Mind perceives.
 */
export const MONEY_CAMPAIGN_GENERATED_EVENT_TYPE = 'cognition.money.campaign_generated';

export interface MoneyLeadScanPerceptParams {
  readonly workspaceId: string;
  /** Number of inactive (>30d) leads the scan found (best-effort metric). */
  readonly inactiveLeads: number;
  /**
   * Stable idempotency anchor for THIS scan — distinct scans of the same
   * workspace must not collapse into one percept. Callers pass a per-activation
   * scan id (e.g. a fresh UUID) so each `activate()` run records its own scan.
   */
  readonly scanId: string;
}

export interface MoneyCampaignGeneratedPerceptParams {
  readonly workspaceId: string;
  /** The persisted Campaign id (subject + idempotency anchor). */
  readonly campaignId: string;
  /** The Flow id created to back the campaign (best-effort context). */
  readonly flowId: string;
  /** Number of inactive leads that justified the campaign (best-effort metric). */
  readonly inactiveLeads: number;
}

/**
 * Emit ONE canonical `cognition.money.lead_scan` percept into the durable spine
 * outbox (`RAC_MindOutboxEvent`) when the Money Machine scans a workspace's
 * leads for reactivation opportunities.
 *
 * ADDITIVE + flag-gated (`KLOEL_MONEY_PERCEPT_ENABLED`, DEFAULT OFF) +
 * best-effort: when the flag is OFF this is a synchronous no-op (no DB call, no
 * behavior change). When ON, the write is wrapped in try/catch with a warn-log
 * so it can NEVER break the legacy Money Machine scan or alter its outputs. The
 * emit is idempotent per (workspaceId, scanId): the unique
 * `(workspaceId, idempotencyKey)` constraint upserts the single percept rather
 * than duplicating it on a retry.
 *
 * Returns `true` when a percept write was attempted (flag ON + workspace
 * present), `false` otherwise — lets callers/tests assert flag-OFF stays inert.
 */
export async function emitMoneyLeadScanPercept(
  prisma: OutboxPrismaDelegate,
  logger: Pick<Logger, 'warn'>,
  params: MoneyLeadScanPerceptParams,
): Promise<boolean> {
  if (!isMoneyPerceptEmitEnabled() || !params.workspaceId) {
    return false;
  }

  const idempotencyKey = `cognition.money.lead_scan:${params.scanId}`;
  const subject = `money:scan:${params.scanId}`;
  const payload: Prisma.InputJsonObject = {
    scanId: params.scanId,
    inactiveLeads: params.inactiveLeads,
  };

  await emitPerceptToMindSpine(prisma, logger, {
    eventType: MONEY_LEAD_SCAN_EVENT_TYPE,
    workspaceId: params.workspaceId,
    subject,
    idempotencyKey,
    payload,
    failureLog: (formattedError) =>
      `Money lead-scan percept emit failed (workspaceId=${params.workspaceId}, ` +
      `scanId=${params.scanId}); the Money Machine scan succeeded and is ` +
      `unaffected: ${formattedError}`,
  });

  return true;
}

/**
 * Emit ONE canonical `cognition.money.campaign_generated` percept into the
 * durable spine outbox (`RAC_MindOutboxEvent`) when the Money Machine
 * auto-generates a reactivation campaign. This is the
 * campaign-generation-as-decision record the Mind perceives via
 * `MindEventSpine.recordCommercial`. Same ADDITIVE / flag-gated / best-effort
 * contract as {@link emitMoneyLeadScanPercept}; idempotent per
 * (workspaceId, campaignId).
 */
export async function emitMoneyCampaignGeneratedPercept(
  prisma: OutboxPrismaDelegate,
  logger: Pick<Logger, 'warn'>,
  params: MoneyCampaignGeneratedPerceptParams,
): Promise<boolean> {
  if (!isMoneyPerceptEmitEnabled() || !params.workspaceId) {
    return false;
  }

  const idempotencyKey = `cognition.money.campaign_generated:${params.campaignId}`;
  const subject = `money:campaign:${params.campaignId}`;
  const payload: Prisma.InputJsonObject = {
    campaignId: params.campaignId,
    flowId: params.flowId,
    inactiveLeads: params.inactiveLeads,
    decisionType: 'money_machine.reactivation',
    chosenAction: 'generate_campaign',
  };

  await emitPerceptToMindSpine(prisma, logger, {
    eventType: MONEY_CAMPAIGN_GENERATED_EVENT_TYPE,
    workspaceId: params.workspaceId,
    subject,
    idempotencyKey,
    payload,
    failureLog: (formattedError) =>
      `Money campaign-generated percept emit failed (workspaceId=${params.workspaceId}, ` +
      `campaignId=${params.campaignId}); the Money Machine campaign + flow ` +
      `write succeeded and is unaffected: ${formattedError}`,
  });

  return true;
}

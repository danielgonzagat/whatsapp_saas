import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type {
  ChurnRiskAssessment,
  ChurnSignalKind,
  DetectionInput,
} from './postsale-consumers.types';
import { clamp, daysSince, filterByWorkspace } from './postsale-consumers.types';

const RISK_WINDOW_DAYS = 30;
const CRITICAL_INACTIVITY_DAYS = 30;
const HIGH_INACTIVITY_DAYS = 14;
const MODERATE_INACTIVITY_DAYS = 7;

const PROCESSOR_NAME = 'churn-risk-detector';
const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

@Injectable()
export class ChurnRiskDetector {
  private readonly logger = new Logger(ChurnRiskDetector.name);

  public constructor(private readonly spine: SpineEmitterService) {}

  public async assess(input: DetectionInput): Promise<ChurnRiskAssessment> {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);
    const entityRef = input.entityRef ?? { entityType: 'customer', entityId: 'unknown' };
    const contributingSignals: ChurnSignalKind[] = [];
    let riskProbability = 0;

    let daysSinceLastActivity = Infinity;
    for (const e of wsEvents) {
      const d = daysSince(e.occurredAt, nowMs);
      if (d < daysSinceLastActivity) {
        daysSinceLastActivity = d;
      }
    }
    if (!Number.isFinite(daysSinceLastActivity)) {
      daysSinceLastActivity = 0;
    }

    if (daysSinceLastActivity > CRITICAL_INACTIVITY_DAYS) {
      riskProbability += 0.4;
      contributingSignals.push('inactivity');
    } else if (daysSinceLastActivity > HIGH_INACTIVITY_DAYS) {
      riskProbability += 0.25;
      contributingSignals.push('inactivity');
    } else if (daysSinceLastActivity > MODERATE_INACTIVITY_DAYS) {
      riskProbability += 0.1;
      contributingSignals.push('inactivity');
    }

    const handoffCount = wsEvents.filter(
      (e) =>
        e.eventName === 'commerce.whatsapp.handoff_to_human' &&
        daysSince(e.occurredAt, nowMs) < RISK_WINDOW_DAYS,
    ).length;
    if (handoffCount >= 3) {
      riskProbability += 0.2;
      contributingSignals.push('handoff_repeat');
    }

    const refundCount = wsEvents.filter(
      (e) =>
        e.eventName === 'commerce.payment.refunded' &&
        daysSince(e.occurredAt, nowMs) < RISK_WINDOW_DAYS,
    ).length;
    if (refundCount > 0) {
      riskProbability += 0.2;
      contributingSignals.push('refund_request');
    }

    const declinedCount = wsEvents.filter(
      (e) =>
        e.eventName === 'commerce.payment.declined' &&
        daysSince(e.occurredAt, nowMs) < RISK_WINDOW_DAYS,
    ).length;
    if (declinedCount > 0) {
      riskProbability += 0.15;
      contributingSignals.push('declined_payment');
    }

    const satisfaction = this.findLastEvent(
      wsEvents,
      'commerce.post_sale.satisfaction_signal_observed',
    );
    if (
      satisfaction &&
      satisfaction.payload?.['sentimentLabel'] === 'negative' &&
      daysSince(satisfaction.occurredAt, nowMs) < RISK_WINDOW_DAYS
    ) {
      riskProbability += 0.15;
      contributingSignals.push('negative_nps');
    }

    const dropout = this.findLastEvent(wsEvents, 'commerce.member_area.dropped_out');
    if (dropout && daysSince(dropout.occurredAt, nowMs) < RISK_WINDOW_DAYS) {
      riskProbability += 0.15;
      contributingSignals.push('member_dropout');
    }

    const firstValue = this.findLastEvent(wsEvents, 'commerce.post_sale.first_value_obtained');
    if (!firstValue || daysSince(firstValue.occurredAt, nowMs) > RISK_WINDOW_DAYS) {
      riskProbability += 0.1;
    }

    riskProbability = clamp(riskProbability, 0, 1);

    const riskLevel: ChurnRiskAssessment['riskLevel'] =
      riskProbability >= 0.7
        ? 'critical'
        : riskProbability >= 0.5
          ? 'high'
          : riskProbability >= 0.3
            ? 'moderate'
            : 'low';

    const primarySignal = contributingSignals.length > 0 ? contributingSignals[0] : undefined;

    if (riskLevel === 'high' || riskLevel === 'critical') {
      await this.emitRisk(input.workspaceId, entityRef, riskProbability, contributingSignals);
    }

    return {
      workspaceId: input.workspaceId,
      entityRef,
      riskLevel,
      riskProbability: Math.round(riskProbability * 100) / 100,
      primarySignal,
      contributingSignals,
      daysSinceLastActivity: Math.round(daysSinceLastActivity),
      assessedAt: new Date(nowMs).toISOString(),
    };
  }

  private findLastEvent(
    events: readonly {
      eventName: string;
      occurredAt: string;
      payload?: Readonly<Record<string, unknown>>;
    }[],
    name: string,
  ):
    | { eventName: string; occurredAt: string; payload?: Readonly<Record<string, unknown>> }
    | undefined {
    let last:
      | { eventName: string; occurredAt: string; payload?: Readonly<Record<string, unknown>> }
      | undefined;
    for (const e of events) {
      if (e.eventName !== name) {
        continue;
      }
      if (!last || e.occurredAt > last.occurredAt) {
        last = e;
      }
    }
    return last;
  }

  private async emitRisk(
    workspaceId: string,
    entityRef: { readonly entityType: string; readonly entityId: string },
    probability: number,
    signals: readonly ChurnSignalKind[],
  ): Promise<void> {
    try {
      await this.spine.emit({
        eventName: 'commerce.post_sale.churn_risk_detected',
        workspaceId,
        entityRef,
        truthMode: 'inferred',
        provenance: {
          source: 'production',
          processor: PROCESSOR_NAME,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: { riskProbability: probability, signals },
      });
    } catch (err: unknown) {
      this.logger.error(
        `failed to emit churn_risk_detected for ws ${workspaceId}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }
}

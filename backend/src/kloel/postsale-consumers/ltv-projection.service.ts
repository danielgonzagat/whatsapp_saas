import { Injectable } from '@nestjs/common';
import type { LtvProjection, DetectionInput } from './postsale-consumers.types';
import { clamp, daysSince, filterByWorkspace } from './postsale-consumers.types';

const PROJECTION_MONTHS = 24;
const DEFAULT_CHURN_RATE = 0.05;
const OBSERVATION_WINDOW_DAYS = 90;

@Injectable()
export class LtvProjectionService {
  public project(
    input: DetectionInput,
    cohortKey: string,
    averageRevenueCents?: number,
    churnRateOverride?: number,
  ): LtvProjection {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);

    const cohortEvents = wsEvents.filter(
      (e) => daysSince(e.occurredAt, nowMs) < OBSERVATION_WINDOW_DAYS,
    );

    const cohortSize = this.uniqueEntityCount(cohortEvents);

    const revenue = averageRevenueCents ?? this.computeAverageRevenue(cohortEvents);
    const churnRate = churnRateOverride ?? this.computeChurnRate(cohortEvents);
    const clampedChurn = clamp(churnRate, 0, 1);

    let projectedLtv = 0;
    let retainedFraction = 1;
    for (let m = 0; m < PROJECTION_MONTHS; m++) {
      projectedLtv += revenue * retainedFraction;
      retainedFraction *= 1 - clampedChurn;
    }

    const growthRate = this.computeGrowthRate(cohortEvents);
    const confidence = this.computeConfidence(cohortEvents.length, clampedChurn);

    return {
      workspaceId: input.workspaceId,
      cohortKey,
      cohortSize,
      averageRevenueCents: Math.round(revenue),
      projectedLtvCents: Math.round(projectedLtv),
      projectedLtvMonths: PROJECTION_MONTHS,
      confidence: Math.round(confidence * 100) / 100,
      growthRate: Math.round(growthRate * 10000) / 10000,
      assessedAt: new Date(nowMs).toISOString(),
    };
  }

  public projectByChurnLevels(
    events: readonly { eventName: string; occurredAt: string; payload?: Readonly<Record<string, unknown>>; entityRef?: { readonly entityType: string; readonly entityId: string }; workspaceId?: string }[],
    workspaceId: string,
    cohortKey: string,
    nowMs?: number,
  ): readonly LtvProjection[] {
    const input: DetectionInput = { events: events as readonly Parameters<typeof filterByWorkspace>[0], workspaceId, nowMs };
    const low = this.project(input, `${cohortKey}_low_churn`, undefined, 0.02);
    const mid = this.project(input, `${cohortKey}_mid_churn`, undefined, 0.05);
    const high = this.project(input, `${cohortKey}_high_churn`, undefined, 0.10);
    return [low, mid, high];
  }

  private uniqueEntityCount(events: readonly { entityRef?: { readonly entityType: string; readonly entityId: string } }[]): number {
    const ids = new Set(
      events
        .map((e) => e.entityRef?.entityId)
        .filter((id): id is string => id !== undefined),
    );
    return ids.size || events.length;
  }

  private computeAverageRevenue(
    events: readonly { eventName: string; payload?: Readonly<Record<string, unknown>> }[],
  ): number {
    const paymentEvents = events.filter(
      (e) => e.eventName === 'commerce.payment.approved',
    );
    if (paymentEvents.length === 0) return 0;

    let total = 0;
    for (const e of paymentEvents) {
      const amount = e.payload?.['amountCents'];
      if (typeof amount === 'number' && Number.isFinite(amount)) {
        total += amount;
      }
    }
    return total / paymentEvents.length;
  }

  private computeChurnRate(
    events: readonly { eventName: string }[],
  ): number {
    const paymentCount = events.filter(
      (e) => e.eventName === 'commerce.payment.approved',
    ).length;
    const refundCount = events.filter(
      (e) => e.eventName === 'commerce.payment.refunded',
    ).length;
    const churnSignals = events.filter(
      (e) => e.eventName === 'commerce.post_sale.churn_risk_detected',
    ).length;

    const rawRate =
      paymentCount > 0
        ? (refundCount + churnSignals * 0.5) / paymentCount
        : DEFAULT_CHURN_RATE;

    return clamp(rawRate, 0, 1);
  }

  private computeGrowthRate(
    events: readonly { occurredAt: string }[],
  ): number {
    const nowMs = Date.now();
    const firstHalf = events.filter(
      (e) =>
        daysSince(e.occurredAt, nowMs) < OBSERVATION_WINDOW_DAYS &&
        daysSince(e.occurredAt, nowMs) >= OBSERVATION_WINDOW_DAYS / 2,
    ).length;
    const secondHalf = events.filter(
      (e) => daysSince(e.occurredAt, nowMs) < OBSERVATION_WINDOW_DAYS / 2,
    ).length;

    if (firstHalf === 0) return 0;
    return (secondHalf - firstHalf) / firstHalf;
  }

  private computeConfidence(eventCount: number, churnRate: number): number {
    if (eventCount < 10) return 0.1;
    if (eventCount < 50) return 0.3;
    if (churnRate > 0.3) return 0.2;
    return clamp(eventCount / 200, 0.3, 0.95);
  }
}

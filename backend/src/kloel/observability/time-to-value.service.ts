import { Injectable, Logger } from '@nestjs/common';

const LEAD_CREATED = 'commerce.lead.created' as const;

const VALUE_CONFIRMED_EVENTS = new Set<string>([
  'commerce.payment.approved',
  'commerce.post_sale.first_value_obtained',
  'commerce.crm.deal_won',
]);

export interface WorkspaceTimeToValue {
  readonly workspaceId: string;
  readonly leadCreatedAt: string;
  readonly valueConfirmedAt: string;
  readonly valueEventName: string;
  readonly durationMs: number;
}

export interface TimeToValueDistribution {
  readonly entries: readonly WorkspaceTimeToValue[];
  readonly count: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly meanMs: number;
  readonly medianMs: number;
  readonly p75Ms: number;
  readonly p90Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
}

interface WorkspaceState {
  leadCreatedAt: Date;
  valueConfirmedAt: Date | null;
  valueEventName: string | null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * (p / 100)) - 1;
  return sorted[Math.max(0, idx)];
}

function computeMedian(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

@Injectable()
export class TimeToValueService {
  private readonly logger = new Logger(TimeToValueService.name);
  private readonly store = new Map<string, WorkspaceState>();

  recordEvent(
    workspaceId: string,
    eventName: string,
    occurredAt: Date,
  ): void {
    if (eventName === LEAD_CREATED) {
      const existing = this.store.get(workspaceId);
      if (existing) {
        const isEpochMarker = existing.leadCreatedAt.getTime() === 0;
        if (isEpochMarker || occurredAt < existing.leadCreatedAt) {
          existing.leadCreatedAt = occurredAt;
        }
      } else {
        this.store.set(workspaceId, {
          leadCreatedAt: occurredAt,
          valueConfirmedAt: null,
          valueEventName: null,
        });
      }
      return;
    }

    if (VALUE_CONFIRMED_EVENTS.has(eventName)) {
      const existing = this.store.get(workspaceId);
      if (existing) {
        if (
          existing.valueConfirmedAt === null ||
          occurredAt < existing.valueConfirmedAt
        ) {
          existing.valueConfirmedAt = occurredAt;
          existing.valueEventName = eventName;
        }
      } else {
        this.store.set(workspaceId, {
          leadCreatedAt: new Date(0),
          valueConfirmedAt: occurredAt,
          valueEventName: eventName,
        });
      }
      return;
    }

    this.logger.debug(
      `Event "${eventName}" is not tracked by TimeToValueService`,
    );
  }

  getTimeToValueMs(workspaceId: string): number | null {
    const state = this.store.get(workspaceId);
    if (!state) return null;
    if (state.valueConfirmedAt === null) return null;
    if (state.leadCreatedAt.getTime() === 0) return null;
    return state.valueConfirmedAt.getTime() - state.leadCreatedAt.getTime();
  }

  getMedianTimeToValueMs(): number {
    const durations = this.collectDurations();
    return computeMedian(durations);
  }

  getDistribution(): TimeToValueDistribution {
    const entries: WorkspaceTimeToValue[] = [];
    for (const [workspaceId, state] of this.store.entries()) {
      if (this.getTimeToValueMs(workspaceId) !== null) {
        entries.push({
          workspaceId,
          leadCreatedAt: state.leadCreatedAt.toISOString(),
          valueConfirmedAt: state.valueConfirmedAt!.toISOString(),
          valueEventName: state.valueEventName!,
          durationMs: this.getTimeToValueMs(workspaceId)!,
        });
      }
    }
    entries.sort((a, b) => a.durationMs - b.durationMs);
    const durations = entries.map((e) => e.durationMs);
    return {
      entries,
      count: durations.length,
      minMs: durations.length > 0 ? durations[0] : 0,
      maxMs: durations.length > 0 ? durations[durations.length - 1] : 0,
      meanMs:
        durations.length > 0
          ? durations.reduce((sum, d) => sum + d, 0) / durations.length
          : 0,
      medianMs: computeMedian(durations),
      p75Ms: percentile(durations, 75),
      p90Ms: percentile(durations, 90),
      p95Ms: percentile(durations, 95),
      p99Ms: percentile(durations, 99),
    };
  }

  private collectDurations(): number[] {
    const durations: number[] = [];
    for (const workspaceId of this.store.keys()) {
      const ttv = this.getTimeToValueMs(workspaceId);
      if (ttv !== null) {
        durations.push(ttv);
      }
    }
    return durations.sort((a, b) => a - b);
  }
}

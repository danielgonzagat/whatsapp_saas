import { Injectable } from '@nestjs/common';
import type {
  AggregatedLedgerEntry,
  LedgerAggregationInput,
  LedgerEventEntry,
} from './commem.types';
import { eventDomain, workspaceFilter, eventsInWindow } from './commem.types';
import type { SpineEventRef } from '../mind/mind.types';

@Injectable()
export class CommemLedgerService {
  public aggregate(input: LedgerAggregationInput): AggregatedLedgerEntry {
    const scoped = workspaceFilter(input.events, input.workspaceId);
    const timed = eventsInWindow(scoped, input.windowStartMs, input.windowEndMs);

    const entries: LedgerEventEntry[] = timed.map((e) => ({
      eventId: e.eventId,
      eventName: e.eventName,
      workspaceId: input.workspaceId,
      occurredAt: e.occurredAt,
      truthMode: e.truthMode,
      ...(e.valence !== undefined ? { valence: e.valence } : {}),
      ...(e.entityRef !== undefined ? { entityRef: e.entityRef } : {}),
      ...(e.correlationId !== undefined ? { correlationId: e.correlationId } : {}),
      ...(e.payload !== undefined ? { payload: e.payload } : {}),
    }));

    const domainBreakdown: Record<string, number> = {};
    const truthModeBreakdown: Record<string, number> = {};

    for (const e of entries) {
      const domain = eventDomain(e.eventName);
      domainBreakdown[domain] = (domainBreakdown[domain] ?? 0) + 1;
      truthModeBreakdown[e.truthMode] = (truthModeBreakdown[e.truthMode] ?? 0) + 1;
    }

    return {
      sequence: input.minSequence ?? 0,
      workspaceId: input.workspaceId,
      windowStartMs: input.windowStartMs,
      windowEndMs: input.windowEndMs,
      eventCount: entries.length,
      events: entries,
      domainBreakdown,
      truthModeBreakdown,
    };
  }

  public aggregateMultiWindow(
    events: readonly SpineEventRef[],
    workspaceId: string,
    windowSizeMs: number,
    totalWindowMs: number,
  ): readonly AggregatedLedgerEntry[] {
    const scoped = workspaceFilter(events, workspaceId);
    const nowMs = Date.now();
    const startMs = nowMs - totalWindowMs;
    const results: AggregatedLedgerEntry[] = [];

    for (let wStart = startMs; wStart < nowMs; wStart += windowSizeMs) {
      const wEnd = Math.min(wStart + windowSizeMs, nowMs);
      results.push(
        this.aggregate({
          events: scoped,
          workspaceId,
          windowStartMs: wStart,
          windowEndMs: wEnd,
          minSequence: results.length,
        }),
      );
    }

    return results;
  }
}
